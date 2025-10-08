/**
 * Test Plans Operations
 *
 * Implements all MCP tools for managing test plans in Qase.
 * Test plans define collections of test cases to be executed.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing test plans
 */
const ListPlansSchema = z.object({
  code: ProjectCodeSchema,
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific test plan
 */
const GetPlanSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for creating a test plan
 */
const CreatePlanSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Test plan title'),
  description: z.string().optional().describe('Test plan description'),
  cases: z
    .array(z.number().int().positive())
    .optional()
    .describe('Array of test case IDs to include in the plan'),
});

/**
 * Schema for updating a test plan
 */
const UpdatePlanSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Test plan title'),
  description: z.string().optional().describe('Test plan description'),
  cases: z
    .array(z.number().int().positive())
    .optional()
    .describe('Array of test case IDs to include in the plan'),
});

/**
 * Schema for deleting a test plan
 */
const DeletePlanSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all test plans in a project
 */
async function listPlans(args: z.infer<typeof ListPlansSchema>) {
  const client = getApiClient();
  const { code, limit, offset } = args;

  const result = await toResultAsync(client.plans.getPlans(code, limit, offset));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific test plan
 */
async function getPlan(args: z.infer<typeof GetPlanSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.plans.getPlan(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new test plan
 */
async function createPlan(args: z.infer<typeof CreatePlanSchema>) {
  const client = getApiClient();
  const { code, ...planData } = args;

  const result = await toResultAsync(client.plans.createPlan(code, planData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update an existing test plan
 */
async function updatePlan(args: z.infer<typeof UpdatePlanSchema>) {
  const client = getApiClient();
  const { code, id, ...updateData } = args;

  const result = await toResultAsync(client.plans.updatePlan(code, id, updateData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a test plan
 */
async function deletePlan(args: z.infer<typeof DeletePlanSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.plans.deletePlan(code, id));

  return result.match(
    (_response) => ({ success: true, id }),
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_plans',
  description: 'Get all test plans in a project with optional pagination',
  schema: ListPlansSchema,
  handler: listPlans,
});

toolRegistry.register({
  name: 'get_plan',
  description: 'Get a specific test plan by project code and plan ID',
  schema: GetPlanSchema,
  handler: getPlan,
});

toolRegistry.register({
  name: 'create_plan',
  description: 'Create a new test plan with selected test cases',
  schema: CreatePlanSchema,
  handler: createPlan,
});

toolRegistry.register({
  name: 'update_plan',
  description: 'Update an existing test plan',
  schema: UpdatePlanSchema,
  handler: updatePlan,
});

toolRegistry.register({
  name: 'delete_plan',
  description: 'Delete a test plan from a project',
  schema: DeletePlanSchema,
  handler: deletePlan,
});
