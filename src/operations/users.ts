/**
 * Users Operations
 *
 * Implements all MCP tools for managing users in Qase.
 * Users are team members with access to the Qase workspace.
 *
 * The qaseio SDK does not expose the Users API, so we use direct HTTP calls.
 * https://developers.qase.io/reference/get-users
 */

import { z } from 'zod';
import { apiRequest } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
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
  const response = await apiRequest<{ status: boolean; result: any }>('/v1/user');
  return response.result;
}

/**
 * Get a specific user
 * API: GET /v1/user/{id}
 * https://developers.qase.io/reference/get-user
 */
async function getUser(args: z.infer<typeof GetUserSchema>) {
  const { id } = args;
  const response = await apiRequest<{ status: boolean; result: any }>(`/v1/user/${id}`);
  return response.result;
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
