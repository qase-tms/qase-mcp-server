/**
 * qase_tool_help — the long documentation of one tool, read on demand.
 *
 * A tool's description is sent to the model on every request, so it is kept
 * to what the tool is for and what it costs. The rest of what an agent needs
 * before a first call — the traps, the limits, the field semantics — is
 * stored as `help` on the definition and served from here, once, when asked.
 */

import { z } from 'zod';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { ToolExecutionError } from '../../utils/errors.js';

const Schema = z.object({
  tool: z.string().min(1).describe('The tool name, exactly as it appears in the tool list'),
});

async function handler(rawArgs: Record<string, unknown>) {
  const { tool } = Schema.parse(rawArgs);
  const definition = toolRegistry.getTool(tool);
  const help = toolRegistry.getHelp(tool);
  if (!definition || !help) {
    const names = toolRegistry
      .getDefinitions()
      .map((t) => t.name)
      .join(', ');
    throw new ToolExecutionError(`No help for "${tool}". Tools with help: ${names}`);
  }
  return { tool, title: definition.title, description: definition.description, help };
}

toolRegistry.register({
  name: 'qase_tool_help',
  title: 'Tool documentation',
  description:
    'Read the full documentation of one tool before calling it for the first time in a session. ' +
    'Every description in the tool list is deliberately short — what the tool is for and what it ' +
    'costs — and the details that prevent a wrong first call live here: argument semantics, ' +
    'limits, what cannot be undone, and which tool to use instead. Pass the tool name exactly as ' +
    'listed. Cost: no API call, static text, about 1ms. Cheaper than one rejected call.',
  help:
    'This tool is its own documentation. Call it with the name of any other tool to read that ' +
    "tool's full help before the first use.",
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
});
