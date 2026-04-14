import { z } from 'zod';
import { createReadStream, existsSync } from 'fs';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, HashSchema } from '../../utils/validation.js';

const UploadSchema = z.object({
  code: ProjectCodeSchema,
  file: z.string().describe('File content as base64 encoded string or absolute file path'),
  filename: z.string().describe('Original filename with extension'),
});

const DeleteSchema = z.object({
  hash: HashSchema.describe('Attachment hash identifier'),
});

function prepareFileData(
  file: string,
  filename: string,
): { name: string; value: Buffer | ReturnType<typeof createReadStream> } {
  if (file.startsWith('/') && existsSync(file)) {
    return { name: filename, value: createReadStream(file) };
  }
  const isBase64 = /^[A-Za-z0-9+/=\s]+$/.test(file);
  return {
    name: filename,
    value: Buffer.from(file, isBase64 ? 'base64' : undefined),
  };
}

async function upload(args: z.infer<typeof UploadSchema>) {
  const client = getApiClient();
  const { code, file, filename } = args;
  const fileData = prepareFileData(file, filename);
  const result = await toResultAsync(client.attachments.uploadAttachment(code, [fileData] as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'attachment operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.attachments.deleteAttachment(args.hash));
  return result.match(
    () => ({ success: true, hash: args.hash }),
    (e) => {
      throw createToolError(e, 'attachment operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_attachment_upload',
  description:
    'Upload a file attachment. Accepts the file as a base64 encoded string or an absolute path. ' +
    'Returns the attachment hash that can be referenced in test cases and results.',
  schema: UploadSchema,
  handler: upload,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_attachment_delete',
  description: 'Delete an attachment by its hash.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
