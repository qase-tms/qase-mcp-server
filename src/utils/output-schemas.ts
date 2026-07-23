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
    linked_results: { type: 'integer', description: 'Number of linked result hashes' },
  },
  required: ['defect_id', 'linked_results'],
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
  },
  required: ['project', 'suites', 'milestones', 'environments'],
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
