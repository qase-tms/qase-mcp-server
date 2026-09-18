import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const CONTEXT = 'result operation';

/**
 * The bulk endpoint takes 200 results per request. Rejected here rather than
 * split into chunks: results are append-only, so a batch that fails half way
 * cannot be rolled back, and the obvious retry records the first chunk twice
 * and leaves the run with a wrong pass rate. qase_ci_report chunks instead,
 * because a retry there makes a new run rather than adding to a real one.
 */
const MAX_RESULTS = 200;

const ResultStepSchema = z.object({
  position: z.number().int().min(0),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped']),
  comment: z.string().optional(),
  attachments: z
    .array(z.string())
    .optional()
    .describe('Attachment hashes from qase_attachment_upload'),
});

const SingleResultSchema = z.object({
  case_id: z.number().int().positive().optional(),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped', 'invalid']),
  comment: z.string().optional(),
  stacktrace: z.string().optional(),
  time_ms: z.number().int().min(0).optional(),
  defect: z.boolean().optional(),
  steps: z.array(ResultStepSchema).optional(),
  attachments: z
    .array(z.string())
    .optional()
    .describe('Attachment hashes from qase_attachment_upload'),
  custom_field: z.record(z.any()).optional(),
});

const RecordSchema = z.object({
  code: ProjectCodeSchema,
  run_id: IdSchema.describe('Run ID to record results into'),
  results: z
    .array(SingleResultSchema)
    .min(1)
    .max(
      MAX_RESULTS,
      `A single call records at most ${MAX_RESULTS} results — split larger batches into ` +
        'consecutive calls.',
    )
    .describe(`Results to record, 1 to ${MAX_RESULTS} per call`),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  run_id: IdSchema,
  hash: z.string().min(1).describe('Result hash to delete'),
});

async function record(rawArgs: unknown) {
  // Tool handlers get raw MCP arguments — the registry only turns the schema
  // into JSON Schema for the protocol, so nothing has checked them yet. An
  // oversized batch has to fail here to fail at all.
  const parsed = RecordSchema.safeParse(rawArgs);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
      .join('; ');
    throw createToolError(`Invalid arguments — ${details}`, CONTEXT);
  }

  const client = getApiClient();
  const { code, run_id, results } = parsed.data;

  if (results.length === 1) {
    const single = results[0];
    const res = await toResultAsync(client.results.createResult(code, run_id, single as any));
    return res.match(
      (r) => r.data.result,
      (e) => {
        throw createToolError(e, CONTEXT);
      },
    );
  }

  const res = await toResultAsync(
    client.results.createResultBulk(code, run_id, { results: results as any }),
  );
  return res.match(
    () => ({ success: true, count: results.length }),
    (e) => {
      throw createToolError(e, CONTEXT);
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(
    client.results.deleteResult(args.code, args.run_id, args.hash),
  );
  return result.match(
    () => ({ success: true, hash: args.hash }),
    (e) => {
      throw createToolError(e, CONTEXT);
    },
  );
}

toolRegistry.register({
  name: 'qase_result_record',
  title: 'Record test results',
  description:
    `Record up to ${MAX_RESULTS} results into an existing run. A case says what should be tested; ` +
    'a result says what happened when it ran — status, duration, comment, stacktrace, ' +
    'attachments — so a result always needs a run to live in. Pass several results in one call ' +
    'rather than calling once per test: the tool takes a list and sends them together. ' +
    `${MAX_RESULTS} is the ceiling for one call, and a longer list is refused before anything is ` +
    'written — split it into consecutive calls rather than dropping the tail. If the run does ' +
    'not exist yet and this is a finished CI job, qase_ci_report is the single call that creates ' +
    'the run, records the results and completes it, and it splits a larger batch for you. ' +
    'Status is a label, one of "passed", "failed", ' +
    '"blocked", "skipped" or "invalid" — unlike the case enums, numeric IDs are not accepted ' +
    'here. Cost: one API call for the whole list, about 0.5s for a small ' +
    'batch, growing with payload rather than with the number of results.',
  schema: RecordSchema,
  handler: record,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_result_delete',
  title: 'Delete test result',
  description:
    'Delete a single result from a run, addressed by run ID and result hash. Use it to remove one ' +
    'wrong or duplicated execution record; the case itself and the rest of the run are untouched. ' +
    'This cannot be undone, and pass rates and any trend built on that run shift accordingly. ' +
    "Results are addressed by hash, not numeric ID. To discard a whole run's worth of results, " +
    'delete the run with qase_run_delete instead of looping here. Deletion asks the user for ' +
    'confirmation and does not proceed without it. Cost: one API call, about 0.4s.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
