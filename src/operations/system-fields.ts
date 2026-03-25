/**
 * System Fields Operations
 *
 * Implements all MCP tools for viewing system field configurations in Qase.
 * System fields are built-in fields that can be configured at the account level.
 *
 * https://developers.qase.io/reference/get-system-fields
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry, ReadAnnotation } from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';

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
  const client = getApiClient();

  const result = await toResultAsync(client.systemFields.getSystemFields());

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'listing system fields');
    },
  );
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
  annotations: ReadAnnotation,
});
