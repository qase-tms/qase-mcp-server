/**
 * Tool Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setTestEnv } from './test-helpers.js';

// Set env before any operation module imports trigger getApiClient()
setTestEnv();

// The operation modules build an API client on import; stub it away, same as
// smoke.test.ts, so importing the real catalog below has no network side effects.
jest.mock('../client/index.js', () => ({
  getApiClient: jest.fn().mockReturnValue({}),
  apiRequest: jest.fn().mockResolvedValue({ status: true, result: {} }),
  resetClientInstance: jest.fn(),
}));

// Import the real operation modules so the singleton `toolRegistry` below is
// populated with the production catalog (core/discoverable tools) rather than
// only the fixtures this file registers on its own local instances.
import '../operations-v2/index.js';

import { ToolRegistry, toolRegistry } from './registry.js';
import { z } from 'zod';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    registry = new ToolRegistry();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('should register a tool', () => {
    const schema = z.object({ name: z.string() });
    const handler = jest.fn();

    registry.register({
      name: 'test_tool',
      title: 'Test tool',
      description: 'A test tool',
      schema,
      handler,
    });

    expect(registry.hasTool('test_tool')).toBe(true);
  });

  it('should return all registered tools', () => {
    const schema = z.object({});
    const handler = jest.fn();

    registry.register({
      name: 'tool1',
      title: 'Tool1',
      description: 'Tool 1',
      schema,
      handler,
    });

    registry.register({
      name: 'tool2',
      title: 'Tool2',
      description: 'Tool 2',
      schema,
      handler,
    });

    const tools = registry.getTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual(['tool1', 'tool2']);
  });

  it('should retrieve tool handler', () => {
    const schema = z.object({});
    const handler = jest.fn();

    registry.register({
      name: 'test_tool',
      title: 'Test tool',
      description: 'A test tool',
      schema,
      handler,
    });

    const retrievedHandler = registry.getHandler('test_tool');
    expect(retrievedHandler).toBe(handler);
  });

  it('should return undefined for non-existent tool', () => {
    expect(registry.getHandler('nonexistent')).toBeUndefined();
  });

  it('should return correct tool count', () => {
    const schema = z.object({});
    const handler = jest.fn();

    expect(registry.getToolCount()).toBe(0);

    registry.register({
      name: 'tool1',
      title: 'Tool1',
      description: 'Tool 1',
      schema,
      handler,
    });

    expect(registry.getToolCount()).toBe(1);

    registry.register({
      name: 'tool2',
      title: 'Tool2',
      description: 'Tool 2',
      schema,
      handler,
    });

    expect(registry.getToolCount()).toBe(2);
  });

  it('should convert Zod schema to JSON Schema', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number().optional(),
    });
    const handler = jest.fn();

    registry.register({
      name: 'test_tool',
      title: 'Test tool',
      description: 'A test tool',
      schema,
      handler,
    });

    const tools = registry.getTools();
    expect(tools[0].inputSchema).toBeDefined();
    expect(typeof tools[0].inputSchema).toBe('object');
  });

  it('should handle tools with complex schemas', () => {
    const schema = z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      age: z.number().int().positive().optional(),
      tags: z.array(z.string()),
    });
    const handler = jest.fn();

    registry.register({
      name: 'complex_tool',
      title: 'Complex tool',
      description: 'A complex tool',
      schema,
      handler,
    });

    expect(registry.hasTool('complex_tool')).toBe(true);
    const tools = registry.getTools();
    expect(tools[0].inputSchema).toBeDefined();
    expect(typeof tools[0].inputSchema).toBe('object');
  });

  it('should not allow duplicate tool names', () => {
    const schema = z.object({});
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    registry.register({
      name: 'duplicate_tool',
      title: 'Duplicate tool',
      description: 'First',
      schema,
      handler: handler1,
    });

    registry.register({
      name: 'duplicate_tool',
      title: 'Duplicate tool',
      description: 'Second',
      schema,
      handler: handler2,
    });

    // Second registration should override the first
    expect(registry.getToolCount()).toBe(1);
    expect(registry.getHandler('duplicate_tool')).toBe(handler2);
  });

  describe('getTool', () => {
    it('returns the tool definition by name', () => {
      const schema = z.object({});
      registry.register({
        name: 'my_tool',
        title: 'My tool',
        description: 'desc',
        schema,
        handler: jest.fn(),
      });

      const tool = registry.getTool('my_tool');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('my_tool');
      expect(tool?.description).toBe('desc');
    });

    it('returns undefined for non-existent tool', () => {
      expect(registry.getTool('missing')).toBeUndefined();
    });
  });

  describe('searchTools', () => {
    const schema = z.object({});
    const handler = jest.fn();

    beforeEach(() => {
      registry.register({
        name: 'qase_case_delete',
        title: 'Qase case delete',
        description: 'Delete a test case',
        schema,
        handler,
      });
      registry.register({
        name: 'qase_case_upsert',
        title: 'Qase case upsert',
        description: 'Create or update a test case',
        schema,
        handler,
      });
      registry.register({
        name: 'qase_run_delete',
        title: 'Qase run delete',
        description: 'Delete a test run',
        schema,
        handler,
      });
      registry.register({
        name: 'qql_search',
        title: 'Qql search',
        description: 'Search entities using QQL',
        schema,
        handler,
      });
    });

    it('searches by tool name (case-insensitive)', () => {
      const results = registry.searchTools('DELETE');
      expect(results.map((t) => t.name)).toEqual(['qase_case_delete', 'qase_run_delete']);
    });

    it('searches by description (case-insensitive)', () => {
      const results = registry.searchTools('test case');
      expect(results.map((t) => t.name)).toEqual(['qase_case_delete', 'qase_case_upsert']);
    });

    it('searches the whole catalogue, and every hit is already listed', () => {
      const results = registry.searchTools('delete');
      expect(results).toHaveLength(2);
      expect(registry.getTools().map((t) => t.name)).toContain('qase_case_delete');
    });

    it('returns empty array for no matches', () => {
      const results = registry.searchTools('nonexistent_xyz');
      expect(results).toEqual([]);
    });

    it('returns all tools for broad query', () => {
      const results = registry.searchTools('qase');
      expect(results).toHaveLength(3); // all qase_* tools
    });

    // A multi-word query used to be matched as one literal substring, so the
    // most natural phrasings returned nothing: "delete run" does not appear in
    // "Delete a test run", even though both words do. Discoverable tools are
    // invisible until search finds them, so a miss here hides them entirely.
    it('matches a multi-word query on words, not as one literal substring', () => {
      const results = registry.searchTools('delete run');
      expect(results.map((t) => t.name)).toEqual(['qase_run_delete']);
    });

    it('requires every word to match, so unrelated words narrow the result', () => {
      expect(registry.searchTools('delete case').map((t) => t.name)).toEqual(['qase_case_delete']);
      expect(registry.searchTools('delete unicorn')).toEqual([]);
    });

    it('matches words across the name and the description together', () => {
      // "upsert" is only in the name, "test case" only in the description.
      expect(registry.searchTools('upsert test case').map((t) => t.name)).toEqual([
        'qase_case_upsert',
      ]);
    });

    it('ignores extra whitespace between words', () => {
      expect(registry.searchTools('  delete   run  ').map((t) => t.name)).toEqual([
        'qase_run_delete',
      ]);
    });

    it('still treats a single word as a plain substring', () => {
      expect(registry.searchTools('qql').map((t) => t.name)).toEqual(['qql_search']);
    });

    it('returns nothing for an empty query rather than every tool', () => {
      expect(registry.searchTools('   ')).toEqual([]);
    });
  });

  describe('unregister with visibility', () => {
    it('removes tool from all collections', () => {
      const schema = z.object({});
      registry.register({
        name: 'to_remove',
        title: 'To remove',
        description: 'x',
        schema,
        handler: jest.fn(),
      });

      expect(registry.getTools().map((t) => t.name)).toContain('to_remove');

      registry.unregister('to_remove');
      expect(registry.getTools().map((t) => t.name)).not.toContain('to_remove');
      expect(registry.getAllTools().map((t) => t.name)).not.toContain('to_remove');
      expect(registry.getHandler('to_remove')).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('clears every tool', () => {
      const schema = z.object({});
      const handler = jest.fn();
      registry.register({ name: 'a', title: 'A', description: 'a', schema, handler });
      registry.register({
        name: 'b',
        title: 'B',
        description: 'b',
        schema,
        handler,
      });

      registry.clear();

      expect(registry.getTools()).toHaveLength(0);
      expect(registry.getAllTools()).toHaveLength(0);
      expect(registry.getToolCount()).toBe(0);
    });
  });
});

describe('getTools() — the real catalogue', () => {
  it('lists every registered tool, nothing hidden', () => {
    const listed = toolRegistry.getTools().map((t) => t.name);
    for (const t of toolRegistry.getAllTools()) expect(listed).toContain(t.name);
    expect(listed).toContain('qase_case_delete');
    expect(listed).toContain('qase_review_create');
  });
});
