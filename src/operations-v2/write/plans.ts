import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe('Plan ID — if provided, updates; if omitted, creates'),
  title: z.string().min(1).max(255).describe('Test plan title'),
  description: z.string().optional(),
  cases: z.array(z.number().int().positive()).optional().describe('Case IDs to include'),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, ...data } = args;

  if (id) {
    const result = await toResultAsync(client.plans.updatePlan(code, id, data as any));
    return result.match(
      () => ({ success: true, id }),
      (e) => {
        throw createToolError(e, 'plan operation');
      },
    );
  }

  const result = await toResultAsync(client.plans.createPlan(code, data as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'plan operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.plans.deletePlan(args.code, args.id));
  return result.match(
    () => ({ success: true, id: args.id }),
    (e) => {
      throw createToolError(e, 'plan operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_plan_upsert',
  description:
    'Create or update a test plan. If `id` is provided, updates the existing plan; ' +
    'if omitted, creates a new one.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_plan_delete',
  description: 'Delete a test plan by project code and plan ID.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
