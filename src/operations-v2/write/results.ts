import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const ResultStepSchema = z.object({
  position: z.number().int().min(0),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped']),
  comment: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

const SingleResultSchema = z.object({
  case_id: z.number().int().positive().optional(),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped', 'invalid']),
  comment: z.string().optional(),
  stacktrace: z.string().optional(),
  time_ms: z.number().int().min(0).optional(),
  defect: z.boolean().optional(),
  steps: z.array(ResultStepSchema).optional(),
  attachments: z.array(z.string()).optional(),
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
    'Record one or more test results into a run. Accepts an array of results — ' +
    'a single entry uses the single-result API, multiple entries use bulk. ' +
    'Each result must include a status; case_id is recommended.',
  schema: RecordSchema,
  handler: record,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_result_delete',
  description: 'Delete a test result by run ID and result hash.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
