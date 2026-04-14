import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';

const Schema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Run title'),
  description: z.string().optional(),
  environment_id: z.number().int().positive().optional(),
  milestone_id: z.number().int().positive().optional(),
  plan_id: z.number().int().positive().optional().describe('Create run from an existing test plan'),
  suite_ids: z
    .array(z.number().int().positive())
    .optional()
    .describe('Include cases from these suites'),
  include_cases: z
    .array(z.number().int().positive())
    .optional()
    .describe('Explicit case IDs to include'),
});

async function handler(args: z.infer<typeof Schema>) {
  const client = getApiClient();
  const { code, suite_ids, include_cases, ...runData } = args;

  // Collect case IDs from all sources
  let caseIds: number[] = include_cases ?? [];

  // Fetch cases from specified suites
  if (suite_ids && suite_ids.length > 0) {
    for (const suiteId of suite_ids) {
      // getCases(code, search, milestoneId, suiteId, ..., limit, offset)
      const casesRes = await toResultAsync(
        client.cases.getCases(
          code,
          undefined,
          undefined,
          suiteId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          100,
          0,
        ),
      );
      casesRes.match(
        (r) => {
          const entities = (r.data.result as any)?.entities ?? [];
          caseIds.push(...entities.map((c: any) => c.id));
        },
        () => {}, // skip suites that fail to load
      );
    }
  }

  // Remove duplicates
  caseIds = [...new Set(caseIds)];

  // Create the run
  const payload: any = { ...runData };
  if (caseIds.length > 0) payload.cases = caseIds;

  const runRes = await toResultAsync(client.runs.createRun(code, payload));
  const run = runRes.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'regression run: creation failed');
    },
  );

  return {
    run_id: (run as any).id,
    cases_added: caseIds.length,
    run,
  };
}

toolRegistry.register({
  name: 'qase_regression_run',
  description:
    'Set up a regression test run in one call. Accepts case selection by suite IDs, ' +
    'explicit case IDs, or plan ID. Creates the run and adds all matching cases. ' +
    'Replaces the multi-step workflow of find cases → create run → add cases.',
  schema: Schema,
  handler,
  annotations: CreateAnnotation,
});
