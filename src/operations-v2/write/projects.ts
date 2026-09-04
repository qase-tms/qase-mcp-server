import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema } from '../../utils/validation.js';

const CreateSchema = z
  .object({
    title: z.string().min(1).max(255).describe('Project title'),
    code: ProjectCodeSchema.describe(
      'Project code — unique per workspace, letters only (no digits or special characters)',
    ),
    description: z.string().optional(),
    access: z
      .enum(['all', 'group', 'none'])
      .optional()
      .describe('Who can access the project: everyone, a team group, or nobody but the owner'),
    group: z.string().optional().describe('Team group hash — required when access is "group"'),
    settings: z.record(z.any()).optional().describe('Additional project settings'),
  })
  .refine((v) => v.access !== 'group' || !!v.group, {
    message: 'A group hash is required when access is "group"',
    path: ['group'],
  });

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
});

async function create(rawArgs: unknown) {
  // Tool handlers get raw MCP arguments, and the group-hash rule is a refinement
  // no JSON Schema can express — validate here so a bad call reads clearly.
  const parsed = CreateSchema.safeParse(rawArgs);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
      .join('; ');
    throw createToolError(`Invalid arguments — ${details}`, 'project operation');
  }

  const client = getApiClient();
  const result = await toResultAsync(client.projects.createProject(parsed.data as never));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'project operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.projects.deleteProject(args.code));
  return result.match(
    () => ({ success: true, code: args.code }),
    (e) => {
      throw createToolError(e, 'project operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_project_create',
  description:
    'Create a new project. The code must be unique in the workspace and may contain letters ' +
    'only. Projects cannot be renamed or reconfigured through the API afterwards — there is no ' +
    'update endpoint — so pick the title and code deliberately.',
  schema: CreateSchema,
  handler: create,
  annotations: CreateAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_project_delete',
  description:
    'Delete an entire project by its code. This removes every test case, suite, run, result, ' +
    'defect and milestone it holds, and cannot be undone. The most destructive operation in the ' +
    'API — confirm the code names the project you mean before calling it.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
