import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { toResultAsync } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';
import { getCache, buildCacheKey, hashToken } from '../../cache/index.js';
import { getEffectiveToken } from '../../utils/auth-context.js';

const Schema = z.object({
  code: ProjectCodeSchema,
});

async function handler(args: z.infer<typeof Schema>) {
  const { code } = args;
  const cache = await getCache();
  const host = process.env.QASE_API_DOMAIN || 'api.qase.io';
  const key = buildCacheKey({
    host,
    tenantId: hashToken(getEffectiveToken()),
    resource: 'project_context',
    scope: code,
  });

  const cached = await cache.get(key);
  if (cached) return cached;

  const client = getApiClient();

  const [projectRes, suitesRes, milestonesRes, envsRes, customFieldsRes, usersRes] =
    await Promise.allSettled([
      toResultAsync(client.projects.getProject(code)),
      toResultAsync(client.suites.getSuites(code, undefined, 100, 0)),
      toResultAsync(client.milestones.getMilestones(code, undefined, 100, 0)),
      toResultAsync(client.environment.getEnvironments(code, undefined, undefined, 100, 0)),
      toResultAsync(client.customFields.getCustomFields(undefined, undefined, 100, 0)),
      toResultAsync(client.users.getUsers()),
    ]);

  const extract = <T>(settled: PromiseSettledResult<any>): T | null => {
    if (settled.status === 'fulfilled') {
      return settled.value.match(
        (r: any) => r.data.result,
        () => null,
      );
    }
    return null;
  };

  const context = {
    project: extract(projectRes),
    suites: extract(suitesRes),
    milestones: extract(milestonesRes),
    environments: extract(envsRes),
    custom_fields: extract(customFieldsRes),
    users: extract(usersRes),
  };

  const TTL = 5 * 60 * 1000; // 5 minutes
  await cache.set(key, context, TTL);

  return context;
}

toolRegistry.register({
  name: 'qase_project_context',
  description:
    'Get full project context in one call: project details, suites tree, milestones, ' +
    'environments, custom fields, and users. Cached for 5 minutes. Use this as the ' +
    'first call when starting work with a project — it seeds all the metadata the LLM ' +
    'needs without making 6 separate list calls.',
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
});
