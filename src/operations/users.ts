/**
 * Users Operations
 *
 * Implements all MCP tools for managing users in Qase.
 * Users are team members with access to the Qase workspace.
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
 * Schema for listing users
 */
const ListUsersSchema = z.object({
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific user
 */
const GetUserSchema = z.object({
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all users
 */
async function listUsers(args: z.infer<typeof ListUsersSchema>) {
  const client = getApiClient();
  const { limit, offset } = args;

  const result = await toResultAsync((client as any).users.getUsers(limit, offset));

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific user
 */
async function getUser(args: z.infer<typeof GetUserSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync((client as any).users.getUser(id));

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_users',
  description: 'Get all users in the workspace with optional pagination',
  schema: ListUsersSchema,
  handler: listUsers,
});

toolRegistry.register({
  name: 'get_user',
  description: 'Get a specific user by ID',
  schema: GetUserSchema,
  handler: getUser,
});
