/**
 * Tool Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ToolRegistry } from './registry.js';
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
      description: 'Tool 1',
      schema,
      handler,
    });

    registry.register({
      name: 'tool2',
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
      description: 'Tool 1',
      schema,
      handler,
    });

    expect(registry.getToolCount()).toBe(1);

    registry.register({
      name: 'tool2',
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
      description: 'First',
      schema,
      handler: handler1,
    });

    registry.register({
      name: 'duplicate_tool',
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
      registry.register({ name: 'my_tool', description: 'desc', schema, handler: jest.fn() });

      const tool = registry.getTool('my_tool');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('my_tool');
      expect(tool?.description).toBe('desc');
    });

    it('returns undefined for non-existent tool', () => {
      expect(registry.getTool('missing')).toBeUndefined();
    });
  });

  describe('visibility and discovery', () => {
    const schema = z.object({});
    const handler = jest.fn();

    it('core tools (default) are active and in getTools()', () => {
      registry.register({ name: 'core_tool', description: 'core', schema, handler });

      expect(registry.getTools().map((t) => t.name)).toContain('core_tool');
    });

    it('explicit core visibility is active', () => {
      registry.register({
        name: 'explicit_core',
        description: 'core',
        schema,
        handler,
        visibility: 'core',
      });

      expect(registry.getTools().map((t) => t.name)).toContain('explicit_core');
    });

    it('discoverable tools are NOT in getTools() by default', () => {
      registry.register({
        name: 'hidden_tool',
        description: 'hidden',
        schema,
        handler,
        visibility: 'discoverable',
      });

      expect(registry.getTools().map((t) => t.name)).not.toContain('hidden_tool');
    });

    it('discoverable tools ARE in getAllTools()', () => {
      registry.register({
        name: 'hidden_tool',
        description: 'hidden',
        schema,
        handler,
        visibility: 'discoverable',
      });

      expect(registry.getAllTools().map((t) => t.name)).toContain('hidden_tool');
    });

    it('discoverable tools have a handler even when inactive', () => {
      registry.register({
        name: 'hidden_tool',
        description: 'hidden',
        schema,
        handler,
        visibility: 'discoverable',
      });

      expect(registry.getHandler('hidden_tool')).toBe(handler);
    });

    it('mixed core and discoverable tools', () => {
      registry.register({ name: 'core_a', description: 'a', schema, handler });
      registry.register({
        name: 'disc_b',
        description: 'b',
        schema,
        handler,
        visibility: 'discoverable',
      });
      registry.register({ name: 'core_c', description: 'c', schema, handler });

      const active = registry.getTools().map((t) => t.name);
      expect(active).toEqual(['core_a', 'core_c']);

      const all = registry.getAllTools().map((t) => t.name);
      expect(all).toEqual(['core_a', 'disc_b', 'core_c']);
    });
  });

  describe('activateTools', () => {
    const schema = z.object({});
    const handler = jest.fn();

    it('activates discoverable tools and returns newly activated names', () => {
      registry.register({
        name: 'hidden',
        description: 'h',
        schema,
        handler,
        visibility: 'discoverable',
      });

      const activated = registry.activateTools(['hidden']);
      expect(activated).toEqual(['hidden']);
      expect(registry.getTools().map((t) => t.name)).toContain('hidden');
    });

    it('returns empty array for already-active tools', () => {
      registry.register({ name: 'core_tool', description: 'c', schema, handler });

      const activated = registry.activateTools(['core_tool']);
      expect(activated).toEqual([]);
    });

    it('ignores non-existent tool names', () => {
      const activated = registry.activateTools(['nonexistent']);
      expect(activated).toEqual([]);
    });

    it('triggers onToolsChanged callback when tools are activated', () => {
      registry.register({
        name: 'hidden',
        description: 'h',
        schema,
        handler,
        visibility: 'discoverable',
      });
      const callback = jest.fn();
      registry.onToolsChanged = callback;

      registry.activateTools(['hidden']);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('does NOT trigger onToolsChanged when no new tools activated', () => {
      registry.register({ name: 'core_tool', description: 'c', schema, handler });
      const callback = jest.fn();
      registry.onToolsChanged = callback;

      registry.activateTools(['core_tool']);

      expect(callback).not.toHaveBeenCalled();
    });

    it('does NOT trigger onToolsChanged when callback is not set', () => {
      registry.register({
        name: 'hidden',
        description: 'h',
        schema,
        handler,
        visibility: 'discoverable',
      });

      // Should not throw
      expect(() => registry.activateTools(['hidden'])).not.toThrow();
    });
  });

  describe('searchTools', () => {
    const schema = z.object({});
    const handler = jest.fn();

    beforeEach(() => {
      registry.register({ name: 'qase_case_delete', description: 'Delete a test case', schema, handler, visibility: 'discoverable' });
      registry.register({ name: 'qase_case_upsert', description: 'Create or update a test case', schema, handler });
      registry.register({ name: 'qase_run_delete', description: 'Delete a test run', schema, handler, visibility: 'discoverable' });
      registry.register({ name: 'qql_search', description: 'Search entities using QQL', schema, handler });
    });

    it('searches by tool name (case-insensitive)', () => {
      const results = registry.searchTools('DELETE');
      expect(results.map((t) => t.name)).toEqual(['qase_case_delete', 'qase_run_delete']);
    });

    it('searches by description (case-insensitive)', () => {
      const results = registry.searchTools('test case');
      expect(results.map((t) => t.name)).toEqual(['qase_case_delete', 'qase_case_upsert']);
    });

    it('includes inactive (discoverable) tools in results', () => {
      const results = registry.searchTools('delete');
      expect(results).toHaveLength(2);
      // These are discoverable and inactive
      expect(registry.getTools().map((t) => t.name)).not.toContain('qase_case_delete');
    });

    it('returns empty array for no matches', () => {
      const results = registry.searchTools('nonexistent_xyz');
      expect(results).toEqual([]);
    });

    it('returns all tools for broad query', () => {
      const results = registry.searchTools('qase');
      expect(results).toHaveLength(3); // all qase_* tools
    });
  });

  describe('unregister with visibility', () => {
    it('removes tool from all collections', () => {
      const schema = z.object({});
      registry.register({
        name: 'to_remove',
        description: 'x',
        schema,
        handler: jest.fn(),
        visibility: 'discoverable',
      });

      registry.activateTools(['to_remove']);
      expect(registry.getTools().map((t) => t.name)).toContain('to_remove');

      registry.unregister('to_remove');
      expect(registry.getTools().map((t) => t.name)).not.toContain('to_remove');
      expect(registry.getAllTools().map((t) => t.name)).not.toContain('to_remove');
      expect(registry.getHandler('to_remove')).toBeUndefined();
    });
  });

  describe('clear with visibility', () => {
    it('clears all tools and activation state', () => {
      const schema = z.object({});
      const handler = jest.fn();
      registry.register({ name: 'a', description: 'a', schema, handler });
      registry.register({ name: 'b', description: 'b', schema, handler, visibility: 'discoverable' });
      registry.activateTools(['b']);

      registry.clear();

      expect(registry.getTools()).toHaveLength(0);
      expect(registry.getAllTools()).toHaveLength(0);
      expect(registry.getToolCount()).toBe(0);
    });
  });
});
