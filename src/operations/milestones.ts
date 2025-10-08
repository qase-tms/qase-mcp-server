/**
 * Milestones Operations
 *
 * Implements all MCP tools for managing milestones in Qase.
 * Milestones help organize tests by releases, sprints, or project phases.
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
 * Schema for listing milestones
 */
const ListMilestonesSchema = z.object({
  code: ProjectCodeSchema,
  search: z.string().optional().describe('Search query for milestone title'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific milestone
 */
const GetMilestoneSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for creating a milestone
 */
const CreateMilestoneSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Milestone title'),
  description: z.string().optional().describe('Milestone description'),
  status: z.enum(['active', 'completed']).optional().default('active').describe('Milestone status'),
  due_date: z.number().optional().describe('Due date as Unix timestamp'),
});

/**
 * Schema for updating a milestone
 */
const UpdateMilestoneSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Milestone title'),
  description: z.string().optional().describe('Milestone description'),
  status: z.enum(['active', 'completed']).optional().describe('Milestone status'),
  due_date: z.number().optional().describe('Due date as Unix timestamp'),
});

/**
 * Schema for deleting a milestone
 */
const DeleteMilestoneSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all milestones in a project
 */
async function listMilestones(args: z.infer<typeof ListMilestonesSchema>) {
  const client = getApiClient();
  const { code, search, limit, offset } = args;

  const result = await toResultAsync(client.milestones.getMilestones(code, search, limit, offset));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific milestone
 */
async function getMilestone(args: z.infer<typeof GetMilestoneSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.milestones.getMilestone(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new milestone
 */
async function createMilestone(args: z.infer<typeof CreateMilestoneSchema>) {
  const client = getApiClient();
  const { code, ...milestoneData } = args;

  const result = await toResultAsync(client.milestones.createMilestone(code, milestoneData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update an existing milestone
 */
async function updateMilestone(args: z.infer<typeof UpdateMilestoneSchema>) {
  const client = getApiClient();
  const { code, id, ...updateData } = args;

  const result = await toResultAsync(
    client.milestones.updateMilestone(code, id, updateData as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a milestone
 */
async function deleteMilestone(args: z.infer<typeof DeleteMilestoneSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.milestones.deleteMilestone(code, id));

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
  name: 'list_milestones',
  description: 'Get all milestones in a project with optional search and pagination',
  schema: ListMilestonesSchema,
  handler: listMilestones,
});

toolRegistry.register({
  name: 'get_milestone',
  description: 'Get a specific milestone by project code and milestone ID',
  schema: GetMilestoneSchema,
  handler: getMilestone,
});

toolRegistry.register({
  name: 'create_milestone',
  description: 'Create a new milestone for organizing tests by releases or sprints',
  schema: CreateMilestoneSchema,
  handler: createMilestone,
});

toolRegistry.register({
  name: 'update_milestone',
  description: 'Update an existing milestone',
  schema: UpdateMilestoneSchema,
  handler: updateMilestone,
});

toolRegistry.register({
  name: 'delete_milestone',
  description: 'Delete a milestone from a project',
  schema: DeleteMilestoneSchema,
  handler: deleteMilestone,
});
