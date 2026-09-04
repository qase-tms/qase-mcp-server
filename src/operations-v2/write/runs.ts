import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import {
  toolRegistry,
  CreateAnnotation,
  UpdateAnnotation,
  DeleteAnnotation,
} from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const RunFieldsSchema = z.object({
  title: z.string().min(1).max(255).describe('Run title'),
  description: z.string().optional(),
  environment_id: z.number().int().positive().optional(),
  milestone_id: z.number().int().positive().optional(),
  plan_id: z.number().int().positive().optional().describe('Test plan to base run on'),
  cases: z.array(z.number().int().positive()).optional().describe('Case IDs to include'),
  tags: z.array(z.string()).optional(),
  is_autotest: z.boolean().optional(),
  start_time: z.string().optional().describe('RFC3339 start time'),
  end_time: z.string().optional().describe('RFC3339 end time'),
  custom_field: z.record(z.any()).optional(),
});

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe(
    'Run ID — if provided, this is an update (note: Qase API has limited run update support)',
  ),
  ...RunFieldsSchema.shape,
});

const CompleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, ...data } = args;

  if (id) {
    const result = await toResultAsync(client.runs.updateRun(code, id, data as any));
    return result.match(
      () => ({ success: true, id }),
      (e) => {
        throw createToolError(e, 'run operation');
      },
    );
  }

  const result = await toResultAsync(client.runs.createRun(code, data as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'run operation');
    },
  );
}

async function complete(args: z.infer<typeof CompleteSchema>) {
  const client = getApiClient();
  const { code, id } = args;
  const result = await toResultAsync(client.runs.completeRun(code, id));
  return result.match(
    () => ({ success: true, id, status: 'complete' }),
    (e) => {
      throw createToolError(e, 'run operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.runs.deleteRun(args.code, args.id));
  return result.match(
    () => ({ success: true, id: args.id }),
    (e) => {
      throw createToolError(e, 'run operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_run_upsert',
  description:
    'Create or update a test run. Without `id` it opens a new run; with `id` it updates that one. ' +
    'A run is the container results are recorded into, so open it before calling ' +
    'qase_result_record. Optionally scope it to a milestone, an environment, a plan, or an ' +
    'explicit list of case IDs. To build a run from a suite or plan without listing cases ' +
    'yourself, use qase_regression_run. For a CI job that has already finished, use ' +
    'qase_ci_report instead — it opens the run, files the results and closes it in one call, so ' +
    'no half-finished run is left behind. Cost: one API call, about 0.5s.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_run_complete',
  description:
    'Close a test run so it stops accepting results and reports as finished. Call it once every ' +
    'result has been recorded; a run left open keeps showing as in progress and skews dashboards ' +
    'and any "is the release ready" question asked later. If the results are all in hand at once, ' +
    'qase_ci_report does this as its final step and you do not need this call. A completed run ' +
    'cannot take further results — record them first, then complete. Cost: one API call, about ' +
    '0.4s.',
  schema: CompleteSchema,
  handler: complete,
  annotations: UpdateAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_run_delete',
  description:
    'Delete a test run by project code and run ID. This removes the run together with every ' +
    'result recorded into it, and cannot be undone — the execution history for those cases goes ' +
    'with it. Deleting is rarely what you want: to stop a run from accepting results use ' +
    'qase_run_complete, and to correct a single wrong result use qase_result_delete. Deletion ' +
    'asks the user for confirmation and does not proceed without it. Cost: one API call, about ' +
    '0.4s.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
