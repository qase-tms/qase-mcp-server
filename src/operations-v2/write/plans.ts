import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe('Plan ID — if provided, updates; if omitted, creates'),
  title: z.string().min(1).max(255).describe('Test plan title'),
  description: z.string().optional().describe('Free-form description of the plan'),
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
  title: 'Create or update test plan',
  description:
    'Create or update a test plan — a named, reusable set of case IDs such as a smoke or regression pack. With `id` it updates, without it creates. qase_regression_run turns a plan into a run in one call. Cost: one API call, about 0.5s, growing with the number of cases.',
  help:
    'Create or update a test plan — a named, reusable set of cases to run together, such as a ' +
    'smoke or regression pack. Without `id` it creates, with `id` it updates, and the case list ' +
    'is given explicitly. Once a plan exists, qase_regression_run turns it into a run in one ' +
    'call, which is the point of having one. Find the cases to put in it with qql_search rather ' +
    'than fetching them one by one. Cost: one API call, about 0.5s, growing with the number of ' +
    'cases in the plan.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_plan_delete',
  title: 'Delete test plan',
  description:
    'Delete a test plan by project code and ID. Only the plan goes — its cases and the runs made from it stay — but anything launching it by ID breaks; this cannot be undone. To change its cases use qase_plan_upsert instead. Asks the user for confirmation first. Cost: one API call, about 0.4s.',
  help:
    'Delete a test plan by project code and plan ID. Only the plan is removed — the cases it ' +
    'referenced stay, and runs already created from it are untouched — but anything that launches ' +
    'this plan by ID stops working. This cannot be undone. To change which cases a plan holds, ' +
    'use qase_plan_upsert with its `id` instead of deleting and recreating. Deletion asks the ' +
    'user for confirmation and does not proceed without it. Cost: one API call, about 0.4s.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
