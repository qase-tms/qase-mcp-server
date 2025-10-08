/**
 * System Fields Operations
 *
 * Implements all MCP tools for viewing system field configurations in Qase.
 * System fields are built-in fields that can be configured at the account level.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing system fields (no parameters needed)
 */
const ListSystemFieldsSchema = z.object({});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all system fields and their configurations
 */
async function listSystemFields(_args: z.infer<typeof ListSystemFieldsSchema>) {
  const client = getApiClient();

  const result = await toResultAsync((client as any).systemFields.getSystemFields());

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
  name: 'list_system_fields',
  description:
    'Get all system field configurations (built-in fields like priority, severity, etc.)',
  schema: ListSystemFieldsSchema,
  handler: listSystemFields,
});
