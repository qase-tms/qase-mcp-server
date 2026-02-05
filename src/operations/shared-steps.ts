/**
 * Shared Steps Operations
 *
 * Implements all MCP tools for managing shared steps in Qase.
 * Shared steps are reusable test steps that can be included in multiple test cases.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';
import { ProjectCodeSchema, HashSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for shared step content
 */
const SharedStepContentSchema = z.object({
  action: z.string().describe('Step action description'),
  expected_result: z.string().optional().describe('Expected result'),
  data: z.string().optional().describe('Test data'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
});

/**
 * Schema for listing shared steps
 */
const ListSharedStepsSchema = z.object({
  code: ProjectCodeSchema,
  search: z.string().optional().describe('Search query for step title'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific shared step
 */
const GetSharedStepSchema = z.object({
  code: ProjectCodeSchema,
  hash: HashSchema.describe('Shared step hash identifier'),
});

/**
 * Schema for creating a shared step
 */
const CreateSharedStepSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Shared step title'),
  steps: z.array(SharedStepContentSchema).optional().describe('Array of step definitions'),
});

/**
 * Schema for updating a shared step
 */
const UpdateSharedStepSchema = z.object({
  code: ProjectCodeSchema,
  hash: HashSchema.describe('Shared step hash identifier'),
  title: z.string().min(1).max(255).optional().describe('Shared step title'),
  steps: z.array(SharedStepContentSchema).optional().describe('Array of step definitions'),
});

/**
 * Schema for deleting a shared step
 */
const DeleteSharedStepSchema = z.object({
  code: ProjectCodeSchema,
  hash: HashSchema.describe('Shared step hash identifier'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all shared steps in a project
 */
async function listSharedSteps(args: z.infer<typeof ListSharedStepsSchema>) {
  const client = getApiClient();
  const { code, search, limit, offset } = args;

  const result = await toResultAsync(
    client.sharedSteps.getSharedSteps(code, search, limit, offset),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'shared step operation');
    },
  );
}

/**
 * Get a specific shared step
 */
async function getSharedStep(args: z.infer<typeof GetSharedStepSchema>) {
  const client = getApiClient();
  const { code, hash } = args;

  const result = await toResultAsync(client.sharedSteps.getSharedStep(code, hash));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'shared step operation');
    },
  );
}

/**
 * Create a new shared step
 */
async function createSharedStep(args: z.infer<typeof CreateSharedStepSchema>) {
  const client = getApiClient();
  const { code, ...stepData } = args;

  const result = await toResultAsync(client.sharedSteps.createSharedStep(code, stepData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'shared step operation');
    },
  );
}

/**
 * Update an existing shared step
 */
async function updateSharedStep(args: z.infer<typeof UpdateSharedStepSchema>) {
  const client = getApiClient();
  const { code, hash, ...updateData } = args;

  const result = await toResultAsync(
    client.sharedSteps.updateSharedStep(code, hash, updateData as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'shared step operation');
    },
  );
}

/**
 * Delete a shared step
 */
async function deleteSharedStep(args: z.infer<typeof DeleteSharedStepSchema>) {
  const client = getApiClient();
  const { code, hash } = args;

  const result = await toResultAsync(client.sharedSteps.deleteSharedStep(code, hash));

  return result.match(
    (_response) => ({ success: true, hash }),
    (error) => {
      throw createToolError(error, 'shared step operation');
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_shared_steps',
  description: 'Get all shared steps in a project with optional search and pagination',
  schema: ListSharedStepsSchema,
  handler: listSharedSteps,
});

toolRegistry.register({
  name: 'get_shared_step',
  description: 'Get a specific shared step by project code and hash',
  schema: GetSharedStepSchema,
  handler: getSharedStep,
});

toolRegistry.register({
  name: 'create_shared_step',
  description: 'Create a new reusable shared step in a project',
  schema: CreateSharedStepSchema,
  handler: createSharedStep,
});

toolRegistry.register({
  name: 'update_shared_step',
  description: 'Update an existing shared step',
  schema: UpdateSharedStepSchema,
  handler: updateSharedStep,
});

toolRegistry.register({
  name: 'delete_shared_step',
  description: 'Delete a shared step from a project',
  schema: DeleteSharedStepSchema,
  handler: deleteSharedStep,
});
