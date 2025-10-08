/**
 * Custom TypeScript Type Definitions
 *
 * Central location for type definitions used across the application:
 * - MCP-related types
 * - API response types
 * - Re-exports from external libraries
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

/**
 * MCP Tool type alias for convenience
 */
export type McpTool = Tool;

/**
 * Generic API response wrapper from Qase API
 * All Qase API responses follow this structure
 */
export interface ApiResponse<T> {
  status: boolean;
  result: T;
}

/**
 * Paginated API response wrapper
 */
export interface PaginatedApiResponse<T> {
  status: boolean;
  result: {
    total: number;
    filtered: number;
    count: number;
    entities: T[];
  };
}

/**
 * Tool handler function type
 * All tool handlers must implement this signature
 */
export type ToolHandler<T extends z.ZodTypeAny> = (args: z.infer<T>) => Promise<unknown>;

/**
 * Tool definition for registration
 */
export interface ToolDefinition<T extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
  handler: ToolHandler<T>;
}

// Re-export common types from qaseio as they become needed
// These will be populated as we implement various operations
// export type { ... } from 'qaseio';
