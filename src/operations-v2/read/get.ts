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
});

const FETCHERS: Record<string, (client: any, code: string, id: any) => Promise<any>> = {
  case: (c, code, id) => c.cases.getCase(code, id),
  suite: (c, code, id) => c.suites.getSuite(code, id),
  run: (c, code, id) => c.runs.getRun(code, id),
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
};

async function handler(args: z.infer<typeof Schema>) {
  const { entity, code, id, fields: fieldList } = args;

  if (ENTITIES_REQUIRING_CODE.has(entity) && !code) {
    throw createToolError(`Project code is required for entity type "${entity}"`, 'get operation');
  }

  const client = getApiClient();
  const fetcher = FETCHERS[entity];
  if (!fetcher) throw createToolError(`Unknown entity type: ${entity}`, 'get operation');

  const result = await toResultAsync(fetcher(client, code || '', id));

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
    'Get any Qase entity by type and ID. Supports field projection via the `fields` parameter. ' +
    'For project-scoped entities (case, suite, run, result, plan, defect, milestone, environment, ' +
    'shared_step, shared_parameter, configuration), `code` is required. ' +
    'For global entities (user, author, attachment, custom_field), `code` can be omitted.',
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
});
