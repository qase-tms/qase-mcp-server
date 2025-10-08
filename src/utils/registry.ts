/**
 * Tool Registry System
 *
 * Centralized system for managing MCP tool registration:
 * - Register tools with Zod schemas
 * - Convert Zod schemas to JSON Schema automatically
 * - Store and retrieve tool handlers
 * - Manage tool lifecycle
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Tool handler function type
 * Handlers receive validated arguments and return a promise
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolHandler<T = any, R = any> = (args: T) => Promise<R>;

/**
 * Tool definition for registration
 * Contains all information needed to register a tool with the MCP server
 */
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: T;
  handler: ToolHandler;
}

/**
 * Tool Registry Class
 * Manages the lifecycle of MCP tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();

  /**
   * Register a new tool with the registry
   *
   * @param definition - Tool definition including name, description, schema, and handler
   *
   * @example
   * ```typescript
   * toolRegistry.register({
   *   name: 'list_projects',
   *   description: 'Get all projects',
   *   schema: z.object({ limit: z.number().optional() }),
   *   handler: async (args) => { ... }
   * });
   * ```
   */
  register<T extends z.ZodType>(definition: ToolDefinition<T>): void {
    const { name, description, schema, handler } = definition;

    // Convert Zod schema to JSON Schema for MCP protocol
    const jsonSchema = zodToJsonSchema(schema, {
      name: `${name}Input`,
      $refStrategy: 'none', // Inline all definitions
    }) as any;

    // Extract the actual schema from definitions if present
    // zodToJsonSchema sometimes wraps the schema in a $ref even with $refStrategy: 'none'
    let inputSchema: { type: 'object'; [key: string]: unknown };

    if (jsonSchema.$ref && jsonSchema.definitions) {
      // Extract from definitions
      const definitionKey = Object.keys(jsonSchema.definitions)[0];
      inputSchema = jsonSchema.definitions[definitionKey] as { type: 'object'; [key: string]: unknown };
    } else if (jsonSchema.type === 'object') {
      // Use directly
      inputSchema = jsonSchema;
    } else {
      // Fallback: create minimal object schema
      inputSchema = {
        type: 'object',
        properties: {},
      };
    }

    // Store tool definition
    this.tools.set(name, {
      name,
      description,
      inputSchema,
    });

    // Store handler function
    this.handlers.set(name, handler);

    // Log registration for debugging (to stderr)
    console.error(`[Registry] Registered tool: ${name}`);
  }

  /**
   * Get all registered tools
   * Used by the ListToolsRequestSchema handler
   *
   * @returns Array of all registered tools
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get handler function for a specific tool
   *
   * @param name - Tool name
   * @returns Handler function or undefined if not found
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Check if a tool exists in the registry
   *
   * @param name - Tool name
   * @returns True if tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the count of registered tools
   *
   * @returns Number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Unregister a tool (useful for testing)
   *
   * @param name - Tool name to unregister
   * @returns True if tool was removed, false if not found
   * @internal
   */
  unregister(name: string): boolean {
    const hadTool = this.tools.delete(name);
    this.handlers.delete(name);
    return hadTool;
  }

  /**
   * Clear all registered tools (useful for testing)
   *
   * @internal
   */
  clear(): void {
    this.tools.clear();
    this.handlers.clear();
  }
}

/**
 * Global tool registry instance
 * Import and use this instance across all operation modules
 */
export const toolRegistry = new ToolRegistry();
