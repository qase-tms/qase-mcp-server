import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry } from '../../utils/registry.js';
import { confirmDestructiveAction, describeRefusal } from '../../utils/server-context.js';
import { ToolExecutionError } from '../../utils/errors.js';

/**
 * The /v1/ prefix used to live only in the description, where it was advice to
 * the model rather than a rule, and `path` is model-controlled: it carries
 * whatever the model read, including text planted in a case, a defect or a
 * linked issue. A path that names another host — `@evil.example/v1/x`,
 * `//evil.example/v1/x`, a full URL — would send the Qase credential there.
 *
 * Requiring the prefix rules all of those out, because a path that must begin
 * `/v1/` cannot open an authority component. It is kept separate from the object
 * schema so the handler can parse it on its own: tools/call passes the client's
 * arguments to a handler as they arrived, without parsing them against the
 * advertised schema, so a rule stated only in the schema binds the client and
 * not this server.
 */
const PathSchema = z
  .string()
  .regex(
    /^\/v1\/\S*$/,
    'path must start with /v1/ and stay on the Qase API host: pass an endpoint path, ' +
      'not a full URL and not a prefix that names another host',
  );

const Schema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET').describe('HTTP method'),
  path: PathSchema.describe('API path starting with /v1/ (e.g., "/v1/project/DEMO/run")'),
  body: z.record(z.any()).optional().describe('Request body for POST/PUT/PATCH'),
  query: z.record(z.string()).optional().describe('Query parameters'),
});

async function handler(args: z.infer<typeof Schema>) {
  const client = getApiClient();
  const { method, body, query } = args;

  // Checked here and not left to the schema: see PathSchema. This runs before
  // the confirmation gate, so a malformed path is refused without prompting.
  const validated = PathSchema.safeParse(args.path);
  if (!validated.success) {
    throw new ToolExecutionError(
      `Invalid path for qase_api: ${validated.error.issues[0]?.message ?? 'bad path'}`,
      'Pass an endpoint path on the Qase API host, such as "/v1/project/DEMO/run".',
    );
  }
  const path = validated.data;

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
  title: 'Call Qase API',
  description:
    'Call any Qase REST endpoint directly, for the few things no dedicated tool covers. Pass the ' +
    'HTTP method, a path starting with /v1/, and an optional body or query. The path must be an ' +
    'endpoint path on the configured Qase host; a full URL, or one that resolves to another host, ' +
    'is refused. See ' +
    'developers.qase.io for the reference. Prefer a dedicated tool wherever one exists: they ' +
    'normalize enums, validate arguments before spending a round trip, and shape the response for ' +
    'a model. This one hands back whatever the API returns. It sends JSON only and cannot upload ' +
    'files — multipart uploads go through qase_attachment_upload. A DELETE through this tool asks ' +
    'for confirmation the same way the dedicated delete tools do. Cost: one API call, typically ' +
    '0.3-1.5s depending on the endpoint. No caching, no pagination help, no retries beyond the ' +
    'client defaults.',
  schema: Schema,
  handler,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
});
