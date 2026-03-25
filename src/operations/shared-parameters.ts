/**
 * Shared Parameters Operations
 *
 * Implements all MCP tools for managing shared parameters in Qase.
 * Shared parameters are reusable parameters for data-driven testing.
 *
 * https://developers.qase.io/reference/get-shared-parameters
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry, ReadAnnotation } from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';
import { IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing shared parameters
 * API: GET /v1/shared_parameter
 * https://developers.qase.io/reference/get-shared-parameters
 *
 * This is a workspace-level endpoint, no project code required.
 */
const ListSharedParametersSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Maximum number of items (default: 10)'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of items to skip (default: 0)'),
});

/**
 * Schema for getting a specific shared parameter
 * API: GET /v1/shared_parameter/{id}
 * https://developers.qase.io/reference/get-shared-parameter
 */
const GetSharedParameterSchema = z.object({
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all shared parameters
 * API: GET /v1/shared_parameter
 * https://developers.qase.io/reference/get-shared-parameters
 */
async function listSharedParameters(args: z.infer<typeof ListSharedParametersSchema>) {
  const client = getApiClient();
  const { limit, offset } = args;

  const result = await toResultAsync(client.sharedParameters.getSharedParameters(limit, offset));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'listing shared parameters');
    },
  );
}

/**
 * Get a specific shared parameter
 * API: GET /v1/shared_parameter/{id}
 * https://developers.qase.io/reference/get-shared-parameter
 */
async function getSharedParameter(args: z.infer<typeof GetSharedParameterSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync(client.sharedParameters.getSharedParameter(String(id)));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'getting shared parameter');
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
  annotations: ReadAnnotation,
});

toolRegistry.register({
  name: 'get_shared_parameter',
  description: 'Get a specific shared parameter by ID',
  schema: GetSharedParameterSchema,
  handler: getSharedParameter,
  annotations: ReadAnnotation,
});
