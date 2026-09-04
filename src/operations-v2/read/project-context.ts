import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, ReadAnnotation } from '../../utils/registry.js';
import { toResultAsync } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';
import { richResult, summaryBlock, dataBlock } from '../../utils/rich-response.js';
import { ProjectContextOutput } from '../../utils/output-schemas.js';
import { getCache, buildCacheKey, hashToken } from '../../cache/index.js';
import { getEffectiveToken } from '../../utils/auth-context.js';

/** Entities requested per API call. 100 is the largest page the Qase API serves. */
const PAGE_SIZE = 100;

/**
 * Hard cap on pages fetched per collection when `full` is set. A project with
 * more entities than this still reports the true `total`, so the truncation
 * stays visible instead of silently capping.
 */
const MAX_PAGES = 50;

const Schema = z.object({
  code: ProjectCodeSchema,
  full: z
    .boolean()
    .optional()
    .describe(
      'Page through every suite, milestone, environment, custom field, and user instead of ' +
        `fetching only the first ${PAGE_SIZE} of each (default: false). Use this when a ` +
        'collection is reported as truncated and you need the complete set — it costs one API ' +
        'call per 100 entities and can return thousands of items, so prefer the targeted list ' +
        'tools or qql_search when you only need a subset.',
    ),
});

/** A Qase list endpoint response: `{ total, filtered, count, entities }`. */
type ListPage = { total?: number; entities?: unknown[] } | null;

/** Per-collection completeness metadata attached to the result. */
interface Coverage {
  /** Entities the project actually has, as reported by the API. */
  total: number;
  /** Entities included in this response. */
  loaded: number;
  /** True when `loaded < total` — the consumer is seeing a partial set. */
  truncated: boolean;
}

function coverageOf(page: ListPage): Coverage {
  const loaded = page?.entities?.length ?? 0;
  // Fall back to `loaded` when the endpoint omits `total`, so we never claim a
  // truncation we cannot substantiate.
  const total = page?.total ?? loaded;
  return { total, loaded, truncated: loaded < total };
}

/**
 * Fetch the first page of a collection, then keep paging while the API reports
 * more entities than collected. Returns the shape of a single list response with
 * `entities` holding everything fetched.
 */
async function fetchAll(
  fetchPage: (limit: number, offset: number) => Promise<ListPage>,
): Promise<ListPage> {
  const first = await fetchPage(PAGE_SIZE, 0);
  if (!first) return null;

  const entities = [...(first.entities ?? [])];
  const total = first.total ?? entities.length;

  for (let page = 1; entities.length < total && page < MAX_PAGES; page++) {
    const next = await fetchPage(PAGE_SIZE, page * PAGE_SIZE);
    const batch = next?.entities ?? [];
    // No progress (empty page or an endpoint ignoring offset) — stop rather than
    // spin until MAX_PAGES.
    if (batch.length === 0) break;
    entities.push(...batch);
  }

  return { ...first, entities };
}

async function handler(args: z.infer<typeof Schema>) {
  const { code, full = false } = args;
  const cache = await getCache();
  const host = process.env.QASE_API_DOMAIN || 'api.qase.io';
  const key = buildCacheKey({
    host,
    tenantId: hashToken(getEffectiveToken()),
    resource: 'project_context',
    // Keep full and partial responses in separate cache entries — otherwise a
    // cached partial set would be served for full: true, and vice versa.
    scope: full ? `${code}:full` : code,
  });

  const cached = await cache.get(key);
  if (cached) return cached;

  const client = getApiClient();

  /** Unwrap one settled API call; a rejected or errored call becomes null. */
  const extract = <T>(settled: PromiseSettledResult<any>): T | null => {
    if (settled.status === 'fulfilled') {
      return settled.value.match(
        (r: any) => r.data.result as T,
        () => null,
      );
    }
    return null;
  };

  /**
   * Fetch one page of a collection, returning null if the call fails so a single
   * failing collection leaves the rest of the context intact.
   */
  const page =
    (fetchPage: (limit: number, offset: number) => Promise<any>) =>
    async (limit: number, offset: number): Promise<ListPage> => {
      const settled = await Promise.allSettled([toResultAsync(fetchPage(limit, offset))]);
      return extract<NonNullable<ListPage>>(settled[0]);
    };

  /** One page by default, every page when `full` is set. */
  const collect = (
    fetchPage: (limit: number, offset: number) => Promise<any>,
  ): Promise<ListPage> => {
    const fetch = page(fetchPage);
    return full ? fetchAll(fetch) : fetch(PAGE_SIZE, 0);
  };

  const [projectSettled, suites, milestones, environments, customFields, users] = await Promise.all(
    [
      Promise.allSettled([toResultAsync(client.projects.getProject(code))]).then(([s]) => s),
      collect((limit, offset) => client.suites.getSuites(code, undefined, limit, offset)),
      collect((limit, offset) => client.milestones.getMilestones(code, undefined, limit, offset)),
      collect((limit, offset) =>
        client.environment.getEnvironments(code, undefined, undefined, limit, offset),
      ),
      collect((limit, offset) =>
        client.customFields.getCustomFields(undefined, undefined, limit, offset),
      ),
      // Previously called with no limit at all, so the API's own (smaller)
      // default silently applied.
      collect((limit, offset) => client.users.getUsers(limit, offset)),
    ] as const,
  );

  const coverage = {
    suites: coverageOf(suites),
    milestones: coverageOf(milestones),
    environments: coverageOf(environments),
    custom_fields: coverageOf(customFields),
    users: coverageOf(users),
  };

  const context = {
    project: extract<Record<string, unknown>>(projectSettled),
    suites,
    milestones,
    environments,
    custom_fields: customFields,
    users,
    // Machine-readable completeness per collection, so a consumer can tell a
    // partial set from a complete one without counting entities itself.
    coverage,
  };

  const TTL = 5 * 60 * 1000; // 5 minutes
  await cache.set(key, context, TTL);

  const project = context.project as any;
  const projectName = project?.title || code;
  const suitesList: any[] = (context.suites as any)?.entities ?? [];
  const milestonesList: any[] = (context.milestones as any)?.entities ?? [];
  const envsList: any[] = (context.environments as any)?.entities ?? [];

  /** "100 of 2711 ⚠️ truncated" when partial, plain "42" when complete. */
  const countOf = (c: Coverage): string =>
    c.truncated ? `${c.loaded} of ${c.total} ⚠️ truncated` : `${c.loaded}`;

  const lines = [
    `## Project: ${projectName} (${code})`,
    '',
    `- **Suites:** ${countOf(coverage.suites)}`,
    `- **Milestones:** ${countOf(coverage.milestones)}`,
    `- **Environments:** ${countOf(coverage.environments)}`,
    `- **Custom fields:** ${countOf(coverage.custom_fields)}`,
    `- **Team members:** ${countOf(coverage.users)}`,
  ];

  const truncated = Object.entries(coverage)
    .filter(([, c]) => c.truncated)
    .map(([name]) => name);

  if (truncated.length > 0) {
    lines.push(
      '',
      `⚠️ **Partial data:** ${truncated.join(', ')} exceed ${PAGE_SIZE} entities and are ` +
        'truncated above. Do not treat the lists below as complete. Call ' +
        `\`qase_project_context({ code: "${code}", full: true })\` for the full set, or use ` +
        'the targeted list tools / `qql_search` to query a subset.',
    );
  }

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
    // Qualify the denominator as loaded, not total — with a truncated set the
    // suites in hand are only a slice of the project.
    const scope = coverage.suites.truncated
      ? `${topLevel.length} of ${suitesList.length} loaded, ${coverage.suites.total} in project`
      : `${topLevel.length} of ${suitesList.length} total`;
    lines.push('', `**Top-level suites** (${scope}):`);
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
    'Seed everything about a project in one call: project details, the full suite tree, ' +
    'milestones, environments, custom fields, and users. This is the first call to make when ' +
    'starting work on a project — it replaces six separate list calls and gives the model the ' +
    'metadata it needs to build any later query. Each collection returns its first ' +
    `${PAGE_SIZE} entities; the \`coverage\` field reports { total, loaded, truncated } per ` +
    'collection, so check it before assuming a list is complete, and pass `full: true` to page ' +
    'through everything. For a single record you already have the ID for, qase_get is cheaper; ' +
    'for filtered or cross-project questions, use qql_search. Cost: six API calls behind one ' +
    'tool call, 0.5-1.3s cold, and 16-48KB of response depending on project size. Cached for ' +
    '5 minutes, so repeat calls inside that window return in about 5ms. `full: true` costs one ' +
    'extra call per 100 entities and can return thousands of items.',
  schema: Schema,
  handler,
  annotations: ReadAnnotation,
  outputSchema: ProjectContextOutput,
});
