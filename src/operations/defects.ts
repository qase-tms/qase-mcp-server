/**
 * Defects Operations
 *
 * Implements all MCP tools for managing defects in Qase.
 * Defects represent bugs and issues discovered during testing.
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
 * Defect severity levels
 */
const DefectSeverityEnum = z.enum([
  'undefined',
  'blocker',
  'critical',
  'major',
  'normal',
  'minor',
  'trivial',
]);

/**
 * Defect status values
 */
const DefectStatusEnum = z.enum(['open', 'in_progress', 'resolved', 'invalid']);

/**
 * Schema for listing defects
 */
const ListDefectsSchema = z.object({
  code: ProjectCodeSchema,
  status: z.array(DefectStatusEnum).optional().describe('Filter by status'),
  severity: z.array(DefectSeverityEnum).optional().describe('Filter by severity'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific defect
 */
const GetDefectSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for creating a defect
 */
const CreateDefectSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Defect title'),
  actual_result: z.string().optional().describe('Actual behavior observed'),
  severity: DefectSeverityEnum.optional().describe('Defect severity'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
  custom_field: z.record(z.any()).optional().describe('Custom field values'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
});

/**
 * Schema for updating a defect
 */
const UpdateDefectSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Defect title'),
  actual_result: z.string().optional().describe('Actual behavior observed'),
  severity: DefectSeverityEnum.optional().describe('Defect severity'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
});

/**
 * Schema for deleting a defect
 */
const DeleteDefectSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for resolving a defect
 */
const ResolveDefectSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for updating defect status
 */
const UpdateDefectStatusSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  status: DefectStatusEnum.describe('New defect status'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all defects in a project
 */
async function listDefects(args: z.infer<typeof ListDefectsSchema>) {
  const client = getApiClient();
  const { code, status, severity, limit, offset } = args;

  const result = await toResultAsync(
    client.defects.getDefects(code, { status, severity } as any, limit, offset),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific defect
 */
async function getDefect(args: z.infer<typeof GetDefectSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.defects.getDefect(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new defect
 */
async function createDefect(args: z.infer<typeof CreateDefectSchema>) {
  const client = getApiClient();
  const { code, ...defectData } = args;

  const result = await toResultAsync(client.defects.createDefect(code, defectData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update an existing defect
 */
async function updateDefect(args: z.infer<typeof UpdateDefectSchema>) {
  const client = getApiClient();
  const { code, id, ...updateData } = args;

  const result = await toResultAsync(client.defects.updateDefect(code, id, updateData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a defect
 */
async function deleteDefect(args: z.infer<typeof DeleteDefectSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.defects.deleteDefect(code, id));

  return result.match(
    (_response) => ({ success: true, id }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Mark a defect as resolved
 */
async function resolveDefect(args: z.infer<typeof ResolveDefectSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.defects.resolveDefect(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update defect status
 */
async function updateDefectStatus(args: z.infer<typeof UpdateDefectStatusSchema>) {
  const client = getApiClient();
  const { code, id, status } = args;

  const result = await toResultAsync(client.defects.updateDefect(code, id, { status } as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_defects',
  description: 'Get all defects in a project with optional filtering by status and severity',
  schema: ListDefectsSchema,
  handler: listDefects,
});

toolRegistry.register({
  name: 'get_defect',
  description: 'Get a specific defect by project code and defect ID',
  schema: GetDefectSchema,
  handler: getDefect,
});

toolRegistry.register({
  name: 'create_defect',
  description: 'Create a new defect/bug report in a project',
  schema: CreateDefectSchema,
  handler: createDefect,
});

toolRegistry.register({
  name: 'update_defect',
  description: 'Update an existing defect',
  schema: UpdateDefectSchema,
  handler: updateDefect,
});

toolRegistry.register({
  name: 'delete_defect',
  description: 'Delete a defect from a project',
  schema: DeleteDefectSchema,
  handler: deleteDefect,
});

toolRegistry.register({
  name: 'resolve_defect',
  description: 'Mark a defect as resolved',
  schema: ResolveDefectSchema,
  handler: resolveDefect,
});

toolRegistry.register({
  name: 'update_defect_status',
  description: 'Update the status of a defect (open, in_progress, resolved, invalid)',
  schema: UpdateDefectStatusSchema,
  handler: updateDefectStatus,
});
