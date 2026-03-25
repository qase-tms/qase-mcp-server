/**
 * Configurations Operations
 *
 * Implements all MCP tools for managing test configurations in Qase.
 * Configurations represent test environment settings (browser, OS, device, etc.).
 *
 * https://developers.qase.io/reference/get-configurations
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import {
  toolRegistry,
  ReadAnnotation,
  CreateAnnotation,
  DeleteAnnotation,
} from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for a single configuration item within a group
 */
const ConfigurationItemSchema = z.object({
  title: z.string().min(1).describe('Configuration item title (e.g., "Chrome", "Windows 10")'),
});

/**
 * Schema for listing configurations in a project
 * API: GET /v1/configuration/{code}
 * https://developers.qase.io/reference/get-configurations
 */
const ListConfigurationsSchema = z.object({
  code: ProjectCodeSchema,
});

/**
 * Schema for creating a configuration group
 * API: POST /v1/configuration/{code}/group
 * https://developers.qase.io/reference/create-configuration-group
 */
const CreateConfigurationGroupSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Configuration group title (e.g., "Browser", "OS")'),
  configurations: z
    .array(ConfigurationItemSchema)
    .min(1)
    .describe('Configuration items in the group'),
});

/**
 * Schema for deleting a configuration group
 * API: DELETE /v1/configuration/{code}/group/{id}
 * This endpoint is not documented in the official API docs but follows REST conventions.
 */
const DeleteConfigurationGroupSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.describe('Configuration group ID'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all configurations in a project
 * API: GET /v1/configuration/{code}
 * https://developers.qase.io/reference/get-configurations
 */
async function listConfigurations(args: z.infer<typeof ListConfigurationsSchema>) {
  const client = getApiClient();
  const { code } = args;

  const result = await toResultAsync(client.configurations.getConfigurations(code));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'listing configurations');
    },
  );
}

/**
 * Create a new configuration group
 * API: POST /v1/configuration/{code}/group
 * https://developers.qase.io/reference/create-configuration-group
 *
 * Note: The SDK type `ConfigurationGroupCreate` only declares `title`,
 * but the API also accepts a `configurations` array. We cast to `any`
 * to pass the full payload.
 */
async function createConfigurationGroup(args: z.infer<typeof CreateConfigurationGroupSchema>) {
  const client = getApiClient();
  const { code, title, configurations } = args;

  const result = await toResultAsync(
    client.configurations.createConfigurationGroup(code, { title, configurations } as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'creating configuration group');
    },
  );
}

/**
 * Delete a configuration group
 * API: DELETE /v1/configuration/{code}/group/{id}
 *
 * The SDK does not expose a delete method for configuration groups,
 * so we use a direct API call.
 */
async function deleteConfigurationGroup(args: z.infer<typeof DeleteConfigurationGroupSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  await client.request(`/v1/configuration/${code}/group/${id}`, {
    method: 'DELETE',
  });

  return { success: true, id };
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_configurations',
  description: 'Get all configuration groups and their items in a project',
  schema: ListConfigurationsSchema,
  handler: listConfigurations,
  annotations: ReadAnnotation,
});

toolRegistry.register({
  name: 'create_configuration_group',
  description: 'Create a new configuration group (e.g., Browser, OS) with items',
  schema: CreateConfigurationGroupSchema,
  handler: createConfigurationGroup,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'delete_configuration_group',
  description: 'Delete a configuration group from a project',
  schema: DeleteConfigurationGroupSchema,
  handler: deleteConfigurationGroup,
  annotations: DeleteAnnotation,
});
