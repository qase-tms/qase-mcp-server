/**
 * Tool Discovery Meta-Tool
 *
 * Searches and activates additional Qase tools on demand.
 * By default, only core tools are visible to reduce context token usage.
 * This tool lets the agent discover and activate tools for specific needs.
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
  activate: z
    .boolean()
    .optional()
    .default(true)
    .describe('If true (default), found tools are activated and become available for use'),
});

async function handler(args: z.infer<typeof Schema>) {
  const { query, category, activate } = args;

  let matches = query ? toolRegistry.searchTools(query) : toolRegistry.getAllTools();

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

  // Activate matched tools if requested
  const activated: string[] = [];
  if (activate) {
    const names = matches.map((t) => t.name);
    activated.push(...toolRegistry.activateTools(names));
  }

  return {
    found: matches.length,
    activated: activated.length,
    tools: matches.map((t) => ({
      name: t.name,
      description: t.description,
      destructive: t.annotations?.destructiveHint ?? false,
    })),
  };
}

toolRegistry.register({
  name: 'qase_discover_tools',
  description:
    'Search for and activate additional Qase tools. By default, only core tools are visible. ' +
    'Use this to find tools for specific needs: deletions, milestone management, attachments, etc. ' +
    'Found tools are automatically activated and become available for use.',
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
  outputSchema: DiscoverToolsOutput,
});
