/**
 * qase_tool_help: the long documentation of a tool, read on demand.
 *
 * Every byte of a tool's description is sent to the model on every request.
 * The description therefore says what a tool is for and what it costs, and
 * the rest — the traps, the limits, the field semantics — lives in `help`,
 * fetched once when the agent first reaches for the tool.
 */

import { describe, it, expect } from '@jest/globals';
import { toolRegistry } from '../../utils/registry.js';
import '../index.js';

const call = async (args: Record<string, unknown>) =>
  (await toolRegistry.getHandler('qase_tool_help')!(args)) as Record<string, unknown>;

describe('qase_tool_help', () => {
  it('is a core tool, visible without discovery', () => {
    expect(toolRegistry.getTools().map((t) => t.name)).toContain('qase_tool_help');
  });

  it('returns the long documentation of a tool by name', async () => {
    const r = await call({ tool: 'qase_attachment_upload' });

    expect(r.tool).toBe('qase_attachment_upload');
    expect(typeof r.help).toBe('string');
    // The long text carries what the short description deliberately leaves out.
    expect(r.help as string).toContain('32 MB');
  });

  it('names the available tools when asked about one that does not exist', async () => {
    await expect(call({ tool: 'qase_nope' })).rejects.toThrow(/qase_attachment_upload/);
  });
});

describe('every tool', () => {
  it('has help, and the help says more than the description', () => {
    const thin = toolRegistry
      .getDefinitions()
      // The help tool is its own documentation; everything else must say more in help.
      .filter((t) => t.name !== 'qase_tool_help')
      .map((t) => ({ name: t.name, help: toolRegistry.getHelp(t.name), description: t.description ?? '' }))
      .filter((t) => !t.help || t.help.length <= t.description.length)
      .map((t) => t.name);

    expect(thin).toEqual([]);
  });
});
