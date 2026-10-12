/**
 * Tool Registry System
 *
 * Centralized system for managing MCP tool registration:
 * - Register tools with Zod schemas
 * - Convert Zod schemas to JSON Schema automatically
 * - Store and retrieve tool handlers
 * - Manage tool lifecycle
 * - Every registered tool is listed; qase_discover_tools is a search over the catalogue
 */
import { Tool, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';

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
/**
 * `Number.MAX_SAFE_INTEGER`, which zod emits as the bound of every integer.
 *
 * It is true — a JSON number above it loses precision in JavaScript — but it
 * is true of every integer everywhere, so repeating it on all 55 integer
 * fields spends bytes in every tool list to tell the model something that
 * never changes and that no caller of ours is anywhere near. Our integers are
 * record IDs and page sizes.
 */
const SAFE_INTEGER_BOUND = 9007199254740991;

/** Drop that bound wherever zod attached it, in place. */
function stripSafeIntegerBounds(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) stripSafeIntegerBounds(item);
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  if (record.type === 'integer') {
    if (record.maximum === SAFE_INTEGER_BOUND) delete record.maximum;
    if (record.minimum === -SAFE_INTEGER_BOUND) delete record.minimum;
  }
  for (const value of Object.values(record)) stripSafeIntegerBounds(value);
}

/**
 * Sort by `name`, comparing code units rather than by locale: ListTools and
 * ListPrompts must come back in the same order on every host.
 */
function byName(a: { name: string }, b: { name: string }): number {
  if (a.name < b.name) return -1;
  return a.name > b.name ? 1 : 0;
}

/** JSON Schema object type for outputSchema */
export interface OutputSchema {
  type: 'object';
  properties?: Record<string, object>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  name: string;
  /** Human-readable name clients show in tool pickers and call confirmations */
  title: string;
  description: string;
  schema: T;
  handler: ToolHandler;
  annotations?: ToolAnnotations;
  /** JSON Schema describing the tool's output — enables clients to process results programmatically */
  outputSchema?: OutputSchema;
  /**
   * The long documentation, read on demand through qase_tool_help.
   *
   * `description` is sent to the model on every request, so it says what the
   * tool is for and what it costs and stops. Everything else an agent needs
   * before its first call — the traps, the limits, the field semantics — goes
   * here, where it costs nothing until it is asked for.
   */
  help?: string;
}

/**
 * Annotation hints as the MCP spec defaults them when a tool says nothing.
 * A hint equal to its default carries no information, so the wire projection
 * leaves it out — the client reads exactly the same meaning either way.
 */
const SPEC_DEFAULT_HINTS: Readonly<Record<string, boolean>> = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * The shape a tool takes on the wire, as opposed to the one the registry
 * stores. Every byte of `tools/list` is sent to the model on every request:
 *
 *  - hints equal to the spec defaults are dropped (see SPEC_DEFAULT_HINTS);
 *  - `outputSchema` is dropped: no client validates results against it, and
 *    its one job here — deciding whether to attach `structuredContent` — is
 *    now done for every object result (see server.ts).
 *
 * The stored definition keeps both, because handlers and tests read it.
 */
function toWire(tool: Tool): Tool {
  const { outputSchema: _omitted, annotations, ...rest } = tool;
  if (!annotations) return rest;
  const kept = Object.fromEntries(
    Object.entries(annotations).filter(([k, v]) => SPEC_DEFAULT_HINTS[k] !== v),
  );
  return Object.keys(kept).length ? { ...rest, annotations: kept } : rest;
}

/**
 * Tool Registry Class
 * Manages the lifecycle of MCP tools with support for dynamic discovery
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();
  private help: Map<string, string> = new Map();

  /**
   * Register a new tool with the registry
   *
   * @param definition - Tool definition including name, description, schema and handler
   *
   * @example
   * ```typescript
   * toolRegistry.register({
   *   name: 'list_projects',
   *   title: 'List projects',
   *   description: 'Get all projects',
   *   schema: z.object({ limit: z.number().optional() }),
   *   handler: async (args) => { ... },
   * });
   * ```
   */
  register<T extends z.ZodType>(definition: ToolDefinition<T>): void {
    const { name, title, description, schema, handler, annotations, outputSchema, help } =
      definition;

    // Convert the Zod schema to JSON Schema for the MCP protocol.
    //
    // `io: 'input'` is what the client is being described: a field with a
    // default is optional on the way in, and a `z.preprocess` is advertised by
    // what it accepts rather than by what it produces.
    //
    // zod emits `$defs` + `$ref` for a schema that refers to itself (the test
    // step tree). That is the only way to express recursion in JSON Schema at
    // all, and the pointers are same-document, which every JSON Schema
    // implementation resolves.
    //
    // Cast through `unknown`: the conversion is value-level, and letting
    // TypeScript infer it across our deepest schemas trips "excessively deep".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const converted = z.toJSONSchema(schema as any, { io: 'input' }) as Record<string, unknown>;

    // `$schema` says which dialect the document is written in. The tool list
    // repeats it in all 42 schemas and no client reads it, so it is dropped —
    // the MCP spec already fixes the dialect for `inputSchema`.
    const { $schema: _dialect, ...body } = converted;

    stripSafeIntegerBounds(body);

    const inputSchema: { type: 'object'; [key: string]: unknown } =
      body.type === 'object'
        ? (body as { type: 'object'; [key: string]: unknown })
        : { type: 'object', properties: {} };

    // Store tool definition
    this.tools.set(name, {
      name,
      title,
      description,
      inputSchema,
      ...(annotations && { annotations }),
      ...(outputSchema && { outputSchema }),
    });

    // Store handler function
    this.handlers.set(name, handler);
    if (help) this.help.set(name, help);

    // Log registration for debugging (to stderr)
    console.error(`[Registry] Registered tool: ${name}`);
  }

  /**
   * Every tool, in the shape it takes on the wire. Nothing is hidden: the
   * full list is what a client needs to call any of them, and a client cannot
   * be told about a list that changed on a stateless connection anyway.
   */
  getTools(): Tool[] {
    return this.getAllTools();
  }

  /** The long documentation of a tool, or undefined when it has none. */
  getHelp(name: string): string | undefined {
    return this.help.get(name);
  }

  /**
   * Get ALL registered tools regardless of activation status.
   * Used for discovery search and testing.
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).sort(byName).map(toWire);
  }

  /**
   * Search tools by name or description (case-insensitive substring match).
   * Searches the full catalog including inactive tools.
   */
  searchTools(query: string): Tool[] {
    // Match on words rather than on the whole string: a caller asking for
    // "delete project" means both words, and that phrase appears verbatim in no
    // tool. Matching it literally returned nothing and left every discoverable
    // tool hidden, since search is the only way to reach them.
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    return this.getAllTools().filter((t) => {
      const haystack = `${t.name} ${t.description ?? ''}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
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
