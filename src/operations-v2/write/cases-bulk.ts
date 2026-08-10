import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';
import { normalizeCaseEnums } from '../../utils/case-enums.js';
import { CaseFieldsSchema, applyAutomationMapping } from './case-fields.js';

const CONTEXT = 'bulk case creation';

/** Qase creates the whole batch in one transaction; 100 keeps the request sane. */
const MAX_CASES = 100;

const Schema = z.object({
  code: ProjectCodeSchema,
  cases: z
    .array(CaseFieldsSchema)
    .min(1)
    .max(MAX_CASES, `A single call creates at most ${MAX_CASES} test cases — split larger batches.`)
    .describe(`Test cases to create, 1 to ${MAX_CASES} per call`),
});

async function handler(rawArgs: unknown) {
  // Tool handlers get raw MCP arguments — validate here so a malformed call
  // returns a readable error instead of a TypeError from deeper in the code.
  const parsed = Schema.safeParse(rawArgs);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
      .join('; ');
    throw createToolError(`Invalid arguments — ${details}`, CONTEXT);
  }
  const { code, cases } = parsed.data;

  // Same enum handling as qase_case_upsert, so "high" and "blocker" work here
  // too. System fields are cached, so this does not fan out into N API calls.
  const normalized = await Promise.all(
    cases.map(async (testCase) => applyAutomationMapping(await normalizeCaseEnums(testCase))),
  );

  const client = getApiClient();
  const result = await toResultAsync(client.cases.bulk(code, { cases: normalized } as any));

  return result.match(
    (r) => {
      const ids: number[] = r.data.result?.ids ?? [];
      return { created: ids.length, ids };
    },
    (e) => {
      throw createToolError(e, CONTEXT);
    },
  );
}

toolRegistry.register({
  name: 'qase_case_bulk_create',
  description:
    `Create up to ${MAX_CASES} test cases in a single request. Use this instead of calling ` +
    '`qase_case_upsert` repeatedly when importing or generating several cases at once. ' +
    'Enum fields (priority, severity, type, etc.) accept both labels ("high", "blocker") and ' +
    'numeric IDs. Creates only — use `qase_case_upsert` with an `id` to update an existing case. ' +
    'Returns the IDs of the created cases in the order they were submitted.',
  schema: Schema,
  handler,
  annotations: CreateAnnotation,
  visibility: 'discoverable',
});
