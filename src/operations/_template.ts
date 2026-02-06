/**
 * TEMPLATE: Entity Operations Module
 *
 * This template demonstrates the pattern for implementing entity operations.
 * Each operation module should follow this structure:
 *
 * 1. Import dependencies (client, registry, utilities)
 * 2. Define Zod schemas for each operation
 * 3. Implement handler functions
 * 4. Register tools with the global registry
 *
 * The tools are automatically registered when this module is imported.
 *
 * Copy this template and replace "items" with your entity name.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';
import { PaginationSchema, ProjectCodeSchema, IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing items
 * Includes pagination parameters
 */
const ListItemsSchema = PaginationSchema.extend({
  search: z.string().optional().describe('Search query'),
});

/**
 * Schema for getting a single item
 * Typically includes project code and item ID
 */
const GetItemSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for creating an item
 * Includes all required and optional fields
 */
const CreateItemSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Item title'),
  description: z.string().optional().describe('Item description'),
  // Add more fields as needed
});

/**
 * Schema for updating an item
 * Usually similar to create schema but with optional fields
 */
const UpdateItemSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Item title'),
  description: z.string().optional().describe('Item description'),
  // Add more fields as needed
});

/**
 * Schema for deleting an item
 */
const DeleteItemSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all items with optional filtering and pagination
 */
async function listItems(args: z.infer<typeof ListItemsSchema>) {
  const client = getApiClient();
  const { limit, offset, search } = args;

  // Make API call wrapped in Result type for error handling
  const result = await toResultAsync(
    client.items.getItems({
      limit: limit || 10,
      offset: offset || 0,
      filters: search ? { search } : undefined,
    }),
  );

  // Handle result - return data or throw error
  return result.match(
    (response) => ({
      total: response.data.result.total,
      filtered: response.data.result.filtered,
      count: response.data.result.count,
      entities: response.data.result.entities,
    }),
    (error) => {
      throw createToolError(error, 'item operation');
    },
  );
}

/**
 * Get a single item by ID
 */
async function getItem(args: z.infer<typeof GetItemSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.items.getItem(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'item operation');
    },
  );
}

/**
 * Create a new item
 */
async function createItem(args: z.infer<typeof CreateItemSchema>) {
  const client = getApiClient();
  const { code, ...itemData } = args;

  const result = await toResultAsync(client.items.createItem(code, itemData));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'item operation');
    },
  );
}

/**
 * Update an existing item
 */
async function updateItem(args: z.infer<typeof UpdateItemSchema>) {
  const client = getApiClient();
  const { code, id, ...updateData } = args;

  const result = await toResultAsync(client.items.updateItem(code, id, updateData));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'item operation');
    },
  );
}

/**
 * Delete an item
 */
async function deleteItem(args: z.infer<typeof DeleteItemSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.items.deleteItem(code, id));

  return result.match(
    (response) => ({ success: true, id }),
    (error) => {
      throw createToolError(error, 'item operation');
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

/**
 * Register all tools for this entity
 * Tools are registered when this module is imported
 */

toolRegistry.register({
  name: 'list_items',
  description: 'Get all items with optional filtering and pagination',
  schema: ListItemsSchema,
  handler: listItems,
});

toolRegistry.register({
  name: 'get_item',
  description: 'Get a specific item by project code and ID',
  schema: GetItemSchema,
  handler: getItem,
});

toolRegistry.register({
  name: 'create_item',
  description: 'Create a new item in a project',
  schema: CreateItemSchema,
  handler: createItem,
});

toolRegistry.register({
  name: 'update_item',
  description: 'Update an existing item',
  schema: UpdateItemSchema,
  handler: updateItem,
});

toolRegistry.register({
  name: 'delete_item',
  description: 'Delete an item from a project',
  schema: DeleteItemSchema,
  handler: deleteItem,
});

// ============================================================================
// NOTES
// ============================================================================

/**
 * Best Practices:
 *
 * 1. Schema Design:
 *    - Use descriptive field names
 *    - Add .describe() to all fields for better AI understanding
 *    - Reuse common schemas (PaginationSchema, ProjectCodeSchema, etc.)
 *    - Validate all inputs strictly
 *
 * 2. Handler Implementation:
 *    - Always wrap API calls with toResultAsync()
 *    - Use match() to handle success/error cases
 *    - Return meaningful error messages
 *    - Include all necessary data in responses
 *
 * 3. Tool Registration:
 *    - Use clear, descriptive tool names (snake_case)
 *    - Write detailed descriptions for AI understanding
 *    - Group related operations together
 *
 * 4. Error Handling:
 *    - Use createToolError() to throw errors with helpful suggestions
 *    - Include context (e.g., 'creating project') for better suggestions
 *    - Errors are returned with isError: true for LLM recovery
 *    - Protocol errors (unknown tool) still throw regular Error
 *
 * 5. Type Safety:
 *    - Use z.infer<> for type inference from schemas
 *    - Let TypeScript validate handler signatures
 *    - Don't use 'any' types
 */
