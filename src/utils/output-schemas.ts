/**
 * Output Schemas for MCP Tools
 *
 * JSON Schema definitions describing tool output structure.
 * Enables MCP clients to process results programmatically in a sandbox
 * instead of passing raw JSON to the LLM (reduces token usage ~37%).
 */

import type { OutputSchema } from './registry.js';

export const CiReportOutput: OutputSchema = {
  type: 'object',
  properties: {
    run_id: { type: 'integer', description: 'Created run ID' },
    run_status: { type: 'string', enum: ['active', 'complete', 'complete_failed'] },
    results_recorded: { type: 'integer', description: 'Number of results recorded' },
  },
  required: ['run_id', 'run_status', 'results_recorded'],
};

export const RegressionRunOutput: OutputSchema = {
  type: 'object',
  properties: {
    run_id: { type: 'integer', description: 'Created run ID' },
    cases_added: { type: 'integer', description: 'Number of cases added to the run' },
    run: { type: 'object', description: 'Full run entity' },
  },
  required: ['run_id', 'cases_added'],
};

export const TriageDefectOutput: OutputSchema = {
  type: 'object',
  properties: {
    defect_id: { type: 'integer', description: 'Created defect ID' },
    defect: { type: 'object', description: 'Full defect entity' },
  },
  required: ['defect_id'],
};

export const QqlSearchOutput: OutputSchema = {
  type: 'object',
  properties: {
    total: { type: 'integer', description: 'Total matching entities' },
    entities: { type: 'array', description: 'Matching entities', items: { type: 'object' } },
  },
  required: ['total', 'entities'],
};

export const ProjectContextOutput: OutputSchema = {
  type: 'object',
  properties: {
    project: { type: 'object', description: 'Project details' },
    suites: { type: 'object', description: 'Suites list with entities array' },
    milestones: { type: 'object', description: 'Milestones list' },
    environments: { type: 'object', description: 'Environments list' },
    custom_fields: { type: 'object', description: 'Custom fields list' },
    users: { type: 'object', description: 'Team members list' },
    coverage: {
      type: 'object',
      description:
        'Per-collection completeness: each of suites, milestones, environments, custom_fields, ' +
        'and users maps to { total, loaded, truncated }. When truncated is true the list holds ' +
        'only the first `loaded` of `total` entities — re-call with full: true for the rest.',
    },
  },
  required: ['project', 'suites', 'milestones', 'environments', 'coverage'],
};

export const ReviewCreateOutput: OutputSchema = {
  type: 'object',
  properties: {
    review_id: { type: 'integer', description: 'Created review ID' },
    type: {
      type: 'string',
      description: '"create" for a new-case draft, "edit" when case_id was given',
    },
    case_id: { type: ['integer', 'null'], description: 'Reviewed case, null for a create review' },
    status: { type: 'string', description: 'Always "open" for a freshly created review' },
  },
  required: ['review_id', 'type'],
};

export const ReviewUpdateOutput: OutputSchema = {
  type: 'object',
  properties: {
    review_id: { type: 'integer' },
    updated: {
      type: 'array',
      items: { type: 'string' },
      description: 'Which parts were sent: "proposed_case", "reviewers", or both',
    },
    approvals_reset: {
      type: 'boolean',
      description:
        'True when the proposal changed, which clears every approval already given. False when only reviewers changed.',
    },
  },
  required: ['review_id', 'approvals_reset'],
};

export const ReviewListOutput: OutputSchema = {
  type: 'object',
  properties: {
    total: { type: 'integer', description: 'Reviews matching the filters' },
    returned: { type: 'integer', description: 'Reviews in this response — page for the rest' },
    entities: { type: 'array', items: { type: 'object' }, description: 'The reviews' },
  },
  required: ['total', 'returned', 'entities'],
};

export const ReviewBulkCreateOutput: OutputSchema = {
  type: 'object',
  properties: {
    created: { type: 'integer', description: 'How many reviews were opened' },
    review_ids: {
      type: 'array',
      items: { type: 'integer' },
      description:
        "IDs of the created reviews, in request order. Flattened from the API's items[].review_id so it matches qase_review_create.",
    },
    items: { type: 'array', items: { type: 'object' }, description: 'Raw per-item API result' },
  },
  required: ['created', 'review_ids'],
};

export const DeleteOutput: OutputSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    id: { type: 'integer', description: 'Deleted entity ID' },
  },
  required: ['success'],
};

export const DiscoverToolsOutput: OutputSchema = {
  type: 'object',
  properties: {
    found: { type: 'integer', description: 'Number of matching tools' },
    activated: { type: 'integer', description: 'Number of newly activated tools' },
    tools: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          destructive: { type: 'boolean' },
        },
      },
    },
  },
  required: ['found', 'activated', 'tools'],
};
