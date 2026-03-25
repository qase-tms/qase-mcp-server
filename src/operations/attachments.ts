/**
 * Attachments Operations
 *
 * Implements all MCP tools for managing attachments in Qase.
 * Attachments are files associated with test cases, steps, and results.
 */

import { z } from 'zod';
import { createReadStream, existsSync } from 'fs';
import { getApiClient } from '../client/index.js';
import {
  toolRegistry,
  ReadAnnotation,
  CreateAnnotation,
  DeleteAnnotation,
} from '../utils/registry.js';
import { toResultAsync, createToolError } from '../utils/errors.js';
import { ProjectCodeSchema, HashSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing attachments
 */
const ListAttachmentsSchema = z.object({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(10)
    .describe('Maximum number of items (default: 10, max: 100)'),
  offset: z.number().int().nonnegative().optional().describe('Number of items to skip'),
});

/**
 * Schema for getting a specific attachment
 */
const GetAttachmentSchema = z.object({
  hash: HashSchema.describe('Attachment hash identifier'),
});

/**
 * Schema for uploading an attachment
 */
const UploadAttachmentSchema = z.object({
  code: ProjectCodeSchema.describe('Project code'),
  file: z.string().describe('File content as base64 encoded string or absolute file path'),
  filename: z.string().describe('Original filename with extension'),
});

/**
 * Schema for deleting an attachment
 */
const DeleteAttachmentSchema = z.object({
  hash: HashSchema.describe('Attachment hash identifier'),
});

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * List all attachments
 */
async function listAttachments(args: z.infer<typeof ListAttachmentsSchema>) {
  const client = getApiClient();
  const { limit, offset } = args;

  const result = await toResultAsync(client.attachments.getAttachments(limit, offset));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'attachment operation');
    },
  );
}

/**
 * Get a specific attachment by hash
 */
async function getAttachment(args: z.infer<typeof GetAttachmentSchema>) {
  const client = getApiClient();
  const { hash } = args;

  const result = await toResultAsync(client.attachments.getAttachment(hash));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'attachment operation');
    },
  );
}

/**
 * Prepare file data for upload.
 * Accepts a base64-encoded string or an absolute file path.
 * Returns an object compatible with the SDK's FormData append: { name, value }.
 */
function prepareFileData(
  file: string,
  filename: string,
): { name: string; value: Buffer | ReturnType<typeof createReadStream> } {
  // If the string looks like a file path and exists on disk, stream it
  if (file.startsWith('/') && existsSync(file)) {
    return { name: filename, value: createReadStream(file) };
  }

  // Otherwise treat it as base64 content
  const isBase64 = /^[A-Za-z0-9+/=\s]+$/.test(file);
  return {
    name: filename,
    value: Buffer.from(file, isBase64 ? 'base64' : undefined),
  };
}

/**
 * Upload a new attachment
 */
async function uploadAttachment(args: z.infer<typeof UploadAttachmentSchema>) {
  const client = getApiClient();
  const { code, file, filename } = args;

  const fileData = prepareFileData(file, filename);

  const result = await toResultAsync(client.attachments.uploadAttachment(code, [fileData] as any));

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw createToolError(error, 'attachment operation');
    },
  );
}

/**
 * Delete an attachment
 */
async function deleteAttachment(args: z.infer<typeof DeleteAttachmentSchema>) {
  const client = getApiClient();
  const { hash } = args;

  const result = await toResultAsync(client.attachments.deleteAttachment(hash));

  return result.match(
    (_response) => ({ success: true, hash }),
    (error) => {
      throw createToolError(error, 'attachment operation');
    },
  );
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

toolRegistry.register({
  name: 'list_attachments',
  description: 'Get all attachments with optional pagination',
  schema: ListAttachmentsSchema,
  handler: listAttachments,
  annotations: ReadAnnotation,
});

toolRegistry.register({
  name: 'get_attachment',
  description: 'Get a specific attachment by hash, including download URL',
  schema: GetAttachmentSchema,
  handler: getAttachment,
  annotations: ReadAnnotation,
});

toolRegistry.register({
  name: 'upload_attachment',
  description: 'Upload a new attachment (provide file as base64 encoded string)',
  schema: UploadAttachmentSchema,
  handler: uploadAttachment,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'delete_attachment',
  description: 'Delete an attachment by hash',
  schema: DeleteAttachmentSchema,
  handler: deleteAttachment,
  annotations: DeleteAnnotation,
});
