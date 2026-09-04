import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { IdSchema, ProjectCodeSchema } from '../../utils/validation.js';

const CONTEXT = 'custom field operation';

/** The API takes numbers here; the tool takes labels and maps them. */
const ENTITY_CODES = { case: 0, run: 1, defect: 2 } as const;

const TYPE_CODES = {
  number: 0,
  string: 1,
  text: 2,
  selectbox: 3,
  checkbox: 4,
  radio: 5,
  multiselect: 6,
  url: 7,
  user: 8,
  datetime: 9,
} as const;

/** Types whose whole point is a list of options to pick from. */
const TYPES_NEEDING_OPTIONS = ['selectbox', 'radio', 'multiselect'] as const;

type TypeLabel = keyof typeof TYPE_CODES;

const UpsertSchema = z.object({
  id: IdSchema.optional().describe('Custom field ID — if provided, updates; if omitted, creates'),
  title: z.string().min(1).max(255).describe('Field title'),
  entity: z
    .enum(['case', 'run', 'defect'])
    .optional()
    .describe('What the field is attached to. Required when creating; cannot be changed later'),
  type: z
    .enum(Object.keys(TYPE_CODES) as [TypeLabel, ...TypeLabel[]])
    .optional()
    .describe('Field type. Required when creating; cannot be changed later'),
  value: z
    .array(z.string())
    .optional()
    .describe('Option titles — required for selectbox, radio and multiselect'),
  placeholder: z.string().optional(),
  default_value: z.string().optional(),
  is_filterable: z.boolean().optional(),
  is_visible: z.boolean().optional(),
  is_required: z.boolean().optional(),
  is_enabled_for_all_projects: z.boolean().optional(),
  projects_codes: z
    .array(ProjectCodeSchema)
    .optional()
    .describe('Projects the field applies to. Ignored when is_enabled_for_all_projects is true'),
});

const DeleteSchema = z.object({
  id: IdSchema,
});

function parseArgs(rawArgs: unknown) {
  const parsed = UpsertSchema.safeParse(rawArgs);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
      .join('; ');
    throw createToolError(`Invalid arguments — ${details}`, CONTEXT);
  }
  return parsed.data;
}

async function upsert(rawArgs: unknown) {
  const args = parseArgs(rawArgs);
  const { id, entity, type, value, ...rest } = args;
  const client = getApiClient();

  // Option titles travel as objects, so a caller can pass a plain list of strings.
  const options = value?.map((title) => ({ title }));

  if (id) {
    // `entity` and `type` are fixed at creation — the update endpoint has no
    // field for either. Accepting them silently would let a caller believe a
    // field changed shape when it did not, so say what was ignored.
    const warning = await describeIgnoredShape(id, type);

    const body = { ...rest, ...(options && { value: options }) };
    const result = await toResultAsync(client.customFields.updateCustomField(id, body as never));
    return result.match(
      () => ({ id, ...(warning && { warning }) }),
      (e) => {
        throw createToolError(e, CONTEXT);
      },
    );
  }

  if (entity === undefined || type === undefined) {
    throw createToolError(
      'Invalid arguments — entity and type are required when creating a custom field',
      CONTEXT,
    );
  }

  if (TYPES_NEEDING_OPTIONS.includes(type as (typeof TYPES_NEEDING_OPTIONS)[number]) && !options) {
    throw createToolError(
      `Invalid arguments — value is required for a ${type} field: it has nothing to offer without options`,
      CONTEXT,
    );
  }

  const body = {
    ...rest,
    entity: ENTITY_CODES[entity],
    type: TYPE_CODES[type],
    ...(options && { value: options }),
  };

  const result = await toResultAsync(client.customFields.createCustomField(body as never));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, CONTEXT);
    },
  );
}

/**
 * Report a type the caller asked for that the field cannot be given. Returns
 * undefined when nothing was asked for, when it matches, or when the current
 * shape cannot be read — a warning is a courtesy, never a reason to fail.
 */
async function describeIgnoredShape(id: number, type?: TypeLabel): Promise<string | undefined> {
  if (type === undefined) return undefined;

  const client = getApiClient();
  const current = await toResultAsync(client.customFields.getCustomField(id));
  const field = current.match(
    (r) => r.data.result as { type?: number } | undefined,
    () => undefined,
  );
  if (!field || field.type === undefined || field.type === TYPE_CODES[type]) return undefined;

  const currentLabel =
    (Object.keys(TYPE_CODES) as TypeLabel[]).find((k) => TYPE_CODES[k] === field.type) ??
    String(field.type);
  return (
    `The field stays a ${currentLabel}: a custom field's type is fixed when it is created, ` +
    `so "${type}" was ignored. Delete and recreate the field to change its type.`
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.customFields.deleteCustomField(args.id));
  return result.match(
    () => ({ success: true, id: args.id }),
    (e) => {
      throw createToolError(e, CONTEXT);
    },
  );
}

toolRegistry.register({
  name: 'qase_custom_field_upsert',
  description:
    'Create or update a custom field. If `id` is provided, updates the existing field; if ' +
    'omitted, creates a new one, and `entity` and `type` are then required. Both are fixed at ' +
    'creation and cannot be changed afterwards. Custom fields are workspace-wide: scope them ' +
    'with `projects_codes`, or set is_enabled_for_all_projects. Read existing fields with ' +
    'qase_project_context or qase_get (entity: "custom_field").',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_custom_field_delete',
  description:
    'Delete a custom field by ID. The field disappears from every project it applies to, ' +
    'along with the values entered for it. This cannot be undone.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
