import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { toResultAsync } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';
import { richResult, summaryBlock, dataBlock } from '../../utils/rich-response.js';
import { ProjectContextOutput } from '../../utils/output-schemas.js';
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

  const project = context.project as any;
  const projectName = project?.title || code;
  const suitesList: any[] = (context.suites as any)?.entities ?? [];
  const milestonesList: any[] = (context.milestones as any)?.entities ?? [];
  const envsList: any[] = (context.environments as any)?.entities ?? [];
  const customFieldsList: any[] = (context.custom_fields as any)?.entities ?? [];
  const usersList: any[] = (context.users as any)?.entities ?? [];

  const lines = [
    `## Project: ${projectName} (${code})`,
    '',
    `- **Suites:** ${suitesList.length}`,
    `- **Milestones:** ${milestonesList.length}`,
    `- **Environments:** ${envsList.length}`,
    `- **Custom fields:** ${customFieldsList.length}`,
    `- **Team members:** ${usersList.length}`,
  ];

  if (envsList.length > 0) {
    lines.push('', '**Environments:** ' + envsList.map((e: any) => e.title).join(', '));
  }

  if (milestonesList.length > 0) {
    lines.push('', '**Milestones:**');
    for (const m of milestonesList.slice(0, 10)) {
      const status = m.status ? ` \`${m.status}\`` : '';
      lines.push(`- ${m.title}${status}`);
    }
    if (milestonesList.length > 10) lines.push(`- _...and ${milestonesList.length - 10} more_`);
  }

  if (suitesList.length > 0) {
    const topLevel = suitesList.filter((s: any) => !s.parent_id);
    lines.push('', `**Top-level suites** (${topLevel.length} of ${suitesList.length} total):`);
    for (const s of topLevel.slice(0, 10)) {
      lines.push(`- ${s.title}`);
    }
    if (topLevel.length > 10) lines.push(`- _...and ${topLevel.length - 10} more_`);
  }

  const summary = lines.join('\n');

  return richResult(
    [summaryBlock(summary), dataBlock(context)],
    context as Record<string, unknown>,
  );
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
  outputSchema: ProjectContextOutput,
});
