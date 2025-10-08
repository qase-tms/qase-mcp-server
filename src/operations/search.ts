/**
 * QQL Search Operations
 *
 * Implements QQL (Qase Query Language) search functionality.
 * QQL enables powerful cross-project querying with complex filters.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { QqlExamples } from '../utils/qql-helpers.js';

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
        '- entity = "result" and status = "failed" and created >= now("-7d")\n' +
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

  const result = await toResultAsync(
    (client as any).search({
      query,
      limit: limit || 10,
      offset: offset || 0,
    }),
  );

  return result.match(
    (response: any) => ({
      total: response.data.result.total,
      filtered: response.data.result.filtered,
      count: response.data.result.count,
      entities: response.data.result.entities,
    }),
    (error) => {
      throw new Error(error);
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
      caseNotes: 'Queries are case-sensitive for field values',
      stringMatching: '~ operator is case-insensitive substring match',
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
      string: ['~', 'is', 'is not'],
      array: ['in', 'not in'],
      null: ['is empty', 'is not empty'],
      logical: ['and', 'or', 'not'],
    },
    functions: {
      currentUser: 'currentUser() - Returns current user ID',
      activeUsers: 'activeUsers() - Returns all active user IDs',
      now: 'now("+/-Nd/w/m") - Current timestamp with optional offset (d=days, w=weeks, m=months)',
      startOfDay: 'startOfDay("YYYY-MM-DD") - Start of specified day',
      endOfDay: 'endOfDay("YYYY-MM-DD") - End of specified day',
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
});

toolRegistry.register({
  name: 'qql_help',
  description: 'Get help and examples for Qase Query Language (QQL) syntax',
  schema: GetQqlHelpSchema,
  handler: getQqlHelp,
});
