/**
 * Test Results Operations
 *
 * Implements all MCP tools for managing test results in Qase.
 * Test results represent individual test case execution outcomes within runs.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { ProjectCodeSchema, IdSchema, HashSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for result step
 */
const ResultStepSchema = z.object({
  position: z.number().int().nonnegative().describe('Step position/order'),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped']).describe('Step execution status'),
  comment: z.string().optional().describe('Comment about the step execution'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes for this step'),
});

/**
 * Schema for listing test results
 */
const ListResultsSchema = z.object({
  code: ProjectCodeSchema,
  status: z.string().optional().describe('Filter by status'),
  run: z.string().optional().describe('Filter by run ID'),
  case_id: z.string().optional().describe('Filter by case ID'),
  member: z.string().optional().describe('Filter by member'),
  api: z.boolean().optional().describe('Filter by API results'),
  from_end_time: z.string().optional().describe('Filter results ending after this time'),
  to_end_time: z.string().optional().describe('Filter results ending before this time'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific test result by hash
 */
const GetResultSchema = z.object({
  code: ProjectCodeSchema,
  hash: HashSchema.describe('Result hash identifier'),
});

/**
 * Schema for creating a test result
 */
const CreateResultSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.describe('Run ID to add the result to'),
  case_id: z.number().int().positive().optional().describe('Test case ID'),
  status: z.enum(['passed', 'failed', 'blocked', 'skipped', 'invalid']).describe('Result status'),
  time_ms: z.number().int().nonnegative().optional().describe('Execution time in milliseconds'),
  defect: z.boolean().optional().describe('Mark as defect'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
  stacktrace: z.string().optional().describe('Stack trace for failures'),
  comment: z.string().optional().describe('Comment about the result'),
  steps: z.array(ResultStepSchema).optional().describe('Execution steps with results'),
  custom_field: z.record(z.any()).optional().describe('Custom field values'),
});

/**
 * Schema for bulk creating test results
 */
const CreateResultsBulkSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.describe('Run ID to add the results to'),
  results: z
    .array(CreateResultSchema.omit({ code: true, id: true }))
    .describe('Array of results to create'),
});

/**
 * Schema for updating a test result
 */
const UpdateResultSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.describe('Run ID'),
  hash: HashSchema.describe('Result hash identifier'),
  case_id: z.number().int().positive().optional().describe('Test case ID'),
  status: z
    .enum(['passed', 'failed', 'blocked', 'skipped', 'invalid'])
    .optional()
    .describe('Result status'),
  time_ms: z.number().int().nonnegative().optional().describe('Execution time in milliseconds'),
  defect: z.boolean().optional().describe('Mark as defect'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
  stacktrace: z.string().optional().describe('Stack trace for failures'),
  comment: z.string().optional().describe('Comment about the result'),
  steps: z.array(ResultStepSchema).optional().describe('Execution steps with results'),
  custom_field: z.record(z.any()).optional().describe('Custom field values'),
});

/**
 * Schema for deleting a test result
 */
const DeleteResultSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.describe('Run ID'),
  hash: HashSchema.describe('Result hash identifier'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all test results with filtering
 */
async function listResults(args: z.infer<typeof ListResultsSchema>) {
  const client = getApiClient();
  const { code, ...filters } = args;

  const result = await toResultAsync(
    client.results.getResults(
      code,
      filters.status,
      filters.run,
      filters.case_id,
      filters.member,
      filters.api,
      filters.from_end_time,
      filters.to_end_time,
      filters.limit,
      filters.offset,
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
 * Get a specific test result by hash
 */
async function getResult(args: z.infer<typeof GetResultSchema>) {
  const client = getApiClient();
  const { code, hash } = args;

  const result = await toResultAsync(client.results.getResult(code, hash));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a test result in a run
 */
async function createResult(args: z.infer<typeof CreateResultSchema>) {
  const client = getApiClient();
  const { code, id, ...resultData } = args;

  const result = await toResultAsync(client.results.createResult(code, id, resultData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create multiple test results at once
 */
async function createResultsBulk(args: z.infer<typeof CreateResultsBulkSchema>) {
  const client = getApiClient();
  const { code, id, results } = args;

  const result = await toResultAsync(client.results.createResultBulk(code, id, { results } as any));

  return result.match(
    (_response) => ({ success: true, count: results.length }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update an existing test result
 */
async function updateResult(args: z.infer<typeof UpdateResultSchema>) {
  const client = getApiClient();
  const { code, id, hash, ...updateData } = args;

  const result = await toResultAsync(
    client.results.updateResult(code, id, hash, updateData as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a test result
 */
async function deleteResult(args: z.infer<typeof DeleteResultSchema>) {
  const client = getApiClient();
  const { code, id, hash } = args;

  const result = await toResultAsync(client.results.deleteResult(code, id, hash));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_results',
  description: 'Get all test results with optional filtering by run, case, status, etc.',
  schema: ListResultsSchema,
  handler: listResults,
});

toolRegistry.register({
  name: 'get_result',
  description: 'Get a specific test result by hash',
  schema: GetResultSchema,
  handler: getResult,
});

toolRegistry.register({
  name: 'create_result',
  description: 'Create a test result for a run',
  schema: CreateResultSchema,
  handler: createResult,
});

toolRegistry.register({
  name: 'create_results_bulk',
  description: 'Create multiple test results at once for efficiency',
  schema: CreateResultsBulkSchema,
  handler: createResultsBulk,
});

toolRegistry.register({
  name: 'update_result',
  description: 'Update an existing test result',
  schema: UpdateResultSchema,
  handler: updateResult,
});

toolRegistry.register({
  name: 'delete_result',
  description: 'Delete a test result from a run',
  schema: DeleteResultSchema,
  handler: deleteResult,
});
