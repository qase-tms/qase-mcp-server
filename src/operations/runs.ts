/**
 * Test Runs Operations
 *
 * Implements all MCP tools for managing test runs in Qase.
 * Test runs represent test execution sessions.
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
 * Schema for listing test runs
 */
const ListRunsSchema = z.object({
  code: ProjectCodeSchema,
  search: z.string().optional().describe('Search query for run title'),
  status: z.string().optional().describe('Filter by status (e.g., "active", "complete")'),
  milestone: z.number().int().positive().optional().describe('Filter by milestone ID'),
  environment: z.number().int().positive().optional().describe('Filter by environment ID'),
  from_start_time: z.number().optional().describe('Filter runs started after this timestamp'),
  to_start_time: z.number().optional().describe('Filter runs started before this timestamp'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
  include: z.string().optional().describe('Comma-separated relations to include (e.g., "cases")'),
});

/**
 * Schema for getting a specific test run
 */
const GetRunSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  include: z.string().optional().describe('Comma-separated relations to include (e.g., "cases")'),
});

/**
 * Schema for creating a test run
 */
const CreateRunSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Test run title'),
  description: z.string().optional().describe('Test run description'),
  environment_id: z.number().int().positive().optional().describe('Environment ID for this run'),
  milestone_id: z.number().int().positive().optional().describe('Milestone ID for this run'),
  plan_id: z.number().int().positive().optional().describe('Test plan ID to base this run on'),
  cases: z
    .array(z.number().int().positive())
    .optional()
    .describe('Array of test case IDs to include in the run'),
  is_autotest: z.boolean().optional().describe('Mark as automated test run'),
  start_time: z.number().optional().describe('Start time as unix timestamp'),
  end_time: z.number().optional().describe('End time as unix timestamp'),
  custom_field: z.record(z.any()).optional().describe('Custom field values'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
});

/**
 * Schema for deleting a test run
 */
const DeleteRunSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for completing a test run
 */
const CompleteRunSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for getting run public link
 */
const GetRunPublicLinkSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for deleting run public link
 */
const DeleteRunPublicLinkSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all test runs in a project
 */
async function listRuns(args: z.infer<typeof ListRunsSchema>) {
  const client = getApiClient();
  const { code, ...filters } = args;

  const result = await toResultAsync(
    client.runs.getRuns(
      code,
      filters.search,
      filters.status,
      filters.milestone,
      filters.environment,
      filters.from_start_time,
      filters.to_start_time,
      filters.limit,
      filters.offset,
      filters.include,
    ),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific test run
 */
async function getRun(args: z.infer<typeof GetRunSchema>) {
  const client = getApiClient();
  const { code, id, include } = args;

  const result = await toResultAsync(client.runs.getRun(code, id, include));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new test run
 */
async function createRun(args: z.infer<typeof CreateRunSchema>) {
  const client = getApiClient();
  const { code, ...runData } = args;

  const result = await toResultAsync(client.runs.createRun(code, runData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a test run
 */
async function deleteRun(args: z.infer<typeof DeleteRunSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.runs.deleteRun(code, id));

  return result.match(
    (_response) => ({ success: true, id }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Complete a test run
 */
async function completeRun(args: z.infer<typeof CompleteRunSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.runs.completeRun(code, id));

  return result.match(
    (_response) => ({ success: true, id, status: 'complete' }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get or create public link for a test run
 */
async function getRunPublicLink(args: z.infer<typeof GetRunPublicLinkSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(
    client.runs.updateRunPublicity(code, id, { status: true } as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete public link for a test run
 */
async function deleteRunPublicLink(args: z.infer<typeof DeleteRunPublicLinkSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(
    client.runs.updateRunPublicity(code, id, { status: false } as any),
  );

  return result.match(
    (_response) => ({ success: true, id, public_link_removed: true }),
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_runs',
  description: 'Get all test runs in a project with optional filtering and pagination',
  schema: ListRunsSchema,
  handler: listRuns,
});

toolRegistry.register({
  name: 'get_run',
  description: 'Get a specific test run by project code and run ID',
  schema: GetRunSchema,
  handler: getRun,
});

toolRegistry.register({
  name: 'create_run',
  description: 'Create a new test run in a project',
  schema: CreateRunSchema,
  handler: createRun,
});

toolRegistry.register({
  name: 'delete_run',
  description: 'Delete a test run from a project',
  schema: DeleteRunSchema,
  handler: deleteRun,
});

toolRegistry.register({
  name: 'complete_run',
  description: 'Mark a test run as complete',
  schema: CompleteRunSchema,
  handler: completeRun,
});

toolRegistry.register({
  name: 'get_run_public_link',
  description: 'Get or create a public link for sharing a test run externally',
  schema: GetRunPublicLinkSchema,
  handler: getRunPublicLink,
});

toolRegistry.register({
  name: 'delete_run_public_link',
  description: 'Delete the public link for a test run',
  schema: DeleteRunPublicLinkSchema,
  handler: deleteRunPublicLink,
});
