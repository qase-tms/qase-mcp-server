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
    'Create or update an environment — a named target that runs can be attributed to, such as ' +
    'staging or production. Without `id` it creates, with `id` it updates; `slug` and `host` are ' +
    'optional. Attach the environment ID when opening a run so results can later be filtered by ' +
    'where they ran, which is how "did this fail only on staging" gets answered through ' +
    'qql_search. Existing environments come back from qase_project_context. Cost: one API call, ' +
    'about 0.5s.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_environment_delete',
  description:
    'Delete an environment by project code and environment ID. Runs that referenced it are not ' +
    'deleted but lose the attribution, so "where did this run" becomes unanswerable for that ' +
    'history, and queries filtering by that environment stop matching. This cannot be undone. ' +
    'Deletion asks the user for confirmation and does not proceed without it. Cost: one API call, ' +
    'about 0.4s.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
