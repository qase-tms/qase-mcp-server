import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { normalizeEnumFields } from '../../utils/case-enums.js';
import { toolRegistry, CreateAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';
import { TriageDefectOutput } from '../../utils/output-schemas.js';
import { richResult, summaryBlock, dataBlock } from '../../utils/rich-response.js';

const Schema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Defect title'),
  // title, actual_result, and severity are all required by POST /v1/defect/{code} —
  // marking them optional here only produced requests the API rejects.
  severity: z
    .enum(['undefined', 'blocker', 'critical', 'major', 'normal', 'minor', 'trivial'])
    .describe('Required by the API'),
  actual_result: z.string().describe('Observed behavior. Required by the API'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  attachments: z
    .array(z.string())
    .optional()
    .describe('Attachment hashes from qase_attachment_upload'),
  custom_field: z.record(z.any()).optional(),
});

async function handler(args: z.infer<typeof Schema>) {
  const client = getApiClient();
  const { code, ...rest } = args;
  // Same as qase_defect_upsert: the API wants severity as a numeric ID and
  // rejects the label with a bare "Data is invalid".
  const defectData = await normalizeEnumFields(rest, ['severity']);

  // Create defect
  const defectRes = await toResultAsync(client.defects.createDefect(code, defectData as any));
  const defect = defectRes.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'triage: defect creation failed');
    },
  );

  const defectId = (defect as any).id;

  const severityIcon: Record<string, string> = {
    blocker: '🔴',
    critical: '🟠',
    major: '🟡',
    normal: '🔵',
    minor: '⚪',
    trivial: '⚪',
  };
  const icon = severityIcon[args.severity || ''] || '🔵';

  const lines = [
    `## ${icon} Defect Created: ${args.title}`,
    '',
    `- **Defect ID:** ${defectId}`,
    `- **Project:** ${code}`,
    `- **Severity:** ${args.severity}`,
  ];

  if (args.actual_result) {
    lines.push('', '**Actual result:**', `> ${args.actual_result}`);
  }

  const structured = { defect_id: defectId, defect };

  return richResult([summaryBlock(lines.join('\n')), dataBlock(structured)], structured);
}

toolRegistry.register({
  name: 'qase_triage_defect',
  description:
    'Create a defect from a test failure, with the failure context written into it. Requires ' +
    'title, actual_result and severity — the API rejects a defect missing any of the three. ' +
    'Note: the API offers no way to attach existing runs or results to a defect. The runs and ' +
    'results seen on a defect in the UI are populated by the test runner when it reports a ' +
    'result as a defect, so there is nothing to pass here for that — reference the failing ' +
    'results inside actual_result instead, and do not expect a link to appear. For a defect ' +
    'unrelated to a test failure use qase_defect_upsert. Cost: one API call, about 0.5s. ' +
    'Triaging a whole run means ' +
    'one call per defect, so cluster identical failures and file one defect per distinct cause ' +
    'rather than one per failed test.',
  schema: Schema,
  handler,
  annotations: CreateAnnotation,
  outputSchema: TriageDefectOutput,
});
