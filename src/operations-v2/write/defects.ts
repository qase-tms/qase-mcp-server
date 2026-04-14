import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const DefectFieldsSchema = z.object({
  title: z.string().min(1).max(255).describe('Defect title'),
  actual_result: z.string().optional(),
  severity: z
    .enum(['undefined', 'blocker', 'critical', 'major', 'normal', 'minor', 'trivial'])
    .optional(),
  status: z
    .enum(['open', 'in_progress', 'resolved', 'invalid'])
    .optional()
    .describe('Set to "resolved" to resolve the defect'),
  tags: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
  custom_field: z.record(z.any()).optional(),
});

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe('Defect ID — if provided, updates; if omitted, creates'),
  ...DefectFieldsSchema.shape,
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, status, ...data } = args;

  if (id) {
    // Update path: handle status changes
    if (status === 'resolved') {
      const res = await toResultAsync(client.defects.resolveDefect(code, id));
      return res.match(
        (r) => r.data.result ?? { success: true, id, status: 'resolved' },
        (e) => {
          throw createToolError(e, 'defect operation');
        },
      );
    }
    if (status) {
      const res = await toResultAsync(
        client.defects.updateDefectStatus(code, id, { status } as any),
      );
      return res.match(
        () => ({ success: true, id, status }),
        (e) => {
          throw createToolError(e, 'defect operation');
        },
      );
    }
    const res = await toResultAsync(client.defects.updateDefect(code, id, data as any));
    return res.match(
      (r) => r.data.result,
      (e) => {
        throw createToolError(e, 'defect operation');
      },
    );
  }

  // Create path
  const createData = { ...data, ...(status && { status }) };
  const res = await toResultAsync(client.defects.createDefect(code, createData as any));
  return res.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'defect operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.defects.deleteDefect(args.code, args.id));
  return result.match(
    () => ({ success: true, id: args.id }),
    (e) => {
      throw createToolError(e, 'defect operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_defect_upsert',
  description:
    'Create or update a defect. If `id` is provided, updates (including status changes and resolve). ' +
    'If omitted, creates a new defect. Set `status: "resolved"` to resolve an existing defect.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_defect_delete',
  description: 'Delete a defect by project code and defect ID.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
