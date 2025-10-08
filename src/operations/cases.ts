/**
 * Test Cases (Qases) Operations
 *
 * Implements all MCP tools for managing test cases in Qase.
 * Test cases are the core entities representing individual tests.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing test cases
 */
const ListCasesSchema = z.object({
  code: ProjectCodeSchema,
  search: z.string().optional().describe('Search query for test case title or description'),
  milestone_id: z.number().int().positive().optional().describe('Filter by milestone ID'),
  suite_id: z.number().int().positive().optional().describe('Filter by suite ID'),
  severity: z.string().optional().describe('Filter by severity (e.g., "blocker", "critical")'),
  priority: z.string().optional().describe('Filter by priority (e.g., "high", "medium")'),
  type: z.string().optional().describe('Filter by type (e.g., "functional", "smoke")'),
  behavior: z.string().optional().describe('Filter by behavior (e.g., "positive", "negative")'),
  automation: z.string().optional().describe('Filter by automation status'),
  status: z.string().optional().describe('Filter by status (e.g., "actual", "draft")'),
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific test case
 */
const GetCaseSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for test case steps
 */
const TestStepSchema = z.object({
  action: z.string().describe('Step action description'),
  expected_result: z.string().optional().describe('Expected result for this step'),
  data: z.string().optional().describe('Test data for this step'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
});

/**
 * Schema for creating a test case
 */
const CreateCaseSchema = z.object({
  code: ProjectCodeSchema,
  title: z.string().min(1).max(255).describe('Test case title'),
  description: z.string().optional().describe('Test case description'),
  preconditions: z.string().optional().describe('Preconditions for the test'),
  postconditions: z.string().optional().describe('Postconditions after the test'),
  severity: z.string().optional().describe('Test severity (e.g., "blocker", "critical", "major")'),
  priority: z.string().optional().describe('Test priority (e.g., "high", "medium", "low")'),
  type: z.string().optional().describe('Test type (e.g., "functional", "smoke", "regression")'),
  layer: z.string().optional().describe('Test layer (e.g., "api", "ui", "unit")'),
  is_flaky: z.boolean().optional().describe('Mark test case as flaky'),
  suite_id: z.number().int().positive().optional().describe('Suite ID to organize test case'),
  milestone_id: z.number().int().positive().optional().describe('Milestone ID'),
  behavior: z.string().optional().describe('Test behavior (e.g., "positive", "negative")'),
  automation: z.string().optional().describe('Automation status'),
  status: z.string().optional().describe('Test case status (e.g., "actual", "draft")'),
  steps: z.array(TestStepSchema).optional().describe('Array of test steps'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
  custom_field: z.record(z.any()).optional().describe('Custom field values'),
});

/**
 * Schema for updating a test case
 */
const UpdateCaseSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  title: z.string().min(1).max(255).optional().describe('Test case title'),
  description: z.string().optional().describe('Test case description'),
  preconditions: z.string().optional().describe('Preconditions for the test'),
  postconditions: z.string().optional().describe('Postconditions after the test'),
  severity: z.string().optional().describe('Test severity'),
  priority: z.string().optional().describe('Test priority'),
  type: z.string().optional().describe('Test type'),
  layer: z.string().optional().describe('Test layer'),
  is_flaky: z.boolean().optional().describe('Mark test case as flaky'),
  suite_id: z.number().int().positive().optional().describe('Suite ID'),
  milestone_id: z.number().int().positive().optional().describe('Milestone ID'),
  behavior: z.string().optional().describe('Test behavior'),
  automation: z.string().optional().describe('Automation status'),
  status: z.string().optional().describe('Test case status'),
  steps: z.array(TestStepSchema).optional().describe('Array of test steps'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  attachments: z.array(z.string()).optional().describe('Array of attachment hashes'),
  custom_field: z.record(z.any()).optional().describe('Custom field values'),
});

/**
 * Schema for deleting a test case
 */
const DeleteCaseSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

/**
 * Schema for bulk creating test cases
 */
const BulkCreateCasesSchema = z.object({
  code: ProjectCodeSchema,
  cases: z.array(CreateCaseSchema.omit({ code: true })).describe('Array of test cases to create'),
});

/**
 * Schema for attaching external issue
 */
const AttachExternalIssueSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  issue_id: z.string().describe('External issue ID (e.g., Jira issue key)'),
});

/**
 * Schema for detaching external issue
 */
const DetachExternalIssueSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  issue_id: z.string().describe('External issue ID to detach'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all test cases in a project with filtering
 */
async function listCases(args: z.infer<typeof ListCasesSchema>) {
  const client = getApiClient();
  const { code, ...filters } = args;

  const result = await toResultAsync(
    client.cases.getCases(
      code,
      filters.search,
      filters.milestone_id,
      filters.suite_id,
      filters.severity,
      filters.priority,
      filters.type,
      filters.behavior,
      filters.automation,
      filters.status,
      undefined, // externalIssuesType
      undefined, // externalIssuesIds
      undefined, // include
      filters.limit,
      filters.offset,
    ),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Get a specific test case
 */
async function getCase(args: z.infer<typeof GetCaseSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.cases.getCase(code, id));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Create a new test case
 */
async function createCase(args: z.infer<typeof CreateCaseSchema>) {
  const client = getApiClient();
  const { code, ...caseData } = args;

  const result = await toResultAsync(client.cases.createCase(code, caseData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Update an existing test case
 */
async function updateCase(args: z.infer<typeof UpdateCaseSchema>) {
  const client = getApiClient();
  const { code, id, ...updateData } = args;

  const result = await toResultAsync(client.cases.updateCase(code, id, updateData as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Delete a test case
 */
async function deleteCase(args: z.infer<typeof DeleteCaseSchema>) {
  const client = getApiClient();
  const { code, id } = args;

  const result = await toResultAsync(client.cases.deleteCase(code, id));

  return result.match(
    (_response) => ({ success: true, id }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Bulk create multiple test cases
 */
async function bulkCreateCases(args: z.infer<typeof BulkCreateCasesSchema>) {
  const client = getApiClient();
  const { code, cases } = args;

  const result = await toResultAsync(client.cases.bulk(code, { cases } as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Attach external issue to a test case
 */
async function attachExternalIssue(args: z.infer<typeof AttachExternalIssueSchema>) {
  const client = getApiClient();
  const { code, id, issue_id } = args;

  const result = await toResultAsync(
    client.cases.caseAttachExternalIssue(code, {
      id,
      issue_id,
    } as any),
  );

  return result.match(
    (_response) => ({ success: true, id, issue_id }),
    (error) => {
      throw new Error(error);
    },
  );
}

/**
 * Detach external issue from a test case
 */
async function detachExternalIssue(args: z.infer<typeof DetachExternalIssueSchema>) {
  const client = getApiClient();
  const { code, id, issue_id } = args;

  const result = await toResultAsync(
    client.cases.caseDetachExternalIssue(code, {
      id,
      issue_id,
    } as any),
  );

  return result.match(
    (_response) => ({ success: true, id, issue_id }),
    (error) => {
      throw new Error(error);
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_cases',
  description: 'Get all test cases in a project with optional filtering and pagination',
  schema: ListCasesSchema,
  handler: listCases,
});

toolRegistry.register({
  name: 'get_case',
  description: 'Get a specific test case by project code and case ID',
  schema: GetCaseSchema,
  handler: getCase,
});

toolRegistry.register({
  name: 'create_case',
  description: 'Create a new test case in a project',
  schema: CreateCaseSchema,
  handler: createCase,
});

toolRegistry.register({
  name: 'update_case',
  description: 'Update an existing test case',
  schema: UpdateCaseSchema,
  handler: updateCase,
});

toolRegistry.register({
  name: 'delete_case',
  description: 'Delete a test case from a project',
  schema: DeleteCaseSchema,
  handler: deleteCase,
});

toolRegistry.register({
  name: 'bulk_create_cases',
  description: 'Create multiple test cases at once in a project',
  schema: BulkCreateCasesSchema,
  handler: bulkCreateCases,
});

toolRegistry.register({
  name: 'attach_external_issue',
  description: 'Attach an external issue (e.g., Jira ticket) to a test case',
  schema: AttachExternalIssueSchema,
  handler: attachExternalIssue,
});

toolRegistry.register({
  name: 'detach_external_issue',
  description: 'Detach an external issue from a test case',
  schema: DetachExternalIssueSchema,
  handler: detachExternalIssue,
});
