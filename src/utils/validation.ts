/**
 * Validation Utilities
 *
 * Provides reusable Zod schemas and validation helpers for:
 * - Common parameters (pagination, search, etc.)
 * - Qase-specific formats (project codes, IDs, etc.)
 * - Schema composition utilities
 */

import { z } from 'zod';

/**
 * Schema for pagination parameters
 * Used across all list operations
 */
export const PaginationSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Maximum number of items to return (default: 10, max: 100)'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of items to skip for pagination (default: 0)'),
});

/**
 * Schema for Qase project codes
 * Format: 2-10 uppercase letters, numbers, or underscores
 * Examples: DEMO, TEST, MY_PROJECT, PROJECT_123
 */
export const ProjectCodeSchema = z
  .string()
  .min(2, 'Project code must be at least 2 characters')
  .max(10, 'Project code must be at most 10 characters')
  .regex(
    /^[A-Z0-9_]+$/,
    'Project code must contain only uppercase letters, numbers, or underscores',
  )
  .describe('Project code (2-10 uppercase letters, numbers, or underscores)');

/**
 * Schema for search query strings
 */
export const SearchSchema = z.string().min(1).max(255).optional().describe('Search query string');

/**
 * Schema for entity IDs (positive integers)
 */
export const IdSchema = z.number().int().positive().describe('Entity ID (positive integer)');

/**
 * Schema for hash identifiers (used by some entities like shared steps)
 */
export const HashSchema = z.string().min(1).max(255).describe('Hash identifier');

/**
 * Schema for filtering by entity status
 */
export const StatusFilterSchema = z
  .enum(['active', 'archived', 'deleted'])
  .optional()
  .describe('Filter by entity status');

/**
 * Helper function to merge a schema with pagination parameters
 *
 * @param schema - The base schema to extend
 * @returns Combined schema with pagination
 *
 * @example
 * ```typescript
 * const ListProjectsSchema = withPagination({
 *   search: SearchSchema,
 * });
 * ```
 */
export function withPagination<T extends z.ZodRawShape>(schema: T) {
  return z.object(schema).merge(PaginationSchema);
}

/**
 * Helper function to add project code to a schema
 *
 * @param schema - The base schema to extend
 * @returns Combined schema with project code
 *
 * @example
 * ```typescript
 * const GetCaseSchema = withProjectCode({
 *   id: IdSchema,
 * });
 * // Results in: { code: ProjectCodeSchema, id: IdSchema }
 * ```
 */
export function withProjectCode<T extends z.ZodRawShape>(schema: T) {
  return z.object({
    code: ProjectCodeSchema,
    ...schema,
  });
}

/**
 * Helper function to make all fields in a schema optional
 *
 * @param schema - The schema to make partial
 * @returns Schema with all fields optional
 */
export function makePartial<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
  return schema.partial();
}

// Export type inference helpers
export type Pagination = z.infer<typeof PaginationSchema>;
export type ProjectCode = z.infer<typeof ProjectCodeSchema>;
export type EntityId = z.infer<typeof IdSchema>;
export type Hash = z.infer<typeof HashSchema>;
