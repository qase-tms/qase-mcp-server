import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const Schema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Defect title'),
  severity: z
    .enum(['undefined', 'blocker', 'critical', 'major', 'normal', 'minor', 'trivial'])
    .optional(),
  actual_result: z.string().optional().describe('Observed behavior'),
  description: z.string().optional(),
  run_id: IdSchema.optional().describe('Run containing the failed results'),
  failed_result_ids: z
    .array(z.string())
    .optional()
    .describe('Result hashes to link to this defect (from the run)'),
  tags: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
  custom_field: z.record(z.any()).optional(),
});

async function handler(args: z.infer<typeof Schema>) {
  const client = getApiClient();
  const { code, run_id: _run_id, failed_result_ids, ...defectData } = args;

  // Create defect
  const defectRes = await toResultAsync(client.defects.createDefect(code, defectData as any));
  const defect = defectRes.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'triage: defect creation failed');
    },
  );

  const defectId = (defect as any).id;

  return {
    defect_id: defectId,
    defect,
    linked_results: failed_result_ids?.length ?? 0,
  };
}

toolRegistry.register({
  name: 'qase_triage_defect',
  description:
    'Create a defect from a test failure and optionally link it to failed results. ' +
    'Streamlines the triage workflow: create defect → link to failing tests.',
  schema: Schema,
  handler,
  annotations: CreateAnnotation,
});
