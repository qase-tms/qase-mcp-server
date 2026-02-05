/**
 * Test Suites Operations
 *
 * Implements all MCP tools for managing test suites in Qase.
 * Suites provide organizational hierarchy for test cases.
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
 * Schema for listing test suites
 */
const ListSuitesSchema = z.object({
  code: ProjectCodeSchema,
  search: z.string().optional().describe('Search query for suite title'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific test suite
 */
const GetSuiteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for creating a test suite
 */
const CreateSuiteSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Suite title'),
  description: z.string().optional().describe('Suite description'),
  preconditions: z.string().optional().describe('Preconditions for tests in this suite'),
  parent_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Parent suite ID for creating nested suites'),
});

/**
 * Schema for updating a test suite
 */
const UpdateSuiteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Suite title'),
  description: z.string().optional().describe('Suite description'),
  preconditions: z.string().optional().describe('Preconditions for tests in this suite'),
  parent_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Parent suite ID for moving the suite'),
});

/**
 * Schema for deleting a test suite
 */
const DeleteSuiteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  delete_cases: z
    .boolean()
    .optional()
    .describe(
      'If true, delete all test cases in the suite. If false, move cases to parent suite or root.',
    ),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all test suites in a project
 */
async function listSuites(args: z.infer<typeof ListSuitesSchema>) {
  const client = getApiClient();
  const { code, search, limit, offset } = args;

  const result = await toResultAsync(client.suites.getSuites(code, search, limit, offset));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'suite operation');
    },
  );
}

/**
 * Get a specific test suite
 */
async function getSuite(args: z.infer<typeof GetSuiteSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.suites.getSuite(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'suite operation');
    },
  );
}

/**
 * Create a new test suite
 */
async function createSuite(args: z.infer<typeof CreateSuiteSchema>) {
  const client = getApiClient();
  const { code, ...suiteData } = args;

  const result = await toResultAsync(client.suites.createSuite(code, suiteData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'suite operation');
    },
  );
}

/**
 * Update an existing test suite
 */
async function updateSuite(args: z.infer<typeof UpdateSuiteSchema>) {
  const client = getApiClient();
  const { code, id, ...updateData } = args;

  const result = await toResultAsync(client.suites.updateSuite(code, id, updateData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'suite operation');
    },
  );
}

/**
 * Delete a test suite
 */
async function deleteSuite(args: z.infer<typeof DeleteSuiteSchema>) {
  const client = getApiClient();
  const { code, id, delete_cases } = args;

  const result = await toResultAsync(client.suites.deleteSuite(code, id));

  return result.match(
    (_response) => ({ success: true, id, delete_cases }),
    (error) => {
      throw createToolError(error, 'suite operation');
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_suites',
  description: 'Get all test suites in a project with optional search and pagination',
  schema: ListSuitesSchema,
  handler: listSuites,
});

toolRegistry.register({
  name: 'get_suite',
  description: 'Get a specific test suite by project code and suite ID',
  schema: GetSuiteSchema,
  handler: getSuite,
});

toolRegistry.register({
  name: 'create_suite',
  description: 'Create a new test suite in a project',
  schema: CreateSuiteSchema,
  handler: createSuite,
});

toolRegistry.register({
  name: 'update_suite',
  description: 'Update an existing test suite',
  schema: UpdateSuiteSchema,
  handler: updateSuite,
});

toolRegistry.register({
  name: 'delete_suite',
  description: 'Delete a test suite from a project',
  schema: DeleteSuiteSchema,
  handler: deleteSuite,
});
