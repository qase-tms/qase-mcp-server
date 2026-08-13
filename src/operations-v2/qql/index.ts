/**
 * QQL Search Operations
 *
 * Implements QQL (Qase Query Language) search functionality.
 * QQL enables powerful cross-project querying with complex filters.
 */

import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError, ToolExecutionError } from '../../utils/errors.js';
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
    // The REST endpoint accepts 2000 characters; capping at 1000 halved how many
    // IDs fit in an `in (...)` clause and doubled the round-trips for set analysis.
    .max(2000)
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
 * Help topics. `topic` is required: returning every section at once sends the
 * whole reference into the context on each call, and the sections are large
 * enough that it is worth asking for only the one needed.
 */
const HELP_TOPICS = [
  'overview',
  'syntax',
  'entities',
  'operators',
  'functions',
  'examples',
  'aggregation',
  'enumValues',
] as const;

/**
 * Schema for QQL help
 */
const GetQqlHelpSchema = z.object({
  topic: z
    .enum(HELP_TOPICS)
    .describe(
      'Which section to return (required — one section per call):\n' +
        '- overview: what QQL is, overall query structure, subscription requirement\n' +
        '- syntax: structure, ordering, custom fields, case-sensitivity, boolean and date fields\n' +
        '- entities: the fields available on each entity — field names are NOT uniform across ' +
        'entities, so read this before writing a query against an unfamiliar one\n' +
        '- operators: comparison, matching, set, null, and logical operators\n' +
        '- functions: currentUser, activeUsers, and the now/startOf*/endOf* date functions\n' +
        '- examples: ready-made queries for common questions\n' +
        '- aggregation: SELECT (COUNT/MIN/MAX/AVG/SUM/FIRST/LAST), GROUP BY, HAVING — use this ' +
        'to count or summarise instead of paging through rows\n' +
        '- enumValues: the valid values for priority, severity, and the per-entity status fields',
    ),
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
      structure:
        'Filtering: entity = "TYPE" and CONDITION [and CONDITION...] ' +
        '[ORDER BY field ASC/DESC]. ' +
        'Aggregating: SELECT (AGGREGATE[, ...]) entity = "TYPE" and CONDITION... ' +
        '[GROUP BY field] [HAVING condition] — SELECT comes FIRST, before the conditions.',
      entities: ['case', 'defect', 'run', 'result', 'plan', 'requirement'],
      note: 'QQL is only available in Business and Enterprise Qase subscriptions',
      fieldNamesVary:
        'Field names are NOT uniform across entities — see the `entities` topic before writing ' +
        'a query. Most common failure: `created` exists on case/defect/plan/requirement but ' +
        'NOT on run (started/ended) or result (ended only).',
      countWithoutPaging:
        'To count or aggregate, lead with SELECT (COUNT(id)) rather than paging through rows — ' +
        'e.g. SELECT (COUNT(id)) entity = "result" and project = "DEMO". See the `aggregation` ' +
        'topic.',
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
      case:
        'Test cases — entity = "case". Fields: id, title, description, preconditions, ' +
        'postconditions, status, type, behavior, automation, isManual, isToBeAutomated, ' +
        'priority, severity, layer, isMuted, isFlaky, isAiGenerated, suite, suiteTree, ' +
        'milestone, tags, project, author, createdBy, updatedBy, created, updated, deleted, ' +
        'isDeleted, plus custom fields via cf["Name"]. Note: `suite` matches the suite TITLE ' +
        '(a string), and `suiteTree` matches a suite plus all of its descendants.',
      defect:
        'Defects/bugs — entity = "defect". Fields: id, title, actual_result, status, severity, ' +
        'resolved, isResolved, milestone, tags, project, author, createdBy, created, updated, ' +
        'deleted, isDeleted, assignee, plus custom fields.',
      run:
        'Test runs — entity = "run". Fields: id, title, description, status, plan, environment, ' +
        'milestone, started, ended, isStarted, isEnded, isPublic, isAutotest, isScheduledRun, ' +
        'hash, type, tags, project, author, createdBy, deleted, isDeleted, plus custom fields. ' +
        'Note: no created/updated — use started/ended. status values: "In Progress", "Passed", ' +
        '"Failed", "Aborted" ("active" is not a status).',
      result:
        'Test results — entity = "result". Fields: id, caseId, case, run, status, priority, ' +
        'severity, type, layer, suite, tags, comment, timeSpent, ended, isEnded, deleted, ' +
        'isDeleted, milestone, project, author, createdBy, assignee. Note: no created/updated ' +
        '(only `ended`), no title/description, no custom fields, and no environment. Unlike ' +
        'case.suite, result.suite is a numeric suite ID. There is no run-ID field — `run` ' +
        'matches the run TITLE, so results cannot be tied to a specific run ID in QQL; use ' +
        'GET /v1/result/{code}?filters[run]=ID via qase_api for that. status has no ' +
        '"Untested" value.',
      plan: 'Test plans — entity = "plan". Fields: id, title, description, project, created, updated, deleted, isDeleted.',
      requirement:
        'Requirements — entity = "requirement". Fields: id, title, description, parent, status, ' +
        'type, project, author, createdBy, created, updated, deleted, isDeleted. Note: no link ' +
        'to cases, and status/type are the only case-SENSITIVE enum values in QQL ' +
        '(type = "User story" matches, "user-story" does not).',
    },
    aggregation: {
      description:
        'QQL can aggregate server-side instead of making you page through rows and count them.',
      functions: ['COUNT', 'MIN', 'MAX', 'AVG', 'SUM', 'FIRST', 'LAST'],
      syntax:
        'SELECT (aggregate[, aggregate...]) entity = "TYPE" and CONDITION... ' +
        '[GROUP BY field] [HAVING condition] — two hard requirements: the parentheses ' +
        'after SELECT are MANDATORY, and SELECT must come FIRST, before the conditions. ' +
        'Violating either fails with "Query is invalid", which does not say which one.',
      examples: [
        'SELECT (COUNT(id)) entity = "result" and project = "DEMO" and status = "failed"',
        'SELECT (COUNT(id)) entity = "result" and project = "DEMO" GROUP BY status',
        'SELECT (COUNT(id)) entity = "case" and project = "DEMO" GROUP BY suite HAVING COUNT(id) > 10',
        'SELECT (AVG(timeSpent), MAX(timeSpent)) entity = "result" and project = "DEMO"',
      ],
      enumsComeBackAsNumbers:
        'In aggregate results, enum fields are returned as their numeric IDs, not labels: ' +
        'result.status 1 = Passed, 2 = Failed, 5 = Skipped, 8 = Invalid; ' +
        'automation 0 = Manual, 1 = To be automated, 2 = Automated. Map them before reporting.',
      groupByAddsTitleSuffix:
        'Grouping by a string field returns it with a _title suffix — GROUP BY suite yields ' +
        'a `suite_title` key in the response, not `suite`.',
    },
    operators: {
      comparison: ['=', '!=', '<', '<=', '>', '>='],
      string: ['~', '!~', 'is', 'is not'],
      array: ['in', 'not in'],
      null: ['is empty', 'is not empty'],
      logical: ['and', 'or', 'not'],
    },
    enumValues: {
      priority:
        '"Not set", "High", "Medium", "Low" — there is NO "critical" priority; ' +
        'priority = "critical" fails. Critical belongs to severity.',
      severity: '"Not set", "Blocker", "Critical", "Major", "Normal", "Minor", "Trivial"',
      caseStatus: '"Actual", "Draft", "Deprecated"',
      caseAutomation: '"Manual" (a.k.a. "Not automated"), "To be automated", "Automated"',
      defectStatus: '"Open", "In progress", "Resolved", "Invalid"',
      runStatus: '"In Progress", "Passed", "Failed", "Aborted"',
      resultStatus: '"passed", "failed", "skipped", "invalid" — there is no "Untested"',
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

  // Handlers receive raw MCP arguments, so the schema's `required` is not
  // enforced at runtime — reject a missing or unknown topic with the list of
  // valid ones rather than returning undefined content.
  if (!topic || !(topic in help)) {
    throw new ToolExecutionError(
      `Unknown help topic${topic ? ` "${topic}"` : ''}. ` +
        `Pass one of: ${HELP_TOPICS.join(', ')}.`,
    );
  }

  return { topic, content: help[topic] };
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
  description:
    'Get one section of the Qase Query Language (QQL) reference. `topic` is required — ask for ' +
    'the section you need rather than the whole reference. Start with "entities" when you are ' +
    'unsure which fields an entity has (they differ per entity), "aggregation" to count or ' +
    'summarise without paging, and "enumValues" for valid field values.',
  schema: GetQqlHelpSchema,
  handler: getQqlHelp,
  annotations: ReadAnnotation,
});
