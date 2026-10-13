/**
 * Tool search meta-tool.
 *
 * Every tool is listed from the start; this searches the catalogue by what
 * the agent is trying to do and returns the matching tools with their
 * descriptions, so a model that does not know the name of the right tool can
 * find it without reading the whole list again.
 */

import { z } from 'zod';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { DiscoverToolsOutput } from '../../utils/output-schemas.js';

const Schema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Search query to find tools by name or description. ' +
        'Examples: "delete", "milestone", "attachment", "suite"',
    ),
  category: z
    .enum(['read', 'write', 'delete', 'composite', 'all'])
    .optional()
    .describe('Filter by tool category'),
});

async function handler(args: z.infer<typeof Schema>) {
  const { query, category } = args;
  let matches = query ? toolRegistry.searchTools(query) : toolRegistry.getDefinitions();

  // Filter by category based on tool annotations
  if (category && category !== 'all') {
    matches = matches.filter((t) => {
      const ann = t.annotations;
      switch (category) {
        case 'delete':
          return ann?.destructiveHint === true;
        case 'read':
          return ann?.readOnlyHint === true;
        case 'write':
          return !ann?.readOnlyHint && !ann?.destructiveHint;
        case 'composite':
          return (
            t.name.startsWith('qase_ci_') ||
            t.name.startsWith('qase_triage_') ||
            t.name.startsWith('qase_regression_')
          );
        default:
          return true;
      }
    });
  }

  return {
    found: matches.length,
    tools: matches.map((t) => ({
      name: t.name,
      description: t.description,
      destructive: t.annotations?.destructiveHint ?? false,
    })),
  };
}

toolRegistry.register({
  name: 'qase_discover_tools',
  title: 'Discover more tools',
  description:
    'Search the tool catalogue by what you are trying to do — "delete", "milestone", "review", "custom field" — and get back the matching tools with their descriptions. Every tool is already listed and callable; use this when you do not know which one fits, rather than re-reading the whole list. Cost: no API call, matching happens in memory, about 3ms.',
  help:
    "Searches tool names and descriptions. Every word in the query must appear in a tool's name " +
    'or description, so prefer two or three words over a sentence. `category` narrows the result ' +
    'to read, write, delete or composite tools. Since 3.0.0 nothing is hidden: the full catalogue ' +
    'is in your tool list from the first request, so a match here is callable at once — there is ' +
    'no activation step and no notification to wait for. Read qase_tool_help for the full ' +
    'documentation of a tool before calling it for the first time.',
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
  outputSchema: DiscoverToolsOutput,
});
