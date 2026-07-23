import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry } from '../../utils/registry.js';

const Schema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET').describe('HTTP method'),
  path: z.string().min(1).describe('API path starting with /v1/ (e.g., "/v1/project/DEMO/run")'),
  body: z.record(z.any()).optional().describe('Request body for POST/PUT/PATCH'),
  query: z.record(z.string()).optional().describe('Query parameters'),
});

async function handler(args: z.infer<typeof Schema>) {
  const client = getApiClient();
  const { method, path, body, query } = args;

  return client.request(path, {
    method,
    data: body,
    params: query,
  });
}

toolRegistry.register({
  name: 'qase_api',
  description:
    'Direct Qase REST API call for endpoints not covered by other tools. ' +
    'Pass the HTTP method, path (starting with /v1/), and optional body/query. ' +
    'See https://developers.qase.io for API reference. Use this as an escape hatch ' +
    'when the dedicated tools do not cover your use case.',
  schema: Schema,
  handler,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
});
