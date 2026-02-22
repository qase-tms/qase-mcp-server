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
});
