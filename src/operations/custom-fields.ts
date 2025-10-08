/**
 * Custom Fields Operations
 *
 * Implements all MCP tools for managing custom fields in Qase.
 * Custom fields extend entities with project-specific data fields.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Custom field entity types
 */
const CustomFieldEntityEnum = z.enum(['case', 'run', 'defect', 'result']);

/**
 * Custom field data types
 */
const CustomFieldTypeEnum = z.enum([
  'number',
  'string',
  'text',
  'selectbox',
  'checkbox',
  'radio',
  'multiselect',
  'url',
  'user',
  'datetime',
]);

/**
 * Schema for listing custom fields
 */
const ListCustomFieldsSchema = z.object({
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific custom field
 */
const GetCustomFieldSchema = z.object({
  id: IdSchema,
});

/**
 * Schema for creating a custom field
 */
const CreateCustomFieldSchema = z.object({
  title: z.string().min(1).max(255).describe('Custom field title'),
  entity: CustomFieldEntityEnum.describe('Entity type this field applies to'),
  type: CustomFieldTypeEnum.describe('Data type of the field'),
  placeholder: z.string().optional().describe('Placeholder text'),
  default_value: z.string().optional().describe('Default value'),
  is_required: z.boolean().optional().describe('Whether field is required'),
  is_visible: z.boolean().optional().describe('Whether field is visible'),
  projects: z.array(z.string()).optional().describe('Project codes where field is available'),
});

/**
 * Schema for updating a custom field
 */
const UpdateCustomFieldSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Custom field title'),
  placeholder: z.string().optional().describe('Placeholder text'),
  default_value: z.string().optional().describe('Default value'),
  is_required: z.boolean().optional().describe('Whether field is required'),
  is_visible: z.boolean().optional().describe('Whether field is visible'),
});

/**
 * Schema for deleting a custom field
 */
const DeleteCustomFieldSchema = z.object({
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all custom fields
 */
async function listCustomFields(args: z.infer<typeof ListCustomFieldsSchema>) {
  const client = getApiClient();
  const { limit, offset } = args;

  const result = await toResultAsync(
    client.customFields.getCustomFields(limit as any, offset as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific custom field
 */
async function getCustomField(args: z.infer<typeof GetCustomFieldSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync(client.customFields.getCustomField(id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new custom field
 */
async function createCustomField(args: z.infer<typeof CreateCustomFieldSchema>) {
  const client = getApiClient();

  const result = await toResultAsync(client.customFields.createCustomField(args as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update an existing custom field
 */
async function updateCustomField(args: z.infer<typeof UpdateCustomFieldSchema>) {
  const client = getApiClient();
  const { id, ...updateData } = args;

  const result = await toResultAsync(client.customFields.updateCustomField(id, updateData as any));

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a custom field
 */
async function deleteCustomField(args: z.infer<typeof DeleteCustomFieldSchema>) {
  const client = getApiClient();
  const { id } = args;

  const result = await toResultAsync(client.customFields.deleteCustomField(id));

  return result.match(
    (_response: any) => ({ success: true, id }),
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_custom_fields',
  description: 'Get all custom field definitions with optional pagination',
  schema: ListCustomFieldsSchema,
  handler: listCustomFields,
});

toolRegistry.register({
  name: 'get_custom_field',
  description: 'Get a specific custom field definition by ID',
  schema: GetCustomFieldSchema,
  handler: getCustomField,
});

toolRegistry.register({
  name: 'create_custom_field',
  description: 'Create a new custom field for extending entity data',
  schema: CreateCustomFieldSchema,
  handler: createCustomField,
});

toolRegistry.register({
  name: 'update_custom_field',
  description: 'Update an existing custom field definition',
  schema: UpdateCustomFieldSchema,
  handler: updateCustomField,
});

toolRegistry.register({
  name: 'delete_custom_field',
  description: 'Delete a custom field definition',
  schema: DeleteCustomFieldSchema,
  handler: deleteCustomField,
});
