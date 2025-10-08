/**
 * Configurations Operations
 *
 * Implements all MCP tools for managing test configurations in Qase.
 * Configurations represent test environment settings (browser, OS, device, etc.).
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
 * Schema for a single configuration item within a group
 */
const ConfigurationItemSchema = z.object({
  title: z.string().min(1).describe('Configuration item title (e.g., "Chrome", "Windows 10")'),
});

/**
 * Schema for listing configurations in a project
 */
const ListConfigurationsSchema = z.object({
  code: ProjectCodeSchema,
});

/**
 * Schema for creating a configuration group
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
 */
async function listConfigurations(args: z.infer<typeof ListConfigurationsSchema>) {
  const client = getApiClient();
  const { code } = args;

  const result = await toResultAsync((client as any).configurations.getConfigurations(code));

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new configuration group
 */
async function createConfigurationGroup(args: z.infer<typeof CreateConfigurationGroupSchema>) {
  const client = getApiClient();
  const { code, ...groupData } = args;

  const result = await toResultAsync(
    (client as any).configurations.createConfigurationGroup(code, groupData as any),
  );

  return result.match(
    (response: any) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a configuration group
 */
async function deleteConfigurationGroup(args: z.infer<typeof DeleteConfigurationGroupSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(
    (client as any).configurations.deleteConfigurationGroup(code, id),
  );

  return result.match(
    (_response) => ({ success: true, id }),
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_configurations',
  description: 'Get all configuration groups and their items in a project',
  schema: ListConfigurationsSchema,
  handler: listConfigurations,
});

toolRegistry.register({
  name: 'create_configuration_group',
  description: 'Create a new configuration group (e.g., Browser, OS) with items',
  schema: CreateConfigurationGroupSchema,
  handler: createConfigurationGroup,
});

toolRegistry.register({
  name: 'delete_configuration_group',
  description: 'Delete a configuration group from a project',
  schema: DeleteConfigurationGroupSchema,
  handler: deleteConfigurationGroup,
});
