/**
 * Attachments Operations
 *
 * Implements all MCP tools for managing attachments in Qase.
 * Attachments are files associated with test cases, steps, and results.
 */

import { z } from 'zod';
import { getApiClient } from '../client/index.js';
import { toolRegistry } from '../utils/registry.js';
import { toResultAsync } from '../utils/errors.js';
import { ProjectCodeSchema, HashSchema } from '../utils/validation.js';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for listing attachments
 */
const ListAttachmentsSchema = z.object({
  limit: z.number().int().positive().max(100).optional().describe('Maximum number of items'),
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
  code: ProjectCodeSchema.optional().describe(
    'Project code (optional, for project-specific attachments)',
  ),
  file: z.string().describe('File content as base64 encoded string or file path'),
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
      throw new Error(error);
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
      throw new Error(error);
    },
  );
}

/**
 * Upload a new attachment
 */
async function uploadAttachment(args: z.infer<typeof UploadAttachmentSchema>) {
  const client = getApiClient();
  const { code, file, filename } = args;

  // Create upload data with file content
  const uploadData = {
    file,
    filename,
  };

  const result = await toResultAsync(
    code
      ? client.attachments.uploadAttachment(code, uploadData as any)
      : client.attachments.uploadAttachment(uploadData as any),
  );

  return result.match(
    (response) => response.data.result,
    (error) => {
      throw new Error(error);
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
      throw new Error(error);
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
});

toolRegistry.register({
  name: 'get_attachment',
  description: 'Get a specific attachment by hash, including download URL',
  schema: GetAttachmentSchema,
  handler: getAttachment,
});

toolRegistry.register({
  name: 'upload_attachment',
  description: 'Upload a new attachment (provide file as base64 encoded string)',
  schema: UploadAttachmentSchema,
  handler: uploadAttachment,
});

toolRegistry.register({
  name: 'delete_attachment',
  description: 'Delete an attachment by hash',
  schema: DeleteAttachmentSchema,
  handler: deleteAttachment,
});
