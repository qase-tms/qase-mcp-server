/**
 * Environments Operations
 *
 * Implements all MCP tools for managing test environments in Qase.
 * Environments represent different testing stages (staging, production, etc.).
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing environments
 */
const ListEnvironmentsSchema = z.object({
  code: ProjectCodeSchema,
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific environment
 */
const GetEnvironmentSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for creating an environment
 */
const CreateEnvironmentSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Environment title'),
  description: z.string().optional().describe('Environment description'),
  slug: z.string().optional().describe('URL-friendly identifier'),
  host: z.string().optional().describe('Environment host/URL'),
});

/**
 * Schema for updating an environment
 */
const UpdateEnvironmentSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Environment title'),
  description: z.string().optional().describe('Environment description'),
  slug: z.string().optional().describe('URL-friendly identifier'),
  host: z.string().optional().describe('Environment host/URL'),
});

/**
 * Schema for deleting an environment
 */
const DeleteEnvironmentSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all environments in a project
 */
async function listEnvironments(args: z.infer<typeof ListEnvironmentsSchema>) {
  const client = getApiClient();
  const { code, limit, offset } = args;

  const result = await toResultAsync(
    client.environment.getEnvironments(code, limit as any, offset as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'environment operation');
    },
  );
}

/**
 * Get a specific environment
 */
async function getEnvironment(args: z.infer<typeof GetEnvironmentSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.environment.getEnvironment(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'environment operation');
    },
  );
}

/**
 * Create a new environment
 */
async function createEnvironment(args: z.infer<typeof CreateEnvironmentSchema>) {
  const client = getApiClient();
  const { code, ...environmentData } = args;

  const result = await toResultAsync(
    client.environment.createEnvironment(code, environmentData as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'environment operation');
    },
  );
}

/**
 * Update an existing environment
 */
async function updateEnvironment(args: z.infer<typeof UpdateEnvironmentSchema>) {
  const client = getApiClient();
  const { code, id, ...updateData } = args;

  const result = await toResultAsync(
    client.environment.updateEnvironment(code, id, updateData as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'environment operation');
    },
  );
}

/**
 * Delete an environment
 */
async function deleteEnvironment(args: z.infer<typeof DeleteEnvironmentSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.environment.deleteEnvironment(code, id));

  return result.match(
    (_response) => ({ success: true, id }),
    (error) => {
      throw createToolError(error, 'environment operation');
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_environments',
  description: 'Get all test environments in a project',
  schema: ListEnvironmentsSchema,
  handler: listEnvironments,
});

toolRegistry.register({
  name: 'get_environment',
  description: 'Get a specific environment by project code and environment ID',
  schema: GetEnvironmentSchema,
  handler: getEnvironment,
});

toolRegistry.register({
  name: 'create_environment',
  description: 'Create a new test environment (staging, production, etc.)',
  schema: CreateEnvironmentSchema,
  handler: createEnvironment,
});

toolRegistry.register({
  name: 'update_environment',
  description: 'Update an existing test environment',
  schema: UpdateEnvironmentSchema,
  handler: updateEnvironment,
});

toolRegistry.register({
  name: 'delete_environment',
  description: 'Delete a test environment from a project',
  schema: DeleteEnvironmentSchema,
  handler: deleteEnvironment,
});
