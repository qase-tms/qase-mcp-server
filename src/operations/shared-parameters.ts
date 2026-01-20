/**
 * Shared Parameters Operations
 *
 * Implements all MCP tools for managing shared parameters in Qase.
 * Shared parameters are reusable parameters for data-driven testing.
 *
 * The qaseio SDK does not expose the Shared Parameters API, so we use direct HTTP calls.
 * https://developers.qase.io/reference/get-shared-parameters
 */

import { z } from 'zod';
import { apiRequest } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
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
  const { limit, offset } = args;

  const params = new URLSearchParams();
  if (limit !== undefined) params.append('limit', String(limit));
  if (offset !== undefined) params.append('offset', String(offset));

  const queryString = params.toString();
  const path = queryString ? `/v1/shared_parameter?${queryString}` : '/v1/shared_parameter';

  const response = await apiRequest<{ status: boolean; result: any }>(path);
  return response.result;
}

/**
 * Get a specific shared parameter
 * API: GET /v1/shared_parameter/{id}
 * https://developers.qase.io/reference/get-shared-parameter
 */
async function getSharedParameter(args: z.infer<typeof GetSharedParameterSchema>) {
  const { id } = args;
  const response = await apiRequest<{ status: boolean; result: any }>(`/v1/shared_parameter/${id}`);
  return response.result;
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
