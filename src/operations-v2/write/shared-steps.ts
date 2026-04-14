import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, HashSchema } from '../../utils/validation.js';

const StepContentSchema = z.object({
  action: z.string().describe('Step action description'),
  expected_result: z.string().optional().describe('Expected result'),
  data: z.string().optional().describe('Test data'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
});

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  hash: HashSchema.optional().describe(
    'Shared step hash — if provided, updates; if omitted, creates',
  ),
  title: z.string().min(1).max(255).describe('Shared step title'),
  steps: z.array(StepContentSchema).optional().describe('Array of step definitions'),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  hash: HashSchema.describe('Shared step hash identifier'),
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, hash, ...data } = args;

  if (hash) {
    const result = await toResultAsync(
      client.sharedSteps.updateSharedStep(code, hash, data as any),
    );
    return result.match(
      () => ({ success: true, hash }),
      (e) => {
        throw createToolError(e, 'shared step operation');
      },
    );
  }

  const result = await toResultAsync(client.sharedSteps.createSharedStep(code, data as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'shared step operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.sharedSteps.deleteSharedStep(args.code, args.hash));
  return result.match(
    () => ({ success: true, hash: args.hash }),
    (e) => {
      throw createToolError(e, 'shared step operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_shared_step_upsert',
  description:
    'Create or update a shared step. If `hash` is provided, updates the existing shared step; ' +
    'if omitted, creates a new one. Shared steps are reusable steps included in multiple test cases.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_shared_step_delete',
  description: 'Delete a shared step by project code and hash.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
