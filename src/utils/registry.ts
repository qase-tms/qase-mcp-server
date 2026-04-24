/**
 * Tool Registry System
 *
 * Centralized system for managing MCP tool registration:
 * - Register tools with Zod schemas
 * - Convert Zod schemas to JSON Schema automatically
 * - Store and retrieve tool handlers
 * - Manage tool lifecycle
 * - Support tool discovery with core/discoverable visibility
 */

import { Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
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
/** JSON Schema object type for outputSchema */
export interface OutputSchema {
  type: 'object';
  properties?: Record<string, object>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: T;
  handler: ToolHandler;
  annotations?: ToolAnnotations;
  /** JSON Schema describing the tool's output — enables clients to process results programmatically */
  outputSchema?: OutputSchema;
  /** Tool visibility: 'core' tools are always listed, 'discoverable' tools require activation via qase_discover_tools */
  visibility?: 'core' | 'discoverable';
}

/**
 * Tool Registry Class
 * Manages the lifecycle of MCP tools with support for dynamic discovery
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();
  private activeTools: Set<string> = new Set();
  private toolVisibility: Map<string, 'core' | 'discoverable'> = new Map();

  /** Callback invoked when the active tool set changes (wired to server.sendToolListChanged) */
  onToolsChanged?: () => void;

  /**
   * Register a new tool with the registry
   *
   * @param definition - Tool definition including name, description, schema, handler, and visibility
   *
   * @example
   * ```typescript
   * toolRegistry.register({
   *   name: 'list_projects',
   *   description: 'Get all projects',
   *   schema: z.object({ limit: z.number().optional() }),
   *   handler: async (args) => { ... },
   *   visibility: 'discoverable', // hidden until discovered
   * });
   * ```
   */
  register<T extends z.ZodType>(definition: ToolDefinition<T>): void {
    const { name, description, schema, handler, annotations, outputSchema } = definition;
    const visibility = definition.visibility ?? 'core';

    // Convert Zod schema to JSON Schema for MCP protocol
    // Using explicit type assertion to avoid TypeScript's deep type inference issues
    // The zodToJsonSchema function can cause "excessively deep" type errors with complex schemas
    // We cast both the input and output to avoid deep type inference
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonSchema = (zodToJsonSchema as any)(schema, {
      name: `${name}Input`,
      $refStrategy: 'none', // Inline all definitions
    }) as any;

    // Extract the actual schema from definitions if present
    // zodToJsonSchema sometimes wraps the schema in a $ref even with $refStrategy: 'none'
    let inputSchema: { type: 'object'; [key: string]: unknown };

    if (jsonSchema.$ref && jsonSchema.definitions) {
      // Extract from definitions
      const definitionKey = Object.keys(jsonSchema.definitions)[0];
      inputSchema = jsonSchema.definitions[definitionKey] as {
        type: 'object';
        [key: string]: unknown;
      };
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
      ...(annotations && { annotations }),
      ...(outputSchema && { outputSchema }),
    });

    // Store handler function
    this.handlers.set(name, handler);

    // Track visibility and activation
    this.toolVisibility.set(name, visibility);
    if (visibility === 'core') {
      this.activeTools.add(name);
    }

    // Log registration for debugging (to stderr)
    console.error(`[Registry] Registered tool: ${name} (${visibility})`);
  }

  /**
   * Get active tools only (core + activated discoverable)
   * Used by the ListToolsRequestSchema handler
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values()).filter((t) => this.activeTools.has(t.name));
  }

  /**
   * Get ALL registered tools regardless of activation status.
   * Used for discovery search and testing.
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Search tools by name or description (case-insensitive substring match).
   * Searches the full catalog including inactive tools.
   */
  searchTools(query: string): Tool[] {
    const lower = query.toLowerCase();
    return this.getAllTools().filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        (t.description?.toLowerCase().includes(lower) ?? false),
    );
  }

  /**
   * Activate tools by name, making them visible in getTools().
   * Returns the list of newly activated tool names.
   * Triggers onToolsChanged callback if any tools were activated.
   */
  activateTools(names: string[]): string[] {
    const newlyActivated: string[] = [];
    for (const name of names) {
      if (this.tools.has(name) && !this.activeTools.has(name)) {
        this.activeTools.add(name);
        newlyActivated.push(name);
      }
    }
    if (newlyActivated.length > 0 && this.onToolsChanged) {
      this.onToolsChanged();
    }
    return newlyActivated;
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
   * Get a specific tool definition by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
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
   * Get the count of registered tools (all, including inactive)
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
    this.activeTools.delete(name);
    this.toolVisibility.delete(name);
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
    this.activeTools.clear();
    this.toolVisibility.clear();
  }
}

/**
 * Global tool registry instance
 * Import and use this instance across all operation modules
 */
export const toolRegistry = new ToolRegistry();

/**
 * Reusable tool annotation presets
 * Used by operation modules to annotate tools with behavior hints
 */
export const ReadAnnotation: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const CreateAnnotation: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const UpdateAnnotation: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const DeleteAnnotation: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};
