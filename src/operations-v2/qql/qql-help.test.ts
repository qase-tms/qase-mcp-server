/**
 * Tests for qql_help — the model's only guide to QQL, so wrong or missing
 * information here turns directly into failing queries.
 */

import { describe, it, expect } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({ search: { search: jest.fn() } }),
}));

import './index.js';
import { toolRegistry } from '../../utils/registry.js';

function help(topic?: string): any {
  const handler = toolRegistry.getHandler('qql_help')!;
  return handler(topic ? { topic } : {});
}

/**
 * Flatten a help section to text so assertions don't depend on its shape.
 * Quotes are un-escaped so assertions can be written the way the help reads.
 */
function textOf(value: unknown): string {
  return JSON.stringify(value).replace(/\\"/g, '"');
}

describe('qql_help — aggregation', () => {
  it('documents aggregation instead of leaving the model to page and count', async () => {
    const { content } = await help('aggregation');
    const text = textOf(content);

    for (const fn of ['COUNT', 'MIN', 'MAX', 'AVG', 'SUM', 'FIRST', 'LAST']) {
      expect(text).toContain(fn);
    }
    expect(text).toContain('GROUP BY');
    expect(text).toContain('HAVING');
  });

  it('warns that the parentheses after SELECT are mandatory', async () => {
    const text = textOf((await help('aggregation')).content);

    // Without them the query fails outright — not guessable.
    expect(text).toContain('SELECT (');
    expect(text.toLowerCase()).toContain('mandatory');
  });

  it('explains that aggregate enums come back as numbers', async () => {
    const text = textOf((await help('aggregation')).content);

    expect(text).toContain('2 = Failed');
    expect(text).toContain('5 = Skipped');
  });

  it('explains the _title suffix added by GROUP BY', async () => {
    const text = textOf((await help('aggregation')).content);

    expect(text).toContain('suite_title');
  });
});

describe('qql_help — per-entity fields', () => {
  it('lists field names per entity rather than just labels', async () => {
    const text = textOf((await help('entities')).content);

    expect(text).toContain('suiteTree');
    expect(text).toContain('timeSpent');
    expect(text).toContain('isScheduledRun');
  });

  it('states which entities lack created/updated', async () => {
    const text = textOf((await help('entities')).content);

    // The single biggest source of failing queries.
    expect(text).toContain('no created/updated');
  });

  it('warns that result has no run-ID field', async () => {
    const text = textOf((await help('entities')).content);

    expect(text).toContain('no run-ID field');
  });

  it('flags that case.suite is a title but result.suite is a numeric ID', async () => {
    const text = textOf((await help('entities')).content);

    expect(text).toContain('suite TITLE');
    expect(text).toContain('numeric suite ID');
  });

  it('names requirement status/type as the case-sensitive exception', async () => {
    const text = textOf((await help('entities')).content);

    expect(text).toContain('User story');
  });
});

describe('qql_help — enum values', () => {
  it('warns that priority has no "critical" value', async () => {
    const text = textOf((await help('enumValues')).content);

    // priority = "critical" fails; critical is a severity.
    expect(text).toContain('NO "critical" priority');
  });

  it('lists run statuses without the non-existent "active"', async () => {
    const text = textOf((await help('enumValues')).content);

    expect(text).toContain('In Progress');
    expect(text).not.toContain('"active"');
  });

  it('states that result status has no Untested', async () => {
    const text = textOf((await help('enumValues')).content);

    expect(text).toContain('no "Untested"');
  });
});

describe('qql_help — corrections to previous content', () => {
  it('no longer claims field values are case-sensitive across the board', async () => {
    const text = textOf((await help('syntax')).content);

    expect(text).not.toContain('Queries are case-sensitive for field values');
    expect(text).toContain('label or its slug');
  });

  it('documents the full set of date functions', async () => {
    const text = textOf((await help('functions')).content);

    for (const fn of ['startOfWeek', 'endOfWeek', 'startOfMonth', 'endOfMonth']) {
      expect(text).toContain(fn);
    }
  });

  it('includes the !~ operator', async () => {
    const text = textOf((await help('operators')).content);

    expect(text).toContain('!~');
  });

  it('offers the new topics through the schema enum', () => {
    const schema = toolRegistry.getTool('qql_help')!.inputSchema as any;

    expect(schema.properties.topic.enum).toContain('aggregation');
    expect(schema.properties.topic.enum).toContain('enumValues');
  });
});

describe('qql_help — topic is required', () => {
  it('declares topic as required in the schema', () => {
    const schema = toolRegistry.getTool('qql_help')!.inputSchema as any;

    // Returning every section at once put the whole reference into context on
    // each call.
    expect(schema.required).toContain('topic');
  });

  it('serves the overview as a topic of its own', async () => {
    const { topic, content } = await help('overview');

    expect(topic).toBe('overview');
    expect(textOf(content)).toContain('Qase Query Language');
  });

  it('rejects a missing topic with the list of valid ones', async () => {
    // Handlers get raw MCP arguments, so `required` is not enforced at runtime.
    await expect(help()).rejects.toThrow(/Pass one of:.*aggregation/s);
  });

  it('rejects an unknown topic by name', async () => {
    await expect(help('syntaxx')).rejects.toThrow(/Unknown help topic "syntaxx"/);
  });

  it('returns one section, not the whole reference', async () => {
    const { content } = await help('operators');

    // The operators section only — no sibling sections leaking in.
    expect(content).toHaveProperty('comparison');
    expect(content).not.toHaveProperty('entities');
    expect(content).not.toHaveProperty('aggregation');
  });
});

describe('qql_search — query length', () => {
  it('allows the 2000 characters the REST endpoint accepts', () => {
    const schema = toolRegistry.getTool('qql_search')!.inputSchema as any;

    // A 1000-char cap halved how many IDs fit in an `in (...)` clause.
    expect(schema.properties.query.maxLength).toBe(2000);
  });

  it('advertises a valid recent-failures example', () => {
    const schema = toolRegistry.getTool('qql_search')!.inputSchema as any;
    const description: string = schema.properties.query.description;

    expect(description).toContain('ended >= now("-7d")');
    expect(description).not.toContain('created >= now');
  });
});
