/**
 * Tests for qase_attachment_upload.
 *
 * Two defects behind qase-tms/qase-mcp-server#74: the tool was hidden from
 * tools/list, so agents concluded uploads were impossible on the connector and
 * reached for qase_api (which sends JSON only); and the single `file` argument
 * guessed base64-vs-path from the value, decoding plain text into noise.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { writeFileSync, mkdtempSync, rmSync, openSync, ftruncateSync, closeSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setTestEnv } from '../../utils/test-helpers.js';
import { ToolExecutionError } from '../../utils/errors.js';

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

describe('qase_attachment_upload — several files in one request', () => {
  const b64 = (content: string) => Buffer.from(content).toString('base64');

  it('sends every file as its own part of a single request', async () => {
    await invoke({
      code: 'DEMO',
      files: [
        { filename: 'first.txt', file_base64: b64('first') },
        { filename: 'second.txt', file_base64: b64('second') },
      ],
    });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [code, files] = mockUpload.mock.calls[0];
    expect(code).toBe('DEMO');
    expect((files as Array<{ name: string }>).map((f) => f.name)).toEqual([
      'first.txt',
      'second.txt',
    ]);
    expect((files as Array<{ value: Buffer }>).map((f) => f.value.toString('utf8'))).toEqual([
      'first',
      'second',
    ]);
  });

  it('mixes base64 content and local paths in one request', async () => {
    const path = join(scratch, 'mixed.txt');
    writeFileSync(path, 'from disk');

    await invoke({
      code: 'DEMO',
      files: [
        { filename: 'inline.txt', file_base64: b64('inline') },
        { filename: 'mixed.txt', file_path: path },
      ],
    });

    const [, files] = mockUpload.mock.calls[0];
    expect((files[0].value as Buffer).toString('utf8')).toBe('inline');
    expect(files[1].value).toHaveProperty('path', path);
  });

  it('returns a hash for every uploaded file', async () => {
    mockUpload.mockReturnValue(
      Promise.resolve({ data: { status: true, result: [{ hash: 'h1' }, { hash: 'h2' }] } }),
    );

    const result = await invoke({
      code: 'DEMO',
      files: [
        { filename: 'a.txt', file_base64: b64('a') },
        { filename: 'b.txt', file_base64: b64('b') },
      ],
    });

    expect(result).toEqual([{ hash: 'h1' }, { hash: 'h2' }]);
  });

  it('names the entry that carries no content', async () => {
    await expect(
      invoke({
        code: 'DEMO',
        files: [{ filename: 'a.txt', file_base64: b64('a') }, { filename: 'empty.txt' }],
      }),
    ).rejects.toThrow(/empty\.txt/);

    // Nothing is uploaded until every entry is known to be sound.
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('refuses an empty files list', async () => {
    await expect(invoke({ code: 'DEMO', files: [] })).rejects.toThrow(/No file content provided/);

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('still requires filename for the single-file form', async () => {
    await expect(invoke({ code: 'DEMO', file_base64: b64('x') })).rejects.toThrow(/filename/);

    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('qase_attachment_upload — Qase upload limits', () => {
  /** A file of the given size that costs neither disk space nor time to make. */
  function sparseFile(name: string, bytes: number): string {
    const path = join(scratch, name);
    const fd = openSync(path, 'w');
    ftruncateSync(fd, bytes);
    closeSync(fd);
    return path;
  }

  const MB = 1024 * 1024;

  it('refuses more than 20 files in one request', async () => {
    const files = Array.from({ length: 21 }, (_, i) => ({
      filename: `f${i}.txt`,
      file_base64: Buffer.from('x').toString('base64'),
    }));

    await expect(invoke({ code: 'DEMO', files })).rejects.toThrow(/20 files/);

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('refuses a file over 32 MB, naming it, before decoding it', async () => {
    // Deliberately not valid base64: the size check has to come first, or a
    // 45 MB string gets decoded into memory only to be rejected afterwards.
    await expect(
      invoke({ code: 'DEMO', filename: 'huge.mp4', file_base64: 'A'.repeat(45 * MB) }),
    ).rejects.toThrow(/huge\.mp4.*32 MB/s);

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('refuses a request over 128 MB in total, even when each file fits', async () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      filename: `big${i}.bin`,
      file_path: sparseFile(`big${i}.bin`, 30 * MB),
    }));

    await expect(invoke({ code: 'DEMO', files })).rejects.toThrow(/128 MB/);

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('explains a 507 as the team account being out of storage', async () => {
    mockUpload.mockReturnValue(
      Promise.reject({
        isAxiosError: true,
        message: 'Request failed with status code 507',
        response: { status: 507, data: { errorMessage: 'Insufficient Storage' } },
      }),
    );

    const error = await invoke({
      code: 'DEMO',
      filename: 'note.txt',
      file_base64: Buffer.from('x').toString('base64'),
    }).catch((e: ToolExecutionError) => e);

    expect(error).toBeInstanceOf(ToolExecutionError);
    expect((error as ToolExecutionError).message).toMatch(/storage/i);
    // A 507 is not retryable: the account is full until someone frees space.
    expect((error as ToolExecutionError).suggestion).toMatch(/free up space|upgrade/i);
  });
});
