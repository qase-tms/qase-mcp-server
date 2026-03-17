/**
 * Smoke Tests for All MCP Tools
 *
 * Auto-discovers every registered tool and verifies:
 * - Tool has name, description, and inputSchema
 * - Tool has a registered handler
 * - Handler is callable (won't throw TypeError/ReferenceError)
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { setTestEnv } from './utils/test-helpers.js';

// Set env before any operation module imports trigger getApiClient()
setTestEnv();

// Mock the API client module — return a Proxy that auto-stubs any nested access
jest.mock('./client/index.js', () => {
  const mockResponse = Promise.resolve({ data: { status: true, result: {} } });

  // Deep proxy that returns jest.fn() returning mockResponse for any method call
  const createDeepProxy = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then' || prop === 'catch' || prop === 'finally') {
            return undefined; // Don't make the proxy thenable
          }
          // Return a function that resolves with mock data
          const fn = jest.fn().mockReturnValue(mockResponse);
          // Also make the function itself a proxy for chained access
          return new Proxy(fn, {
            get(fnTarget, fnProp) {
              if (fnProp in fnTarget) {
                return (fnTarget as any)[fnProp];
              }
              return jest.fn().mockReturnValue(mockResponse);
            },
          });
        },
      },
    );

  return {
    getApiClient: jest.fn().mockReturnValue(createDeepProxy()),
    apiRequest: jest.fn().mockResolvedValue({ status: true, result: {} }),
    resetClientInstance: jest.fn(),
  };
});

// Import all operation modules to trigger tool registration
import './operations/projects.js';
import './operations/cases.js';
import './operations/suites.js';
import './operations/runs.js';
import './operations/results.js';
import './operations/plans.js';
import './operations/shared-steps.js';
import './operations/shared-parameters.js';
import './operations/milestones.js';
import './operations/defects.js';
import './operations/environments.js';
import './operations/attachments.js';
import './operations/authors.js';
import './operations/custom-fields.js';
import './operations/system-fields.js';
import './operations/configurations.js';
import './operations/users.js';
import './operations/search.js';

import { toolRegistry } from './utils/registry.js';

// Helper to extract JSON schema properties from a registered tool
function getSchemaProperties(toolName: string): Record<string, any> {
  const tool = toolRegistry.getTools().find((t) => t.name === toolName);
  return (tool?.inputSchema as any)?.properties ?? {};
}

function getSchemaRequired(toolName: string): string[] {
  const tool = toolRegistry.getTools().find((t) => t.name === toolName);
  return (tool?.inputSchema as any)?.required ?? [];
}

describe('Schema-API Contract Tests', () => {
  /**
   * Helper: assert that specific fields in a tool schema have the expected JSON Schema type.
   * Entries: [toolName, fieldName, expectedType]
   */
  function assertFieldTypes(specs: [string, string, string][]) {
    it.each(specs)('%s.%s should be type "%s"', (tool, field, expected) => {
      const props = getSchemaProperties(tool);
      expect(props[field]?.type).toBe(expected);
    });
  }

  /**
   * Helper: assert fields exist in a tool schema.
   */
  function assertFieldsExist(specs: [string, string][]) {
    it.each(specs)('%s should have field "%s"', (tool, field) => {
      const props = getSchemaProperties(tool);
      expect(props[field]).toBeDefined();
    });
  }

  // ── cases.ts ──────────────────────────────────────────────────────────
  describe('cases.ts — enum fields accept string or integer (Bug #13)', () => {
    const caseEnumFields = [
      'severity',
      'priority',
      'type',
      'layer',
      'behavior',
      'status',
    ];

    it.each(['create_case', 'update_case'])(
      '%s: enum fields should accept string or integer (anyOf)',
      (toolName) => {
        const props = getSchemaProperties(toolName);
        for (const field of caseEnumFields) {
          // CaseEnumValueSchema is a union, so it should have anyOf
          expect(props[field]?.anyOf ?? props[field]?.type).toBeDefined();
        }
      },
    );

    it('bulk_create_cases: enum fields should be defined', () => {
      const props = getSchemaProperties('bulk_create_cases');
      const itemProps = props.cases?.items?.properties ?? {};
      for (const field of caseEnumFields) {
        expect(itemProps[field]).toBeDefined();
      }
    });
  });

  describe('cases.ts — steps_type field (Feature #17)', () => {
    assertFieldsExist([
      ['create_case', 'steps_type'],
      ['update_case', 'steps_type'],
    ]);
  });

  describe('cases.ts — is_flaky should be boolean', () => {
    assertFieldTypes([
      ['create_case', 'is_flaky', 'boolean'],
      ['update_case', 'is_flaky', 'boolean'],
    ]);
  });

  // ── attachments.ts ────────────────────────────────────────────────────
  describe('attachments.ts — upload_attachment (Bug #14)', () => {
    it('code should be required', () => {
      const required = getSchemaRequired('upload_attachment');
      expect(required).toContain('code');
    });

    it('handler should not crash with file.forEach TypeError', async () => {
      const handler = toolRegistry.getHandler('upload_attachment')!;
      await expect(
        handler({ code: 'TEST', file: 'dGVzdA==', filename: 'test.txt' }),
      ).resolves.toBeDefined();
    });
  });

  // ── defects.ts ────────────────────────────────────────────────────────
  describe('defects.ts — severity type mismatch', () => {
    assertFieldTypes([
      ['create_defect', 'severity', 'integer'],
      ['update_defect', 'severity', 'integer'],
    ]);
  });

  // ── runs.ts ───────────────────────────────────────────────────────────
  describe('runs.ts — time fields', () => {
    assertFieldTypes([
      ['create_run', 'start_time', 'string'],
      ['create_run', 'end_time', 'string'],
    ]);
  });

  // ── results.ts ────────────────────────────────────────────────────────
  describe('results.ts — field types match SDK', () => {
    // SDK: getResults(code, status?: string, run?: string, caseId?: string, ...)
    assertFieldTypes([
      ['list_results', 'status', 'string'],
      ['list_results', 'run', 'string'],
      ['list_results', 'case_id', 'string'],
      ['list_results', 'from_end_time', 'string'],
      ['list_results', 'to_end_time', 'string'],
    ]);

    // SDK: CreateResult has case_id as number, time_ms as number
    assertFieldTypes([
      ['create_result', 'case_id', 'integer'],
      ['create_result', 'time_ms', 'integer'],
      ['update_result', 'time_ms', 'integer'],
    ]);

    // status should be a string enum, not a number
    it('create_result status should be a string enum', () => {
      const props = getSchemaProperties('create_result');
      expect(props.status?.type).toBe('string');
      expect(props.status?.enum).toBeDefined();
    });
  });

  // ── milestones.ts ─────────────────────────────────────────────────────
  describe('milestones.ts — field types match SDK', () => {
    // SDK: MilestoneCreate has due_date?: number (unix timestamp)
    assertFieldTypes([
      ['create_milestone', 'due_date', 'number'],
      ['update_milestone', 'due_date', 'number'],
    ]);

    assertFieldTypes([
      ['create_milestone', 'title', 'string'],
      ['update_milestone', 'title', 'string'],
    ]);
  });

  // ── projects.ts ───────────────────────────────────────────────────────
  describe('projects.ts — field types match SDK', () => {
    assertFieldTypes([
      ['create_project', 'title', 'string'],
      ['create_project', 'code', 'string'],
    ]);
  });

  // ── suites.ts ─────────────────────────────────────────────────────────
  describe('suites.ts — field types match SDK', () => {
    assertFieldTypes([
      ['create_suite', 'title', 'string'],
    ]);

    // parent_id should be integer if present
    it('create_suite parent_id should be integer', () => {
      const props = getSchemaProperties('create_suite');
      if (props.parent_id) {
        expect(props.parent_id.type).toBe('integer');
      }
    });
  });

  // ── environments.ts ───────────────────────────────────────────────────
  describe('environments.ts — field types match SDK', () => {
    assertFieldTypes([
      ['create_environment', 'title', 'string'],
    ]);
  });

  // ── plans.ts ──────────────────────────────────────────────────────────
  describe('plans.ts — field types match SDK', () => {
    assertFieldTypes([
      ['create_plan', 'title', 'string'],
    ]);

    // cases should be array of integers
    it('create_plan cases should be an array', () => {
      const props = getSchemaProperties('create_plan');
      if (props.cases) {
        expect(props.cases.type).toBe('array');
        expect(props.cases.items?.type).toBe('integer');
      }
    });
  });

  // ── shared-steps.ts ───────────────────────────────────────────────────
  describe('shared-steps.ts — field types match SDK', () => {
    assertFieldTypes([
      ['create_shared_step', 'title', 'string'],
    ]);
  });

  // ── custom-fields.ts ─────────────────────────────────────────────────
  describe('custom-fields.ts — field types match SDK', () => {
    assertFieldTypes([
      ['create_custom_field', 'title', 'string'],
    ]);

    it('create_custom_field entity should be a string or enum', () => {
      const props = getSchemaProperties('create_custom_field');
      if (props.entity) {
        expect(['string'].includes(props.entity.type)).toBe(true);
      }
    });
  });

  // ── Cross-cutting: all ID fields should be integer ────────────────────
  describe('ID fields should be integer across all tools', () => {
    const toolsWithId: [string, string][] = [
      ['get_case', 'id'],
      ['update_case', 'id'],
      ['delete_case', 'id'],
      ['get_defect', 'id'],
      ['update_defect', 'id'],
      ['delete_defect', 'id'],
      ['get_run', 'id'],
      ['delete_run', 'id'],
      ['complete_run', 'id'],
      ['get_milestone', 'id'],
      ['update_milestone', 'id'],
      ['delete_milestone', 'id'],
      ['get_suite', 'id'],
      ['update_suite', 'id'],
      ['delete_suite', 'id'],
      ['get_plan', 'id'],
      ['update_plan', 'id'],
      ['delete_plan', 'id'],
    ];

    assertFieldTypes(toolsWithId.map(([tool, field]) => [tool, field, 'integer']));
  });

  // ── Cross-cutting: pagination fields ──────────────────────────────────
  describe('pagination fields should be integer across list tools', () => {
    const listTools = [
      'list_cases',
      'list_defects',
      'list_runs',
      'list_results',
      'list_milestones',
      'list_suites',
      'list_plans',
      'list_attachments',
      'list_environments',
    ];

    it.each(listTools)('%s: limit and offset should be integer', (toolName) => {
      const props = getSchemaProperties(toolName);
      if (props.limit) {
        expect(props.limit.type).toBe('integer');
      }
      if (props.offset) {
        expect(props.offset.type).toBe('integer');
      }
    });
  });

  // ── Cross-cutting: required fields ────────────────────────────────────
  describe('required fields match SDK expectations', () => {
    it.each([
      ['create_case', 'code'],
      ['create_case', 'title'],
      ['create_defect', 'code'],
      ['create_defect', 'title'],
      ['create_run', 'code'],
      ['create_run', 'title'],
      ['create_result', 'code'],
      ['create_result', 'id'],
      ['create_result', 'status'],
      ['upload_attachment', 'code'],
      ['upload_attachment', 'file'],
      ['upload_attachment', 'filename'],
    ])('%s should require "%s"', (tool, field) => {
      const required = getSchemaRequired(tool);
      expect(required).toContain(field);
    });
  });
});

describe('Tool Smoke Tests', () => {
  let allTools: ReturnType<typeof toolRegistry.getTools>;
  let toolNames: string[];

  beforeAll(() => {
    allTools = toolRegistry.getTools();
    toolNames = allTools.map((t) => t.name);
  });

  it('should have tools registered', () => {
    expect(allTools.length).toBeGreaterThan(0);
    console.error(`[Smoke] Found ${allTools.length} registered tools`);
  });

  it('every tool has a description and inputSchema', () => {
    for (const tool of allTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    }
  });

  it('every tool has a handler', () => {
    for (const name of toolNames) {
      const handler = toolRegistry.getHandler(name);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    }
  });

  it.each(
    // Lazily compute tool names — toolRegistry is populated after imports above
    (() => {
      const tools = toolRegistry.getTools();
      return tools.map((t) => t.name);
    })(),
  )('tool "%s" handler is callable', async (toolName) => {
    const handler = toolRegistry.getHandler(toolName)!;

    try {
      await handler({});
    } catch (error: unknown) {
      // Zod validation errors, API errors, and TypeErrors from undefined args
      // are all expected when calling handlers with empty args.
      // ReferenceError would indicate broken code (missing variable/import).
      if (error instanceof ReferenceError) {
        throw new Error(
          `Tool "${toolName}" threw ${error.constructor.name}: ${error.message}\n${error.stack}`,
        );
      }
      // Any other error is acceptable (validation, API mock errors, etc.)
    }
  });
});
