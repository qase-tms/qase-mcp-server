import { z } from 'zod';
import { createReadStream, existsSync, statSync } from 'fs';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError, ToolExecutionError } from '../../utils/errors.js';
import { ProjectCodeSchema, HashSchema } from '../../utils/validation.js';

/**
 * Qase caps a single upload request. Checked here rather than left to the API
 * so an oversized request fails before its bytes are read, decoded and sent.
 */
const MAX_FILES_PER_REQUEST = 20;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_REQUEST_BYTES = 128 * 1024 * 1024;

const FileEntrySchema = z.object({
  filename: z.string().describe('Original filename with extension'),
  file_base64: z
    .string()
    .optional()
    .describe('File content, base64 encoded. The only option on a remote server.'),
  file_path: z
    .string()
    .optional()
    .describe('Absolute path to a file on the machine running THIS server.'),
});

const UploadSchema = z.object({
  code: ProjectCodeSchema,
  files: z
    .array(FileEntrySchema)
    .min(1)
    .max(MAX_FILES_PER_REQUEST)
    .optional()
    .describe(
      'Several files in one request — each entry carries its own filename and either ' +
        'file_base64 or file_path. Qase accepts at most 20 files, 32 MB per file and 128 MB ' +
        'in total per request. Prefer this over one call per file: it is a single round trip ' +
        'and returns the hashes in the same order.',
    ),
  file_base64: z
    .string()
    .optional()
    .describe(
      'Single-file form. File content, base64 encoded. Use this whenever the server is not ' +
        'on the same machine as the file — including the hosted connector, where it is the ' +
        'only option.',
    ),
  file_path: z
    .string()
    .optional()
    .describe(
      'Single-file form. Absolute path to a file on the machine running THIS server. Only ' +
        'usable for a local stdio server; a remote server cannot see your filesystem — send ' +
        'file_base64 instead.',
    ),
  file: z
    .string()
    .optional()
    .describe(
      'Deprecated: prefer file_base64 or file_path, which say which one you mean. Accepts ' +
        'either an absolute path to an existing file or base64 content.',
    ),
  filename: z
    .string()
    .optional()
    .describe('Original filename with extension. Required for the single-file form.'),
});

const DeleteSchema = z.object({
  hash: HashSchema.describe('Attachment hash identifier'),
});

type FilePart = { name: string; value: Buffer | ReturnType<typeof createReadStream> };

/** One file, resolved and measured, but not yet opened for reading. */
type FileSource = { name: string; bytes: number; path?: string; buffer?: Buffer };

type FileEntry = {
  filename?: string;
  file_base64?: string;
  file_path?: string;
  file?: string;
};

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

/** Decoded size of a base64 string, without decoding it. */
function base64Bytes(value: string): number {
  const compact = value.replace(/\s/g, '');
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assertFileFits(bytes: number, filename: string): void {
  if (bytes <= MAX_FILE_BYTES) return;
  throw new ToolExecutionError(
    `"${filename}" is ${formatSize(bytes)}; Qase accepts at most 32 MB per file.`,
    'Attach a smaller excerpt — a trimmed log or a screenshot instead of a video — or host ' +
      'the file elsewhere and link to it from the comment.',
  );
}

function readLocalFile(path: string, filename: string): FileSource {
  if (!existsSync(path)) {
    throw new ToolExecutionError(
      `No file at "${path}" on the machine running this server.`,
      'If the server is remote (for example the hosted connector) it cannot read your local ' +
        'filesystem — read the file yourself and pass its bytes as file_base64.',
    );
  }
  const bytes = statSync(path).size;
  assertFileFits(bytes, filename);
  return { name: filename, bytes, path };
}

/**
 * Turn one entry into a measured source. Nothing is opened here: a request that
 * breaks a limit must not leave read streams behind for files it never sends.
 */
function resolveSource(entry: FileEntry): FileSource {
  const { file_base64, file_path, file, filename } = entry;

  if (!filename) {
    throw new ToolExecutionError(
      'filename is required for every file.',
      'Pass filename with its extension — per entry when using `files`, alongside ' +
        'file_base64 or file_path for a single file.',
    );
  }

  if (file_path) return readLocalFile(file_path, filename);

  if (file_base64) {
    // Size first: a 45 MB string should be refused before it is decoded into memory.
    assertFileFits(base64Bytes(file_base64), filename);
    if (!isBase64(file_base64)) {
      throw new ToolExecutionError(
        `file_base64 for "${filename}" is not valid base64.`,
        'Base64-encode the file bytes, or use file_path for a file local to this server. ' +
          'To send text as-is, encode it first.',
      );
    }
    const buffer = Buffer.from(file_base64, 'base64');
    return { name: filename, bytes: buffer.length, buffer };
  }

  if (file) {
    // Legacy single-argument form: decide by what the value actually is.
    if (file.startsWith('/') && existsSync(file)) return readLocalFile(file, filename);

    // Not base64 → treat as literal content rather than decoding it into noise.
    const buffer = Buffer.from(file, isBase64(file) ? 'base64' : 'utf8');
    assertFileFits(buffer.length, filename);
    return { name: filename, bytes: buffer.length, buffer };
  }

  throw new ToolExecutionError(
    `No file content provided for "${filename}".`,
    'Pass file_base64 (base64 encoded content) or file_path (a path local to this server).',
  );
}

/** The files to upload, whether they arrived as a list or as a single file. */
function toEntries(args: z.infer<typeof UploadSchema>): FileEntry[] {
  if (args.files) return args.files;
  if (args.file_base64 || args.file_path || args.file) {
    const { file_base64, file_path, file, filename } = args;
    return [{ file_base64, file_path, file, filename }];
  }
  return [];
}

function prepareFiles(args: z.infer<typeof UploadSchema>): FilePart[] {
  const entries = toEntries(args);

  if (entries.length === 0) {
    throw new ToolExecutionError(
      'No file content provided.',
      'Pass file_base64 (base64 encoded content) or file_path (a path local to this server), ' +
        'or `files` with one entry per file.',
    );
  }

  if (entries.length > MAX_FILES_PER_REQUEST) {
    throw new ToolExecutionError(
      `${entries.length} files in one request; Qase accepts at most 20 files per request.`,
      'Split them across consecutive qase_attachment_upload calls — each returns its own hashes.',
    );
  }

  const sources = entries.map(resolveSource);
  const total = sources.reduce((sum, source) => sum + source.bytes, 0);

  if (total > MAX_REQUEST_BYTES) {
    throw new ToolExecutionError(
      `These ${sources.length} files total ${formatSize(total)}; Qase accepts at most 128 MB ` +
        'per request.',
      'Split them across consecutive qase_attachment_upload calls, keeping each request under ' +
        '128 MB.',
    );
  }

  // Streams are opened last, once the whole request is known to be sendable.
  return sources.map((source) => ({
    name: source.name,
    value: source.path ? createReadStream(source.path) : (source.buffer as Buffer),
  }));
}

async function upload(args: z.infer<typeof UploadSchema>) {
  const client = getApiClient();
  const files = prepareFiles(args);
  const result = await toResultAsync(client.attachments.uploadAttachment(args.code, files as any));
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
  title: 'Upload attachment',
  description:
    'Upload files and get back the hashes that other tools reference them by — screenshots, ' +
    'logs, HAR files, videos. For one file pass `file_base64` with the base64-encoded bytes, ' +
    'or `file_path` with an absolute path, plus `filename` with its extension. For several, ' +
    'pass `files` — one entry per file, each with its own filename — and they go up in a ' +
    'single request, hashes returned in the same order. Use `file_base64` unless the server ' +
    'runs on the same machine as the file: a remote server, the hosted connector included, ' +
    'cannot see your filesystem, and `file_path` will simply not find the file. Qase accepts ' +
    'at most 20 files, 32 MB per file and 128 MB per request; a request over any of those is ' +
    'refused here before anything is sent, so split it across calls. The returned hash is what ' +
    'goes in the `attachments` field of qase_case_upsert, qase_result_record, ' +
    'qase_defect_upsert or qase_triage_defect — uploading alone attaches nothing, the hash has ' +
    'to be passed on. This is the only tool that sends multipart/form-data, which is why ' +
    'qase_api cannot send them. Upload once and reuse the hash rather than re-uploading the ' +
    'same evidence per case. Cost: one API call per request whatever the number of files, ' +
    'dominated by total size rather than round trip — well under a second for a screenshot, ' +
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
  title: 'Delete attachment',
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
