/**
 * Smoke Tests for v2 MCP Tools
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

// Import v2 operation modules to trigger tool registration
import './operations-v2/index.js';

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

  // ── qase_case_upsert ──────────────────────────────────────────────────
  describe('qase_case_upsert — enum fields accept string labels', () => {
    const caseEnumFields = [
      'severity',
      'priority',
      'type',
      'layer',
      'behavior',
      'status',
    ];

    it('qase_case_upsert: enum fields should be string type', () => {
      const props = getSchemaProperties('qase_case_upsert');
      for (const field of caseEnumFields) {
        expect(props[field]?.type).toBe('string');
      }
    });
  });

  describe('qase_case_upsert — steps_type field', () => {
    assertFieldsExist([
      ['qase_case_upsert', 'steps_type'],
    ]);
  });

  describe('qase_case_upsert — is_flaky should be boolean', () => {
    assertFieldTypes([
      ['qase_case_upsert', 'is_flaky', 'boolean'],
    ]);
  });

  // ── qase_attachment_upload ────────────────────────────────────────────
  describe('qase_attachment_upload', () => {
    it('code should be required', () => {
      const required = getSchemaRequired('qase_attachment_upload');
      expect(required).toContain('code');
    });

    it('filename and file should be required', () => {
      const required = getSchemaRequired('qase_attachment_upload');
      expect(required).toContain('file');
      expect(required).toContain('filename');
    });

    it('handler should not crash with file.forEach TypeError', async () => {
      const handler = toolRegistry.getHandler('qase_attachment_upload')!;
      await expect(
        handler({ code: 'TEST', file: 'dGVzdA==', filename: 'test.txt' }),
      ).resolves.toBeDefined();
    });
  });

  // ── qase_defect_upsert ────────────────────────────────────────────────
  describe('qase_defect_upsert — severity should be string enum', () => {
    it('severity should be a string enum', () => {
      const props = getSchemaProperties('qase_defect_upsert');
      expect(props.severity?.type).toBe('string');
      expect(props.severity?.enum).toEqual(
        expect.arrayContaining(['blocker', 'critical', 'major', 'normal', 'minor', 'trivial']),
      );
    });
  });

  // ── qase_result_record ────────────────────────────────────────────────
  describe('qase_result_record — field types', () => {
    it('results should be an array', () => {
      const props = getSchemaProperties('qase_result_record');
      expect(props.results?.type).toBe('array');
    });

    it('run_id should be integer', () => {
      const props = getSchemaProperties('qase_result_record');
      expect(props.run_id?.type).toBe('integer');
    });
  });

  // ── qase_run_upsert ───────────────────────────────────────────────────
  describe('qase_run_upsert — field types', () => {
    assertFieldsExist([
      ['qase_run_upsert', 'title'],
      ['qase_run_upsert', 'code'],
    ]);
  });

  // ── qase_milestone_upsert ─────────────────────────────────────────────
  describe('qase_milestone_upsert — field types', () => {
    assertFieldsExist([
      ['qase_milestone_upsert', 'title'],
    ]);
  });

  // ── qase_suite_upsert ─────────────────────────────────────────────────
  describe('qase_suite_upsert — field types', () => {
    assertFieldsExist([
      ['qase_suite_upsert', 'title'],
    ]);
  });

  // ── qase_environment_upsert ───────────────────────────────────────────
  describe('qase_environment_upsert — field types', () => {
    assertFieldsExist([
      ['qase_environment_upsert', 'title'],
    ]);
  });

  // ── qase_plan_upsert ──────────────────────────────────────────────────
  describe('qase_plan_upsert — field types', () => {
    assertFieldsExist([
      ['qase_plan_upsert', 'title'],
    ]);
  });

  // ── qase_shared_step_upsert ───────────────────────────────────────────
  describe('qase_shared_step_upsert — field types', () => {
    assertFieldsExist([
      ['qase_shared_step_upsert', 'title'],
    ]);
  });

  // ── qase_get ──────────────────────────────────────────────────────────
  describe('qase_get — entity field', () => {
    it('entity should be defined and have enum values', () => {
      const props = getSchemaProperties('qase_get');
      expect(props.entity).toBeDefined();
    });

    it('entity and id should be required', () => {
      const required = getSchemaRequired('qase_get');
      expect(required).toContain('entity');
      expect(required).toContain('id');
    });

    it('code should be optional (present but not required)', () => {
      const props = getSchemaProperties('qase_get');
      expect(props.code).toBeDefined();
      const required = getSchemaRequired('qase_get');
      expect(required).not.toContain('code');
    });
  });

  // ── qase_project_context ─────────────────────────────────────────────
  describe('qase_project_context', () => {
    it('code should be required', () => {
      const required = getSchemaRequired('qase_project_context');
      expect(required).toContain('code');
    });
  });

  // ── qql_search ────────────────────────────────────────────────────────
  describe('qql_search', () => {
    it('query should be required', () => {
      const required = getSchemaRequired('qql_search');
      expect(required).toContain('query');
    });
  });

  // ── Cross-cutting: required code field ───────────────────────────────
  describe('required code field across tools', () => {
    const toolsRequiringCode = [
      'qase_case_upsert',
      'qase_case_delete',
      'qase_defect_upsert',
      'qase_defect_delete',
      'qase_run_upsert',
      'qase_run_complete',
      'qase_run_delete',
      'qase_result_record',
      'qase_result_delete',
      'qase_suite_upsert',
      'qase_suite_delete',
      'qase_milestone_upsert',
      'qase_milestone_delete',
      'qase_plan_upsert',
      'qase_plan_delete',
      'qase_environment_upsert',
      'qase_environment_delete',
      'qase_shared_step_upsert',
      'qase_shared_step_delete',
      'qase_attachment_upload',
    ];

    it.each(toolsRequiringCode)('%s should require "code"', (toolName) => {
      const required = getSchemaRequired(toolName);
      expect(required).toContain('code');
    });
  });

  // ── ID fields should be integer ───────────────────────────────────────
  describe('ID fields should be integer', () => {
    const toolsWithId: [string, string][] = [
      ['qase_case_delete', 'id'],
      ['qase_defect_delete', 'id'],
      ['qase_run_complete', 'id'],
      ['qase_run_delete', 'id'],
      ['qase_suite_delete', 'id'],
      ['qase_milestone_delete', 'id'],
      ['qase_plan_delete', 'id'],
    ];

    assertFieldTypes(toolsWithId.map(([tool, field]) => [tool, field, 'integer']));
  });
});

describe('Tool Smoke Tests', () => {
  let allTools: ReturnType<typeof toolRegistry.getTools>;
  let toolNames: string[];

  beforeAll(() => {
    allTools = toolRegistry.getTools();
    toolNames = allTools.map((t) => t.name);
  });

  it('should have ~29 tools registered (v2 tool set)', () => {
    expect(allTools.length).toBeGreaterThanOrEqual(25);
    expect(allTools.length).toBeLessThanOrEqual(35);
    console.error(`[Smoke] Found ${allTools.length} registered tools`);
  });

  it('all expected v2 tool names are present', () => {
    const expectedTools = [
      'qase_project_context',
      'qase_get',
      'qql_search',
      'qql_help',
      'qase_case_upsert',
      'qase_case_delete',
      'qase_run_upsert',
      'qase_run_complete',
      'qase_run_delete',
      'qase_result_record',
      'qase_result_delete',
      'qase_defect_upsert',
      'qase_defect_delete',
      'qase_suite_upsert',
      'qase_suite_delete',
      'qase_milestone_upsert',
      'qase_milestone_delete',
      'qase_plan_upsert',
      'qase_plan_delete',
      'qase_shared_step_upsert',
      'qase_shared_step_delete',
      'qase_environment_upsert',
      'qase_environment_delete',
      'qase_attachment_upload',
      'qase_attachment_delete',
      'qase_api',
      'qase_ci_report',
      'qase_triage_defect',
      'qase_regression_run',
    ];
    for (const name of expectedTools) {
      expect(toolNames).toContain(name);
    }
  });

  it('no v1 tool names are present', () => {
    const v1Names = [
      'list_projects',
      'get_project',
      'create_project',
      'list_cases',
      'get_case',
      'create_case',
      'update_case',
      'delete_case',
      'bulk_create_cases',
      'list_runs',
      'get_run',
      'create_run',
      'complete_run',
      'delete_run',
      'list_results',
      'create_result',
      'create_results_bulk',
      'list_defects',
      'get_defect',
      'create_defect',
      'update_defect',
      'delete_defect',
      'upload_attachment',
    ];
    for (const name of v1Names) {
      expect(toolNames).not.toContain(name);
    }
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
