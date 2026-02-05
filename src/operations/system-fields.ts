/**
 * System Fields Operations
 *
 * Implements all MCP tools for viewing system field configurations in Qase.
 * System fields are built-in fields that can be configured at the account level.
 *
 * The qaseio SDK does not expose the System Fields API in QaseApi class,
 * so we use direct HTTP calls.
 * https://developers.qase.io/reference/get-system-fields
 */

import { z } from 'zod';
import { apiRequest } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing system fields (no parameters needed)
 * API: GET /v1/system_field
 * https://developers.qase.io/reference/get-system-fields
 */
const ListSystemFieldsSchema = z.object({});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all system fields and their configurations
 * API: GET /v1/system_field
 * https://developers.qase.io/reference/get-system-fields
 */
async function listSystemFields(_args: z.infer<typeof ListSystemFieldsSchema>) {
  const response = await apiRequest<{ status: boolean; result: any }>('/v1/system_field');
  return response.result;
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_system_fields',
  description:
    'Get all system field configurations (built-in fields like priority, severity, etc.)',
  schema: ListSystemFieldsSchema,
  handler: listSystemFields,
});
