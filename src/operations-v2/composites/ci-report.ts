import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';

const CaseResultSchema = z.object({
  case_id: z.number().int().positive(),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped', 'invalid']),
  comment: z.string().optional(),
  time_ms: z.number().int().min(0).optional(),
  stacktrace: z.string().optional(),
  defect: z.boolean().optional(),
  attachments: z.array(z.string()).optional(),
});

const Schema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Run title (e.g., "CI Build #1234")'),
  environment_id: z.number().int().positive().optional(),
  results: z.array(CaseResultSchema).min(1).describe('Test results to record'),
  complete: z
    .boolean()
    .optional()
    .default(true)
    .describe('Complete the run after recording results (default: true)'),
  is_autotest: z
    .boolean()
    .optional()
    .default(true)
    .describe('Mark as automated run (default: true)'),
});

async function handler(args: z.infer<typeof Schema>) {
  const client = getApiClient();
  const { code, title, environment_id, results, complete, is_autotest } = args;

  // Step 1: Create run
  const runPayload: any = {
    title,
    is_autotest,
    cases: results.map((r) => r.case_id),
  };
  if (environment_id) runPayload.environment_id = environment_id;

  const runRes = await toResultAsync(client.runs.createRun(code, runPayload));
  const run = runRes.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'CI report: run creation failed');
    },
  );

  const runId = (run as any).id;

  // Step 2: Bulk record results
  const bulkRes = await toResultAsync(
    client.results.createResultBulk(code, runId, { results: results as any }),
  );
  bulkRes.match(
    () => {},
    (e) => {
      throw createToolError(e, 'CI report: result recording failed');
    },
  );

  // Step 3: Complete run (optional)
  let runStatus = 'active';
  if (complete) {
    const completeRes = await toResultAsync(client.runs.completeRun(code, runId));
    completeRes.match(
      () => {
        runStatus = 'complete';
      },
      () => {
        runStatus = 'complete_failed'; // non-critical — run exists, results recorded
      },
    );
  }

  return {
    run_id: runId,
    run_status: runStatus,
    results_recorded: results.length,
  };
}

toolRegistry.register({
  name: 'qase_ci_report',
  description:
    'Report CI/CD test results in one call: creates a run, records all results, and ' +
    'optionally completes the run. Replaces the 3-4 step manual workflow of ' +
    'create_run → bulk_create_results → complete_run. Designed for CI pipeline integration.',
  schema: Schema,
  handler,
  annotations: CreateAnnotation,
});
