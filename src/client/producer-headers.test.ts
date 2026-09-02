import { describe, it, expect } from '@jest/globals';
import { buildIntegrationHeaders } from './producer-headers.js';

describe('buildIntegrationHeaders', () => {
  it('sends nothing without an integration', () => {
    expect(
      buildIntegrationHeaders(undefined, { producer: 'a-skill', seq: 1, entrypoint: 'skill' }),
    ).toEqual({});
  });

  it('sends the integration alone when there is no producer', () => {
    expect(
      buildIntegrationHeaders({ name: 'quality-supervisor', version: '0.4.0' }, undefined),
    ).toEqual({
      'X-MCP-Integration-Name': 'quality-supervisor',
      'X-MCP-Integration-Version': '0.4.0',
    });
  });

  it('sends all five when both are present', () => {
    expect(
      buildIntegrationHeaders(
        { name: 'quality-supervisor', version: '0.4.0' },
        { producer: 'analyzing-test-coverage', seq: 3, entrypoint: 'skill' },
      ),
    ).toEqual({
      'X-MCP-Integration-Name': 'quality-supervisor',
      'X-MCP-Integration-Version': '0.4.0',
      'X-MCP-Integration-Producer': 'analyzing-test-coverage',
      'X-MCP-Integration-Seq': '3',
      'X-MCP-Integration-Entrypoint': 'skill',
    });
  });

  it('omits the version when the integration has none', () => {
    expect(buildIntegrationHeaders({ name: 'quality-supervisor' }, undefined)).toEqual({
      'X-MCP-Integration-Name': 'quality-supervisor',
    });
  });
});
