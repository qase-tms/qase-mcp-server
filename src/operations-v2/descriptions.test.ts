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
import type { Tool } from "@modelcontextprotocol/server";
import { toolRegistry } from '../utils/registry.js';
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

// A discoverable tool is missing from the client's tool list until discovery
// activates it, and some clients build their dispatch table once at connect
// time and never rebuild it on notifications/tools/list_changed. Naming a
// hidden tool in text the model always reads therefore points it at something
// its own client cannot call — issue #93, where core `qase_case_upsert`
// recommended the hidden `qase_case_bulk_create` and the call died client-side
// with "is not a function". Anything named in always-visible text must be core,
// or the same sentence must say to run qase_discover_tools first.
describe('always-visible text only names callable tools', () => {
  let hidden: string[];

  beforeAll(() => {
    const core = new Set(toolRegistry.getTools().map((t) => t.name));
    hidden = tools.map((t) => t.name).filter((name) => !core.has(name));
  });

  function unreachableMentions(text: string): string[] {
    return text
      .split(/(?<=\.)\s+/)
      .filter((sentence) => !sentence.includes('qase_discover_tools'))
      .flatMap((sentence) => hidden.filter((name) => sentence.includes(name)));
  }

  it('the server instructions name no hidden tool without sending the agent to discovery', async () => {
    const { SERVER_INSTRUCTIONS } = await import('../server-instructions.js');

    expect(unreachableMentions(SERVER_INSTRUCTIONS)).toEqual([]);
  });

  it('no core description names a hidden tool without sending the agent to discovery', () => {
    const core = toolRegistry.getTools();
    const offenders = core.flatMap((t) =>
      unreachableMentions(t.description ?? '').map((name) => `${t.name} -> ${name}`),
    );

    expect(offenders).toEqual([]);
  });
});
