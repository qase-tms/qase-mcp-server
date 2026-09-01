/**
 * Tests for qase_attachment_upload.
 *
 * Two defects behind qase-tms/qase-mcp-server#74: the tool was hidden from
 * tools/list, so agents concluded uploads were impossible on the connector and
 * reached for qase_api (which sends JSON only); and the single `file` argument
 * guessed base64-vs-path from the value, decoding plain text into noise.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockUpload = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    attachments: { uploadAttachment: mockUpload, deleteAttachment: jest.fn() },
  }),
}));

import './attachments.js';
import { toolRegistry } from '../../utils/registry.js';

function invoke(args: Record<string, unknown>) {
  return toolRegistry.getHandler('qase_attachment_upload')!(args);
}

/** The bytes handed to the API for the first (only) file part. */
function uploadedBuffer(): Buffer {
  const [, files] = mockUpload.mock.calls[0];
  return files[0].value as Buffer;
}

const scratch = mkdtempSync(join(tmpdir(), 'qase-attach-'));

// A path input becomes createReadStream(path), which opens the file on a later
// tick. Tests that only assert on `.path` never read the stream, so the open
// lands after the test finished and after afterAll's rmSync removed the file —
// and with no 'error' listener on the stream, that ENOENT surfaced as an
// unhandled failure against whichever suite the worker happened to be running
// (integration-headers.test.ts, which touches no files at all), while the open
// handle also kept the worker alive past the end of the run. destroy() alone
// does not cancel a scheduled open, so the listener is what actually matters.
afterEach(() => {
  for (const [, files] of mockUpload.mock.calls) {
    for (const file of files as Array<{ value: unknown }>) {
      const stream = file.value as { destroy?: () => void; on?: (e: string, f: () => void) => void };
      if (typeof stream?.destroy !== 'function') continue;
      stream.on?.('error', () => {});
      stream.destroy();
    }
  }
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockReturnValue(
    Promise.resolve({ data: { status: true, result: [{ hash: 'abc123' }] } }),
  );
});

describe('qase_attachment_upload — visibility', () => {
  it('is listed by default, without a discovery call', () => {
    // Hidden, it left the model with only qase_api, which cannot send multipart.
    expect(toolRegistry.getTools().map((t) => t.name)).toContain('qase_attachment_upload');
  });

  it('says it is the only way to get an attachment hash', () => {
    const description = toolRegistry.getTool('qase_attachment_upload')!.description!;

    expect(description).toContain('multipart/form-data');
    expect(description).toContain('qase_api cannot send');
  });

  it('tells the caller that file_path is useless on a remote server', () => {
    const schema = toolRegistry.getTool('qase_attachment_upload')!.inputSchema as any;

    expect(schema.properties.file_path.description).toMatch(/remote server cannot see/);
  });
});

describe('qase_attachment_upload — base64 input', () => {
  it('decodes valid base64 to the original bytes', async () => {
    const content = 'hello world';

    await invoke({
      code: 'DEMO',
      filename: 'note.txt',
      file_base64: Buffer.from(content).toString('base64'),
    });

    expect(uploadedBuffer().toString('utf8')).toBe(content);
  });

  it('rejects file_base64 that is not base64 instead of uploading noise', async () => {
    // "hello world" passed the old character-class check and decoded to garbage.
    await expect(
      invoke({ code: 'DEMO', filename: 'note.txt', file_base64: 'hello world' }),
    ).rejects.toThrow(/not valid base64/);

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('returns the hash from the API', async () => {
    const result = await invoke({
      code: 'DEMO',
      filename: 'note.txt',
      file_base64: Buffer.from('x').toString('base64'),
    });

    expect(result).toEqual([{ hash: 'abc123' }]);
  });
});

describe('qase_attachment_upload — path input', () => {
  it('streams a file that exists', async () => {
    const path = join(scratch, 'local.txt');
    writeFileSync(path, 'from disk');

    await invoke({ code: 'DEMO', filename: 'local.txt', file_path: path });

    const [, files] = mockUpload.mock.calls[0];
    expect(files[0].name).toBe('local.txt');
    expect(files[0].value).toHaveProperty('path', path);
  });

  it('explains itself when the path does not exist', async () => {
    await expect(
      invoke({ code: 'DEMO', filename: 'nope.txt', file_path: '/definitely/not/here.txt' }),
    ).rejects.toThrow(/No file at/);

    // Previously a bad path fell through to base64 handling and uploaded noise.
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('qase_attachment_upload — legacy `file` argument', () => {
  it('still accepts base64 through `file`', async () => {
    await invoke({
      code: 'DEMO',
      filename: 'note.txt',
      file: Buffer.from('hello world').toString('base64'),
    });

    expect(uploadedBuffer().toString('utf8')).toBe('hello world');
  });

  it('still accepts a local path through `file`', async () => {
    const path = join(scratch, 'legacy.txt');
    writeFileSync(path, 'legacy');

    await invoke({ code: 'DEMO', filename: 'legacy.txt', file: path });

    const [, files] = mockUpload.mock.calls[0];
    expect(files[0].value).toHaveProperty('path', path);
  });

  it('uploads text that merely looks like base64 verbatim', async () => {
    // The regression: "Test data 123" is letters/digits/spaces, so the old
    // check called it base64 and the file arrived as binary noise.
    await invoke({ code: 'DEMO', filename: 'note.txt', file: 'Test data 123' });

    expect(uploadedBuffer().toString('utf8')).toBe('Test data 123');
  });
});

describe('qase_attachment_upload — missing content', () => {
  it('names the arguments to use when none was given', async () => {
    await expect(invoke({ code: 'DEMO', filename: 'note.txt' })).rejects.toThrow(
      /No file content provided/,
    );
  });
});
