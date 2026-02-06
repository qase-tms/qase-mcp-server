/**
 * Authors Operations
 *
 * Implements all MCP tools for managing test case authors in Qase.
 * Authors are users who have created test cases.
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
 * Schema for listing authors
 */
const ListAuthorsSchema = z.object({
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific author
 */
const GetAuthorSchema = z.object({
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all authors
 */
async function listAuthors(args: z.infer<typeof ListAuthorsSchema>) {
  const client = getApiClient();
  const { limit, offset } = args;

  const result = await toResultAsync(client.authors.getAuthors(limit as any, offset as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'author operation');
    },
  );
}

/**
 * Get a specific author
 */
async function getAuthor(args: z.infer<typeof GetAuthorSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync(client.authors.getAuthor(id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'author operation');
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_authors',
  description: 'Get all test case authors with optional pagination',
  schema: ListAuthorsSchema,
  handler: listAuthors,
});

toolRegistry.register({
  name: 'get_author',
  description: 'Get a specific author by ID',
  schema: GetAuthorSchema,
  handler: getAuthor,
});
