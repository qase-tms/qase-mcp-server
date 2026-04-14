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
  description: 'Create or update a test run. If `id` is provided, updates; if omitted, creates.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_run_complete',
  description: 'Mark a test run as complete.',
  schema: CompleteSchema,
  handler: complete,
  annotations: UpdateAnnotation,
});

toolRegistry.register({
  name: 'qase_run_delete',
  description: 'Delete a test run.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
