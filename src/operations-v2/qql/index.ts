/**
 * QQL Search Operations
 *
 * Implements QQL (Qase Query Language) search functionality.
 * QQL enables powerful cross-project querying with complex filters.
 */

import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { QqlExamples } from '../../utils/qql-helpers.js';
import { QqlSearchOutput } from '../../utils/output-schemas.js';
import { richResult, summaryBlock, dataBlock, markdownTable } from '../../utils/rich-response.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for QQL search
 */
const QqlSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      'QQL query expression. Examples:\n' +
        '- entity = "case" and project = "DEMO" and status = "Actual"\n' +
        '- entity = "defect" and severity = "blocker" and status = "open"\n' +
        '- entity = "result" and status = "failed" and ended >= now("-7d")\n' +
        '- entity = "run" and milestone ~ "Sprint 12"\n' +
        'See QQL documentation for full syntax and examples.',
    ),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Maximum number of results to return (default: 10, max: 100)'),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of results to skip for pagination'),
});

/**
 * Schema for QQL help
 */
const GetQqlHelpSchema = z.object({
  topic: z
    .enum(['syntax', 'entities', 'operators', 'functions', 'examples'])
    .optional()
    .describe('Specific help topic, or omit for general overview'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Execute QQL search query
 */
async function qqlSearch(args: z.infer<typeof QqlSearchSchema>) {
  const client = getApiClient();
  const { query, limit, offset } = args;

  const result = await toResultAsync(client.search.search(query, limit || 10, offset || 0));

  return result.match(
    (response) => {
      const r = response.data.result;
      const total = r?.total ?? 0;
      const entities: any[] = r?.entities ?? [];

      const lines = [`Found **${total}** results (showing ${entities.length})`];
      if (entities.length > 0) {
        // Check if entities have status_text or status for table view
        const hasStatus = entities.some((e: any) => e.status_text || e.status !== undefined);
        if (hasStatus) {
          const headers = ['ID', 'Title', 'Status'];
          const rows = entities.map((e: any) => [
            String(e.id ?? '?'),
            (e.title || e.case?.title || e.actual_result || '-').substring(0, 60),
            String(e.status_text || e.status || '-'),
          ]);
          lines.push('', markdownTable(headers, rows));
        } else {
          lines.push('');
          for (const e of entities) {
            const id = e.id ?? '?';
            const title = e.title || e.case?.title || e.actual_result || `#${id}`;
            lines.push(`- **#${id}** ${title}`);
          }
        }
      }

      const structured = { total, entities };

      return richResult([summaryBlock(lines.join('\n')), dataBlock(structured)], structured);
    },
    (error) => {
      throw createToolError(error, 'search operation');
    },
  );
}

/**
 * Get QQL help and documentation
 */
async function getQqlHelp(args: z.infer<typeof GetQqlHelpSchema>) {
  const { topic } = args;

  const help = {
    overview: {
      description: 'QQL (Qase Query Language) allows powerful searches across Qase entities',
      structure: 'entity = "TYPE" and CONDITION [and CONDITION...] [ORDER BY field ASC/DESC]',
      entities: ['case', 'defect', 'run', 'result', 'plan', 'requirement'],
      note: 'QQL is only available in Business and Enterprise Qase subscriptions',
    },
    syntax: {
      basicStructure: 'entity = "TYPE" and CONDITION [and CONDITION...]',
      ordering: 'ORDER BY field ASC/DESC',
      customFields: 'cf["Field Name"] = value',
      caseNotes:
        'Enum values accept either the display label or its slug — severity = "Blocker" and ' +
        'severity = "blocker" match the same value. Exception: on the requirement entity, ' +
        'status and type ARE case-sensitive (type = "User story", not "user-story").',
      stringMatching: '~ operator is case-insensitive substring match',
      booleanFields: 'Boolean fields accept `is true` / `is false` as well as `= true` / `= false`',
      dateFields:
        'case, defect, plan, and requirement have created/updated; result has only `ended` ' +
        '(no created/updated); run has started/ended',
    },
    entities: {
      case: 'Test cases - entity = "case"',
      defect: 'Defects/bugs - entity = "defect"',
      run: 'Test runs - entity = "run"',
      result: 'Test results - entity = "result"',
      plan: 'Test plans - entity = "plan"',
      requirement: 'Requirements - entity = "requirement"',
    },
    operators: {
      comparison: ['=', '!=', '<', '<=', '>', '>='],
      string: ['~', '!~', 'is', 'is not'],
      array: ['in', 'not in'],
      null: ['is empty', 'is not empty'],
      logical: ['and', 'or', 'not'],
    },
    functions: {
      currentUser: 'currentUser() - Returns current user ID',
      activeUsers: 'activeUsers() - Returns all active user IDs',
      now: 'now("+/-Nd/w/m") - Current timestamp with optional offset (d=days, w=weeks, m=months; hours and years are NOT supported)',
      startOfDay: 'startOfDay("YYYY-MM-DD") - Start of specified day (also accepts an offset)',
      endOfDay: 'endOfDay("YYYY-MM-DD") - End of specified day (also accepts an offset)',
      startOfWeek: 'startOfWeek("YYYY-MM-DD") - Start of specified week (also accepts an offset)',
      endOfWeek: 'endOfWeek("YYYY-MM-DD") - End of specified week (also accepts an offset)',
      startOfMonth:
        'startOfMonth("YYYY-MM-DD") - Start of specified month (also accepts an offset)',
      endOfMonth: 'endOfMonth("YYYY-MM-DD") - End of specified month (also accepts an offset)',
    },
    examples: QqlExamples,
  };

  if (topic) {
    return { topic, content: help[topic as keyof typeof help] };
  }

  return help;
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'qql_search',
  description:
    'Search entities using Qase Query Language (QQL) with powerful filtering and cross-project queries',
  schema: QqlSearchSchema,
  handler: qqlSearch,
  annotations: ReadAnnotation,
  outputSchema: QqlSearchOutput,
});

toolRegistry.register({
  name: 'qql_help',
  description: 'Get help and examples for Qase Query Language (QQL) syntax',
  schema: GetQqlHelpSchema,
  handler: getQqlHelp,
  annotations: ReadAnnotation,
});
