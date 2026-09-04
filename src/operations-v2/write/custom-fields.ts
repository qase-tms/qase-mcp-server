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
    const current = await readField(id);

    // `entity` and `type` are fixed at creation — the update endpoint has no
    // field for either. Accepting them silently would let a caller believe a
    // field changed shape when it did not, so say what was ignored.
    const warning = describeIgnoredShape(current, type);

    // The endpoint replaces the record instead of patching it, so everything
    // the caller left out has to be sent back as it stands. Renaming a field
    // otherwise empties its projects_codes and unscopes it from every project.
    // A select-type field additionally rejects an update carrying no options,
    // with nothing but "Data is invalid" to explain itself; the option ids come
    // along too, since dropping them recreates the options and orphans the
    // values already chosen on cases.
    const optionsToSend = options ?? existingOptions(current);
    const body = {
      ...carriedOver(current, rest),
      ...rest,
      ...(optionsToSend && { value: optionsToSend }),
    };
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
 * The field as it currently stands, or undefined if it cannot be read.
 *
 * `type` comes back as a label — `"selectbox"` — even though writes take the
 * numeric code, so both forms have to be understood here.
 */
type CurrentField = { type?: number | string; value?: unknown } | undefined;

/**
 * Settings the update endpoint replaces rather than patches: anything omitted
 * comes back empty. Carried over so an update only changes what was asked for.
 */
const CARRIED_OVER = [
  'placeholder',
  'default_value',
  'is_filterable',
  'is_visible',
  'is_required',
  'is_enabled_for_all_projects',
  'projects_codes',
] as const;

async function readField(id: number): Promise<CurrentField> {
  const client = getApiClient();
  const result = await toResultAsync(client.customFields.getCustomField(id));
  return result.match(
    (r) => r.data.result as CurrentField,
    () => undefined,
  );
}

/**
 * The options a select-type field already has, ready to be sent back.
 * Undefined for types that have none, or when they cannot be read — the update
 * should still go out and let the API speak for itself.
 */
function existingOptions(current: CurrentField): Array<Record<string, unknown>> | undefined {
  const label = currentTypeLabel(current);
  if (label === undefined) return undefined;

  if (!TYPES_NEEDING_OPTIONS.includes(label as (typeof TYPES_NEEDING_OPTIONS)[number])) {
    return undefined;
  }

  // The API hands options back as a JSON string, not as an array.
  const raw = current?.value;
  const parsed = typeof raw === 'string' ? safeParseJson(raw) : raw;
  return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : undefined;
}

/** Current settings the caller did not mention, ready to be sent back. */
function carriedOver(
  current: CurrentField,
  given: Record<string, unknown>,
): Record<string, unknown> {
  if (!current) return {};

  const source = current as Record<string, unknown>;
  const carried: Record<string, unknown> = {};
  for (const key of CARRIED_OVER) {
    if (given[key] === undefined && source[key] !== undefined && source[key] !== null) {
      carried[key] = source[key];
    }
  }
  return carried;
}

/** The field's type as a label, whichever form the API used to report it. */
function currentTypeLabel(current: CurrentField): TypeLabel | undefined {
  const raw = current?.type;
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') {
    return (Object.keys(TYPE_CODES) as TypeLabel[]).find((k) => k === raw);
  }
  return (Object.keys(TYPE_CODES) as TypeLabel[]).find((k) => TYPE_CODES[k] === raw);
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Report a type the caller asked for that the field cannot be given. Returns
 * undefined when nothing was asked for, when it matches, or when the current
 * shape cannot be read — a warning is a courtesy, never a reason to fail.
 */
function describeIgnoredShape(current: CurrentField, type?: TypeLabel): string | undefined {
  if (type === undefined) return undefined;

  const currentLabel = currentTypeLabel(current);
  if (currentLabel === undefined || currentLabel === type) return undefined;

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
    'Create or update a custom field. With `id` it updates that field, without `id` it creates ' +
    'one, and `entity` ("case", "run" or "defect") and `type` ("number", "string", "text", ' +
    '"selectbox", "checkbox", "radio", "multiselect", "url", "user", "datetime") are then ' +
    'required. Both are fixed at creation: the update endpoint cannot change them, and passing a ' +
    'different `type` to an update returns a warning rather than silently doing nothing. Options ' +
    'for selectbox, radio and multiselect are given as a plain list of titles. Custom fields are ' +
    'workspace-wide, not per-project: scope them with `projects_codes` or set ' +
    'is_enabled_for_all_projects. Anything left out of an update is carried over from the current ' +
    'field, so a rename does not empty the rest. Read existing fields with qase_project_context ' +
    'or qase_get. Cost: one API call to create, two to update (the current field is read first), ' +
    'about 0.5-0.9s.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_custom_field_delete',
  description:
    'Delete a custom field by ID. The field disappears from every project it applies to, and the ' +
    'values entered for it on cases, runs or defects go with it — the reach is workspace-wide, ' +
    'not project-wide. This cannot be undone. To take a field out of one project only, use ' +
    'qase_custom_field_upsert and remove that code from `projects_codes` instead. Deletion asks ' +
    'the user for confirmation and does not proceed without it. Cost: one API call, about 0.4s.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
