/**
 * Projects Operations
 *
 * Implements all MCP tools for managing Qase projects.
 * Projects are top-level containers for test management.
 */

import { z } from 'zod';
import { ProjectCreateAccessEnum } from 'qaseio';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { PaginationSchema, ProjectCodeSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing projects
 */
const ListProjectsSchema = PaginationSchema;

/**
 * Schema for getting a specific project
 */
const GetProjectSchema = z.object({
  code: ProjectCodeSchema,
});

/**
 * Schema for creating a project
 */
const CreateProjectSchema = z.object({
  title: z.string().min(1).max(255).describe('Project title'),
  code: ProjectCodeSchema,
  description: z.string().optional().describe('Project description'),
  access: z
    .enum(['none', 'group', 'all'])
    .optional()
    .describe('Project access level: none (private), group, or all (public)'),
  group: z.string().optional().describe('Group hash for group access level'),
});

/**
 * Schema for deleting a project
 */
const DeleteProjectSchema = z.object({
  code: ProjectCodeSchema,
});

/**
 * Schema for granting project access
 */
const GrantProjectAccessSchema = z.object({
  code: ProjectCodeSchema,
  member_id: z.number().int().positive().describe('User or group ID'),
  member_type: z.enum(['user', 'group']).describe('Type of member: user or group'),
});

/**
 * Schema for revoking project access
 */
const RevokeProjectAccessSchema = z.object({
  code: ProjectCodeSchema,
  member_id: z.number().int().positive().describe('User or group ID'),
  member_type: z.enum(['user', 'group']).describe('Type of member: user or group'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all projects with pagination
 */
async function listProjects(args: z.infer<typeof ListProjectsSchema>) {
  const client = getApiClient();
  const { limit, offset } = args;

  const result = await toResultAsync(client.projects.getProjects(limit, offset));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific project by code
 */
async function getProject(args: z.infer<typeof GetProjectSchema>) {
  const client = getApiClient();
  const { code } = args;

  const result = await toResultAsync(client.projects.getProject(code));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new project
 */
async function createProject(args: z.infer<typeof CreateProjectSchema>) {
  const client = getApiClient();

  // Map string access level to enum
  let accessEnum: ProjectCreateAccessEnum | undefined;
  if (args.access === 'none') accessEnum = ProjectCreateAccessEnum.NONE;
  else if (args.access === 'group') accessEnum = ProjectCreateAccessEnum.GROUP;
  else if (args.access === 'all') accessEnum = ProjectCreateAccessEnum.ALL;

  const result = await toResultAsync(
    client.projects.createProject({
      title: args.title,
      code: args.code,
      description: args.description,
      access: accessEnum,
      group: args.group,
    }),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a project
 */
async function deleteProject(args: z.infer<typeof DeleteProjectSchema>) {
  const client = getApiClient();
  const { code } = args;

  const result = await toResultAsync(client.projects.deleteProject(code));

  return result.match(
    (_response) => ({ success: true, code }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Grant access to a project
 */
async function grantProjectAccess(args: z.infer<typeof GrantProjectAccessSchema>) {
  const client = getApiClient();
  const { code, member_id, member_type } = args;

  const result = await toResultAsync(
    client.projects.grantAccessToProject(code, {
      member_id,
    }),
  );

  return result.match(
    (_response) => ({ success: true, code, member_id, member_type }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Revoke access to a project
 */
async function revokeProjectAccess(args: z.infer<typeof RevokeProjectAccessSchema>) {
  const client = getApiClient();
  const { code, member_id, member_type } = args;

  const result = await toResultAsync(
    client.projects.revokeAccessToProject(code, {
      member_id,
    }),
  );

  return result.match(
    (_response) => ({ success: true, code, member_id, member_type }),
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_projects',
  description: 'Get all projects with optional pagination',
  schema: ListProjectsSchema,
  handler: listProjects,
});

toolRegistry.register({
  name: 'get_project',
  description: 'Get a specific project by project code',
  schema: GetProjectSchema,
  handler: getProject,
});

toolRegistry.register({
  name: 'create_project',
  description: 'Create a new project in Qase',
  schema: CreateProjectSchema,
  handler: createProject,
});

toolRegistry.register({
  name: 'delete_project',
  description: 'Delete a project by project code',
  schema: DeleteProjectSchema,
  handler: deleteProject,
});

toolRegistry.register({
  name: 'grant_project_access',
  description: 'Grant access to a project for a user or group',
  schema: GrantProjectAccessSchema,
  handler: grantProjectAccess,
});

toolRegistry.register({
  name: 'revoke_project_access',
  description: 'Revoke access to a project from a user or group',
  schema: RevokeProjectAccessSchema,
  handler: revokeProjectAccess,
});
