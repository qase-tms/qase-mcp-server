/**
 * Users Operations
 *
 * Implements all MCP tools for managing users in Qase.
 * Users are team members with access to the Qase workspace.
 *
 * https://developers.qase.io/reference/get-users
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';
import { IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing users
 * API: GET /v1/user
 * https://developers.qase.io/reference/get-users
 *
 * The Qase API does not document pagination parameters for this endpoint.
 */
const ListUsersSchema = z.object({});

/**
 * Schema for getting a specific user
 * API: GET /v1/user/{id}
 * https://developers.qase.io/reference/get-user
 */
const GetUserSchema = z.object({
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all users
 * API: GET /v1/user
 * https://developers.qase.io/reference/get-users
 */
async function listUsers(_args: z.infer<typeof ListUsersSchema>) {
  const client = getApiClient();

  const result = await toResultAsync(client.users.getUsers());

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'listing users');
    },
  );
}

/**
 * Get a specific user
 * API: GET /v1/user/{id}
 * https://developers.qase.io/reference/get-user
 */
async function getUser(args: z.infer<typeof GetUserSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync(client.users.getUser(id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'getting user');
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_users',
  description: 'Get all users in the workspace',
  schema: ListUsersSchema,
  handler: listUsers,
});

toolRegistry.register({
  name: 'get_user',
  description: 'Get a specific user by ID',
  schema: GetUserSchema,
  handler: getUser,
});
