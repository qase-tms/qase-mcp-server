/**
 * Tool description quality.
 *
 * A description is the only thing an agent reads before choosing a tool, and
 * Claude will take up to 2000 characters of it. Ours averaged 181, twenty-four
 * of them under 200, and none said what a call costs — so agents fetched cases
 * one at a time: 518K single-record calls against 242K list calls over
 * thirteen weeks. These invariants keep the descriptions doing their job.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { setTestEnv } from '../utils/test-helpers.js';

setTestEnv();

import './index.js';
import { toolRegistry } from '../utils/registry.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

const MIN = 250;
const MAX = 2000; // what Claude reads; past this the tail is wasted

let tools: Tool[];

beforeAll(() => {
  tools = toolRegistry.getAllTools();
});

function describeOf(name: string): string {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`No such tool: ${name}`);
  return tool.description ?? '';
}

describe('every description', () => {
  it('says enough to choose the tool on', () => {
    const tooShort = tools
      .filter((t) => (t.description ?? '').length < MIN)
      .map((t) => `${t.name} (${(t.description ?? '').length})`);

    expect(tooShort).toEqual([]);
  });

  it('stays inside what the model actually reads', () => {
    const tooLong = tools
      .filter((t) => (t.description ?? '').length > MAX)
      .map((t) => `${t.name} (${(t.description ?? '').length})`);

    expect(tooLong).toEqual([]);
  });

  // Without this, nothing tells an agent that ten single fetches cost four
  // times one search, and it has no reason to prefer the cheaper call.
  it('states what the call costs', () => {
    const silent = tools.filter((t) => !(t.description ?? '').includes('Cost:')).map((t) => t.name);

    expect(silent).toEqual([]);
  });
});

// The pairs where an agent picks the expensive option unless told otherwise.
// Each tool has to name the alternative, in both directions.
describe('cheaper alternatives are cross-referenced', () => {
  const pairs: Array<[string, string]> = [
    ['qase_get', 'qql_search'],
    ['qql_search', 'qase_get'],
    ['qase_case_upsert', 'qase_case_bulk_create'],
    ['qase_case_bulk_create', 'qase_case_upsert'],
    ['qase_project_context', 'qase_get'],
    ['qase_result_record', 'qase_ci_report'],
    ['qase_ci_report', 'qase_result_record'],
    ['qase_review_create', 'qase_review_bulk_create'],
  ];

  it.each(pairs)('%s points at %s', (tool, alternative) => {
    expect(describeOf(tool)).toContain(alternative);
  });
});

describe('the server itself', () => {
  it('ships instructions telling an agent where to start', async () => {
    const { SERVER_INSTRUCTIONS } = await import('../server-instructions.js');

    expect(SERVER_INSTRUCTIONS.length).toBeGreaterThan(500);
    // The three routing decisions an agent gets wrong without being told.
    expect(SERVER_INSTRUCTIONS).toContain('qase_project_context');
    expect(SERVER_INSTRUCTIONS).toContain('qql_search');
    expect(SERVER_INSTRUCTIONS).toContain('qase_discover_tools');
  });
});
