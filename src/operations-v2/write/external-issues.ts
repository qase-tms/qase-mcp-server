import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, UpdateAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const CONTEXT = 'external issue link operation';

const LinkSchema = z.object({
  id: IdSchema.describe('Test case ID (entity="case") or test run ID (entity="run")'),
  issues: z
    .array(z.string().min(1))
    .optional()
    .describe(
      'External issue keys, e.g. ["PROJ-1234"]. Required for cases (attach and detach) and ' +
        'for attaching to a run — a run accepts exactly one issue. Omit when detaching a run.',
    ),
});

const Schema = z.object({
  code: ProjectCodeSchema,
  entity: z.enum(['case', 'run']).describe('Entity to link — test case or test run'),
  action: z
    .enum(['attach', 'detach'])
    .describe('attach creates the link, detach removes it (for runs, clears the single link)'),
  type: z
    .enum(['jira-cloud', 'jira-server'])
    .describe('Issue tracker integration configured for the project'),
  links: z.array(LinkSchema).min(1).describe('Entities to link, processed in a single API request'),
});

type Args = z.infer<typeof Schema>;

function requireIssues(link: Args['links'][number], entity: string): string[] {
  if (!link.issues?.length) {
    throw createToolError(
      `No issues provided for ${entity} ${link.id} — "issues" must contain at least one external issue key (e.g. "PROJ-1234").`,
      CONTEXT,
    );
  }
  return link.issues;
}

async function linkCases(args: Args) {
  const client = getApiClient();
  const payload = {
    type: args.type,
    links: args.links.map((link) => ({
      case_id: link.id,
      external_issues: requireIssues(link, 'case'),
    })),
  };

  const call =
    args.action === 'attach'
      ? client.cases.caseAttachExternalIssue(args.code, payload as any)
      : client.cases.caseDetachExternalIssue(args.code, payload as any);

  return toResultAsync(call);
}

async function linkRuns(args: Args) {
  const client = getApiClient();
  const payload = {
    type: args.type,
    links: args.links.map((link) => {
      if (args.action === 'detach') {
        return { run_id: link.id, external_issue: null };
      }

      const issues = requireIssues(link, 'run');
      if (issues.length > 1) {
        throw createToolError(
          `A test run can have only one external issue link — ${issues.length} issues provided for run ${link.id}.`,
          CONTEXT,
        );
      }

      return { run_id: link.id, external_issue: issues[0] };
    }),
  };

  return toResultAsync(client.runs.runUpdateExternalIssue(args.code, payload as any));
}

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
  const args = parsed.data;

  const result = args.entity === 'case' ? await linkCases(args) : await linkRuns(args);

  return result.match(
    () => ({
      success: true,
      entity: args.entity,
      action: args.action,
      linked: args.links.length,
    }),
    (e) => {
      throw createToolError(e, CONTEXT);
    },
  );
}

toolRegistry.register({
  name: 'qase_external_issue_link',
  description:
    'Link or unlink test cases and test runs to issues in an external tracker — Jira Cloud or ' +
    'Jira Server, the only two supported. Use `entity` to choose between cases and runs and ' +
    '`action` to attach or detach. A test case can be linked to several issues; a test run can ' +
    'have only one link, and attaching a new issue replaces the previous one. Read the links back ' +
    'with qase_get (entity "case" or "run"). Note this covers cases and runs, not defects — a ' +
    'defect tracked elsewhere has no link field here. Cost: one API call for the whole set of ' +
    'links, about 0.5s, so link several entities in one call rather than one call each.',
  schema: Schema,
  handler,
  annotations: UpdateAnnotation,
  visibility: 'discoverable',
});
