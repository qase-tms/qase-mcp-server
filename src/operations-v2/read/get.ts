import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema, HashSchema } from '../../utils/validation.js';
import { projectFields } from '../../utils/response-shape.js';

const ENTITIES_REQUIRING_CODE = new Set([
  'case',
  'suite',
  'run',
  'result',
  'plan',
  'defect',
  'milestone',
  'environment',
  'shared_step',
  'shared_parameter',
  'configuration',
]);

const Schema = z.object({
  entity: z
    .enum([
      'case',
      'suite',
      'run',
      'result',
      'plan',
      'defect',
      'milestone',
      'environment',
      'shared_step',
      'shared_parameter',
      'configuration',
      'attachment',
      'author',
      'user',
      'review',
      'custom_field',
    ])
    .describe('Entity type to fetch'),
  code: ProjectCodeSchema.optional().describe('Project code (required for most entities)'),
  id: z.union([IdSchema, HashSchema]).describe('Entity ID (number) or hash (string)'),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      'Optional field projection — only return these top-level fields. Pass ["*"] for all fields.',
    ),
  include: z
    .string()
    .optional()
    .describe(
      'Comma-separated list of related entities to include in the response. ' +
        'Cases and runs already request their external issue links by default ' +
        '("external_issues" / "external_issue"); pass this only to override that.',
    ),
});

/**
 * Related entities requested automatically so linked issues are visible without
 * the caller knowing about the `include` query parameter. The Qase API omits
 * these fields entirely unless they are asked for.
 */
const DEFAULT_INCLUDE: Record<string, string> = {
  case: 'external_issues',
  run: 'external_issue',
};

const FETCHERS: Record<
  string,
  (client: any, code: string, id: any, include?: string) => Promise<any>
> = {
  case: (c, code, id, include) => c.cases.getCase(code, id, include),
  suite: (c, code, id) => c.suites.getSuite(code, id),
  run: (c, code, id, include) => c.runs.getRun(code, id, include),
  result: (c, code, id) => c.results.getResult(code, id),
  plan: (c, code, id) => c.plans.getPlan(code, id),
  defect: (c, code, id) => c.defects.getDefect(code, id),
  milestone: (c, code, id) => c.milestones.getMilestone(code, id),
  environment: (c, code, id) => c.environment.getEnvironment(code, id),
  shared_step: (c, code, id) => c.sharedSteps.getSharedStep(code, id),
  shared_parameter: (c, _code, id) => c.sharedParameters.getSharedParameter(String(id)),
  configuration: (c, code, _id) => c.configurations.getConfigurations(code),
  attachment: (c, _code, id) => c.attachments.getAttachment(id),
  author: (c, _code, id) => c.authors.getAuthor(id),
  user: (c, _code, id) => c.users.getUser(id),
  custom_field: (c, _code, id) => c.customFields.getCustomField(id),
  review: (c, code, id) => c.reviews.getReview(code, id),
};

async function handler(args: z.infer<typeof Schema>) {
  const { entity, code, id, fields: fieldList, include } = args;

  if (ENTITIES_REQUIRING_CODE.has(entity) && !code) {
    throw createToolError(`Project code is required for entity type "${entity}"`, 'get operation');
  }

  const client = getApiClient();
  const fetcher = FETCHERS[entity];
  if (!fetcher) throw createToolError(`Unknown entity type: ${entity}`, 'get operation');

  const effectiveInclude = include ?? DEFAULT_INCLUDE[entity];
  const isDefaultInclude = !include && effectiveInclude !== undefined;

  let result = await toResultAsync(fetcher(client, code || '', id, effectiveInclude));

  // Deployments that don't know the `include` value (older self-hosted
  // instances) reject the request outright — retry without it rather than
  // failing a plain get. An explicit `include` from the caller is never
  // silently dropped.
  if (result.isErr() && isDefaultInclude) {
    result = await toResultAsync(fetcher(client, code || '', id, undefined));
  }

  return result.match(
    (response) => {
      const data = response.data.result;
      return fieldList ? projectFields(data, fieldList) : data;
    },
    (error) => {
      throw createToolError(error, 'get operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_get',
  description:
    'Fetch one known record by type and ID: case, suite, run, result, plan, defect, milestone, ' +
    'environment, shared_step, shared_parameter, configuration, attachment, author, user, review, ' +
    'or custom_field. `code` is required for project-scoped entities and can be omitted for ' +
    'global ones (user, author, attachment, custom_field). Narrow the payload with `fields`, or ' +
    'pass ["*"] for everything. Use this only when you already know the ID and want a single ' +
    'record. For several records, for anything filtered or cross-project, or when you are about ' +
    'to call this in a loop, use qql_search instead — one search returns the whole page at once. ' +
    'Cost: one API call, 0.3-0.5s. Ten of these in sequence measured 5.3s against 1.2s for a ' +
    'single qql_search returning the same ten records, so a loop over IDs is roughly four times ' +
    'slower and ten times more calls.',
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
});
