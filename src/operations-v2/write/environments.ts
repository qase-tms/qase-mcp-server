import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe('Environment ID — if provided, updates; if omitted, creates'),
  title: z.string().min(1).max(255).describe('Environment title'),
  description: z.string().optional(),
  slug: z.string().optional().describe('URL-friendly identifier'),
  host: z.string().optional().describe('Environment host/URL'),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, ...data } = args;

  if (id) {
    const result = await toResultAsync(client.environment.updateEnvironment(code, id, data as any));
    return result.match(
      () => ({ success: true, id }),
      (e) => {
        throw createToolError(e, 'environment operation');
      },
    );
  }

  const result = await toResultAsync(client.environment.createEnvironment(code, data as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'environment operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.environment.deleteEnvironment(args.code, args.id));
  return result.match(
    () => ({ success: true, id: args.id }),
    (e) => {
      throw createToolError(e, 'environment operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_environment_upsert',
  description:
    'Create or update a test environment. If `id` is provided, updates the existing environment; ' +
    'if omitted, creates a new one.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_environment_delete',
  description: 'Delete a test environment by project code and environment ID.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
