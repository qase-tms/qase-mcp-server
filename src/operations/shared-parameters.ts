/**
 * Shared Parameters Operations
 *
 * Implements all MCP tools for managing shared parameters in Qase.
 * Shared parameters are reusable parameters for data-driven testing.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing shared parameters
 */
const ListSharedParametersSchema = z.object({
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific shared parameter
 */
const GetSharedParameterSchema = z.object({
  id: IdSchema,
});

/**
 * Schema for creating a shared parameter
 */
const CreateSharedParameterSchema = z.object({
  title: z.string().min(1).max(255).describe('Shared parameter title'),
  values: z.array(z.string()).min(1).describe('Array of parameter values'),
});

/**
 * Schema for updating a shared parameter
 */
const UpdateSharedParameterSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Shared parameter title'),
  values: z.array(z.string()).min(1).optional().describe('Array of parameter values'),
});

/**
 * Schema for deleting a shared parameter
 */
const DeleteSharedParameterSchema = z.object({
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all shared parameters
 */
async function listSharedParameters(args: z.infer<typeof ListSharedParametersSchema>) {
  const client = getApiClient();
  const { limit, offset } = args;

  const result = await toResultAsync((client as any).parameters.getParameters(limit, offset));

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific shared parameter
 */
async function getSharedParameter(args: z.infer<typeof GetSharedParameterSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync((client as any).parameters.getParameter(id));

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new shared parameter
 */
async function createSharedParameter(args: z.infer<typeof CreateSharedParameterSchema>) {
  const client = getApiClient();

  const result = await toResultAsync((client as any).parameters.createParameter(args as any));

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update an existing shared parameter
 */
async function updateSharedParameter(args: z.infer<typeof UpdateSharedParameterSchema>) {
  const client = getApiClient();
  const { id, ...updateData } = args;

  const result = await toResultAsync(
    (client as any).parameters.updateParameter(id, updateData as any),
  );

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a shared parameter
 */
async function deleteSharedParameter(args: z.infer<typeof DeleteSharedParameterSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync((client as any).parameters.deleteParameter(id));

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
  name: 'list_shared_parameters',
  description: 'Get all shared parameters with optional pagination',
  schema: ListSharedParametersSchema,
  handler: listSharedParameters,
});

toolRegistry.register({
  name: 'get_shared_parameter',
  description: 'Get a specific shared parameter by ID',
  schema: GetSharedParameterSchema,
  handler: getSharedParameter,
});

toolRegistry.register({
  name: 'create_shared_parameter',
  description: 'Create a new shared parameter for data-driven testing',
  schema: CreateSharedParameterSchema,
  handler: createSharedParameter,
});

toolRegistry.register({
  name: 'update_shared_parameter',
  description: 'Update an existing shared parameter',
  schema: UpdateSharedParameterSchema,
  handler: updateSharedParameter,
});

toolRegistry.register({
  name: 'delete_shared_parameter',
  description: 'Delete a shared parameter',
  schema: DeleteSharedParameterSchema,
  handler: deleteSharedParameter,
});
