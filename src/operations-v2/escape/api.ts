import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry } from '../../utils/registry.js';
import { confirmDestructiveAction, describeRefusal } from '../../utils/server-context.js';
import { ToolExecutionError } from '../../utils/errors.js';

const Schema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET').describe('HTTP method'),
  path: z.string().min(1).describe('API path starting with /v1/ (e.g., "/v1/project/DEMO/run")'),
  body: z.record(z.any()).optional().describe('Request body for POST/PUT/PATCH'),
  query: z.record(z.string()).optional().describe('Query parameters'),
});

async function handler(args: z.infer<typeof Schema>) {
  const client = getApiClient();
  const { method, path, body, query } = args;

  // The tool is annotated destructiveHint: false, because most calls through it
  // read — a GET must not prompt. That leaves DELETE outside the annotation
  // gate, and a DELETE here reaches endpoints no dedicated tool covers, up to
  // removing a whole project. So ask on the method actually used.
  if (method === 'DELETE') {
    const confirmation = await confirmDestructiveAction('qase_api', { method, path });
    if (!confirmation.allowed) {
      const text = describeRefusal(`qase_api (DELETE ${path})`, confirmation.reason);
      // A decline is the user's decision, so it comes back as an ordinary
      // result; the other reasons are failures the caller has to act on, and
      // throwing is what gets them `isError: true` from the tools/call handler.
      if (confirmation.reason === 'declined') return { cancelled: true, message: text };
      throw new ToolExecutionError(text);
    }
  }

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
    'when the dedicated tools do not cover your use case. Sends JSON only: it cannot ' +
    'upload files, which need multipart/form-data — use qase_attachment_upload for that.',
  schema: Schema,
  handler,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
});
