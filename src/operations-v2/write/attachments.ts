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
    'Upload a file and get back the hash that other tools reference it by — screenshots, logs, ' +
    'HAR files, videos. Pass `file_base64` with the base64-encoded bytes, or `file_path` with an ' +
    'absolute path; `filename` with its extension is always required. Use `file_base64` unless ' +
    'the server runs on the same machine as the file: a remote server, the hosted connector ' +
    'included, cannot see your filesystem, and `file_path` will simply not find the file. The ' +
    'returned hash is what goes in the `attachments` field of qase_case_upsert, ' +
    'qase_result_record, qase_defect_upsert or qase_triage_defect — uploading alone attaches ' +
    'nothing, the hash has to be passed on. This is the only tool that sends ' +
    'multipart/form-data, which is why qase_api cannot send them. Upload once and reuse the ' +
    'hash rather than re-uploading the same evidence per case. Cost: one API call per file, ' +
    'dominated by file size rather than round trip — well under a second for a screenshot, ' +
    'seconds for a video. Base64 inflates the payload by about a third.',
  schema: UploadSchema,
  handler: upload,
  annotations: CreateAnnotation,
  // Core, not discoverable: the `attachments` field on core tools is unusable
  // without it, and a hidden tool left agents concluding uploads were impossible.
  visibility: 'core',
});

toolRegistry.register({
  name: 'qase_attachment_delete',
  description:
    'Delete an attachment by its hash. Anything referencing it — a case, a result, a defect — ' +
    'keeps the reference but the file is gone, so screenshots and logs attached to a failure ' +
    'disappear from the evidence trail. This cannot be undone. Attachments are addressed by hash, ' +
    'not numeric ID; the hash comes back from qase_attachment_upload. Deletion asks the user for ' +
    'confirmation and does not proceed without it. Cost: one API call, about 0.4s.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
