import { z } from 'zod';
import { createReadStream, existsSync } from 'fs';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError, ToolExecutionError } from '../../utils/errors.js';
import { ProjectCodeSchema, HashSchema } from '../../utils/validation.js';

const UploadSchema = z.object({
  code: ProjectCodeSchema,
  file_base64: z
    .string()
    .optional()
    .describe(
      'File content, base64 encoded. Use this whenever the server is not on the same machine ' +
        'as the file — including the hosted connector, where it is the only option.',
    ),
  file_path: z
    .string()
    .optional()
    .describe(
      'Absolute path to a file on the machine running THIS server. Only usable for a local ' +
        'stdio server; a remote server cannot see your filesystem — send file_base64 instead.',
    ),
  file: z
    .string()
    .optional()
    .describe(
      'Deprecated: prefer file_base64 or file_path, which say which one you mean. Accepts ' +
        'either an absolute path to an existing file or base64 content.',
    ),
  filename: z.string().describe('Original filename with extension'),
});

const DeleteSchema = z.object({
  hash: HashSchema.describe('Attachment hash identifier'),
});

type FilePart = { name: string; value: Buffer | ReturnType<typeof createReadStream> };

/**
 * Is this string base64, rather than raw text that merely looks like it?
 *
 * Decoding and re-encoding round-trips only for genuine base64: Node's decoder
 * skips characters outside the alphabet, so "hello world" decodes to garbage
 * and re-encodes to something else. The previous character-class test passed
 * for any letters-digits-spaces string, silently turning plain text files into
 * binary noise.
 */
function isBase64(value: string): boolean {
  const compact = value.replace(/\s/g, '');
  if (compact.length === 0 || compact.length % 4 !== 0) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return false;
  return Buffer.from(compact, 'base64').toString('base64') === compact;
}

function readLocalFile(path: string, filename: string): FilePart {
  if (!existsSync(path)) {
    throw new ToolExecutionError(
      `No file at "${path}" on the machine running this server.`,
      'If the server is remote (for example the hosted connector) it cannot read your local ' +
        'filesystem — read the file yourself and pass its bytes as file_base64.',
    );
  }
  return { name: filename, value: createReadStream(path) };
}

function prepareFileData(args: z.infer<typeof UploadSchema>): FilePart {
  const { file_base64, file_path, file, filename } = args;

  if (file_path) return readLocalFile(file_path, filename);

  if (file_base64) {
    if (!isBase64(file_base64)) {
      throw new ToolExecutionError(
        'file_base64 is not valid base64.',
        'Base64-encode the file bytes, or use file_path for a file local to this server. ' +
          'To send text as-is, encode it first.',
      );
    }
    return { name: filename, value: Buffer.from(file_base64, 'base64') };
  }

  if (file) {
    // Legacy single-argument form: decide by what the value actually is.
    if (file.startsWith('/') && existsSync(file)) {
      return { name: filename, value: createReadStream(file) };
    }
    return {
      name: filename,
      // Not base64 → treat as literal content rather than decoding it into noise.
      value: Buffer.from(file, isBase64(file) ? 'base64' : 'utf8'),
    };
  }

  throw new ToolExecutionError(
    'No file content provided.',
    'Pass file_base64 (base64 encoded content) or file_path (a path local to this server).',
  );
}

async function upload(args: z.infer<typeof UploadSchema>) {
  const client = getApiClient();
  const fileData = prepareFileData(args);
  const result = await toResultAsync(
    client.attachments.uploadAttachment(args.code, [fileData] as any),
  );
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
    'Upload a file attachment and get back its hash, which the `attachments` field of ' +
    'qase_case_upsert, qase_result_record, qase_ci_report, qase_triage_defect, and ' +
    'qase_shared_step_upsert accepts. This is the only way to obtain such a hash — the upload ' +
    'endpoint needs multipart/form-data, which qase_api cannot send. Pass the file as base64 ' +
    '(`file_base64`), which is the only option when the server runs remotely, such as the ' +
    'hosted connector; `file_path` works only when the server runs on the same machine as ' +
    'the file.',
  schema: UploadSchema,
  handler: upload,
  annotations: CreateAnnotation,
  // Core, not discoverable: the `attachments` field on core tools is unusable
  // without it, and a hidden tool left agents concluding uploads were impossible.
  visibility: 'core',
});

toolRegistry.register({
  name: 'qase_attachment_delete',
  description: 'Delete an attachment by its hash.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
