import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

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
  results: z.array(SingleResultSchema).min(1).describe('One or more results to record'),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  run_id: IdSchema,
  hash: z.string().min(1).describe('Result hash to delete'),
});

async function record(args: z.infer<typeof RecordSchema>) {
  const client = getApiClient();
  const { code, run_id, results } = args;

  if (results.length === 1) {
    const single = results[0];
    const res = await toResultAsync(client.results.createResult(code, run_id, single as any));
    return res.match(
      (r) => r.data.result,
      (e) => {
        throw createToolError(e, 'result operation');
      },
    );
  }

  const res = await toResultAsync(
    client.results.createResultBulk(code, run_id, { results: results as any }),
  );
  return res.match(
    () => ({ success: true, count: results.length }),
    (e) => {
      throw createToolError(e, 'result operation');
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
      throw createToolError(e, 'result operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_result_record',
  description:
    'Record one or more results into an existing run. A case says what should be tested; a result ' +
    'says what happened when it ran — status, duration, comment, stacktrace, attachments — so a ' +
    'result always needs a run to live in. Pass several results in one call rather than calling ' +
    'once per test: the tool takes a list and sends them together. If the run does not exist yet ' +
    'and this is a finished CI job, qase_ci_report is the single call that creates the run, ' +
    'records the results and completes it. Status is a label, one of "passed", "failed", ' +
    '"blocked", "skipped" or "invalid" — unlike the case enums, numeric IDs are not accepted ' +
    'here. Cost: one API call for the whole list, about 0.5s for a small ' +
    'batch, growing with payload rather than with the number of results.',
  schema: RecordSchema,
  handler: record,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_result_delete',
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
