import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe('Suite ID — if provided, updates; if omitted, creates'),
  title: z.string().min(1).max(255).describe('Suite title'),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  parent_id: z.number().int().positive().optional().describe('Parent suite ID for nesting'),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  delete_cases: z
    .boolean()
    .optional()
    .describe(
      'Has no effect today: the server sends a field this endpoint does not accept, so the ' +
        'cases are deleted either way. Kept so existing callers do not break.',
    ),
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, ...data } = args;

  if (id) {
    const result = await toResultAsync(client.suites.updateSuite(code, id, data as any));
    return result.match(
      () => ({ success: true, id }),
      (e) => {
        throw createToolError(e, 'suite operation');
      },
    );
  }

  const result = await toResultAsync(client.suites.createSuite(code, data as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'suite operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const { code, id, delete_cases } = args;
  const suiteDelete = delete_cases !== undefined ? { after_delete_case: delete_cases } : undefined;
  const result = await toResultAsync(client.suites.deleteSuite(code, id, suiteDelete as any));
  return result.match(
    () => ({ success: true, id }),
    (e) => {
      throw createToolError(e, 'suite operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_suite_upsert',
  description:
    'Create or update a test suite — the folder cases live in. Without `id` it creates, with `id` ' +
    'it updates. Nest a suite by passing `parent_id`; the whole existing tree comes back from ' +
    'qase_project_context, so read that first rather than guessing at parent IDs. Building a deep ' +
    'tree means one call per node, so create parents before children and reuse the IDs returned. ' +
    'Cost: one API call, about 0.5s.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_suite_delete',
  description:
    'Delete a test suite by project code and suite ID. WARNING: the cases inside are deleted with ' +
    'it, along with their history, and this cannot be undone. Deleting a suite with children ' +
    'takes the whole subtree and everything in it, so read the tree from qase_project_context and ' +
    'move anything worth keeping — qase_case_upsert with a different suite_id — before calling. ' +
    'The `delete_cases` parameter currently has no effect: the server sends a field this endpoint ' +
    'does not accept, so cases are deleted whether it is true, false, or omitted. Verified ' +
    "against the live API. The endpoint's own mechanism for sparing them is a destination suite " +
    'to move them into, which this tool does not expose yet. Deletion asks the user for ' +
    'confirmation and does not proceed without it. Cost: one API call, about 0.4s, longer for a ' +
    'large subtree.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
