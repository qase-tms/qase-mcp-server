import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe('Milestone ID — if provided, updates; if omitted, creates'),
  title: z.string().min(1).max(255).describe('Milestone title'),
  description: z.string().optional(),
  status: z.enum(['active', 'completed']).optional(),
  due_date: z.number().optional().describe('Due date as Unix timestamp'),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, ...data } = args;

  if (id) {
    const result = await toResultAsync(client.milestones.updateMilestone(code, id, data as any));
    return result.match(
      () => ({ success: true, id }),
      (e) => {
        throw createToolError(e, 'milestone operation');
      },
    );
  }

  const result = await toResultAsync(client.milestones.createMilestone(code, data as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'milestone operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.milestones.deleteMilestone(args.code, args.id));
  return result.match(
    () => ({ success: true, id: args.id }),
    (e) => {
      throw createToolError(e, 'milestone operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_milestone_upsert',
  description:
    'Create or update a milestone. If `id` is provided, updates the existing milestone; ' +
    'if omitted, creates a new one.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_milestone_delete',
  description: 'Delete a milestone by project code and milestone ID.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
