/**
 * MCP specification compliance of the server's own surface.
 *
 * These are the rules a spec-conformance audit checks and a client actually
 * relies on: the identity the server presents at initialize, the
 * display metadata clients render, the documentation the model reads before
 * choosing arguments, and the error a bad pagination cursor must produce.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { setTestEnv } from './utils/test-helpers.js';

setTestEnv();

// The operation modules build an API client on import; stub it away.
jest.mock('./client/index.js', () => {
  const mockResponse = Promise.resolve({ data: { status: true, result: {} } });
  const createDeepProxy = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
          const fn = jest.fn().mockReturnValue(mockResponse);
          return new Proxy(fn, {
            get(fnTarget, fnProp) {
              if (fnProp in fnTarget) return (fnTarget as any)[fnProp];
              return jest.fn().mockReturnValue(mockResponse);
            },
          });
        },
      },
    );

  return {
    getApiClient: jest.fn().mockReturnValue(createDeepProxy()),
    apiRequest: jest.fn().mockResolvedValue({ status: true, result: {} }),
    resetClientInstance: jest.fn(),
  };
});

import { createServer } from './server.js';

let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'spec-compliance-test', version: '1.0.0' });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
});

describe('server identity', () => {
  it('presents a human-readable title alongside the machine name', () => {
    const info = client.getServerVersion() as Record<string, unknown>;
    expect(info.name).toBe('qase-mcp-server');
    expect(info.title).toBe('Qase Test Management');
  });

  it('points at the product website', () => {
    const info = client.getServerVersion() as Record<string, unknown>;
    expect(info.websiteUrl).toBe('https://qase.io');
  });

  it('ships an icon clients can render', () => {
    const info = client.getServerVersion() as Record<string, unknown>;
    const icons = info.icons as Array<{ src: string }> | undefined;
    expect(icons?.length).toBeGreaterThan(0);
    expect(icons?.[0].src).toMatch(/^https:\/\//);
  });
});

describe('tool metadata', () => {
  it('gives every listed tool a display title', async () => {
    const { tools } = await client.listTools();
    const untitled = tools.filter((t) => !t.title || !t.title.trim()).map((t) => t.name);
    expect(untitled).toEqual([]);
  });

  it('documents every input property of every listed tool', async () => {
    const { tools } = await client.listTools();
    const undocumented: string[] = [];

    for (const tool of tools) {
      const properties = (tool.inputSchema as any)?.properties ?? {};
      for (const [field, schema] of Object.entries<any>(properties)) {
        if (!schema?.description || !String(schema.description).trim()) {
          undocumented.push(`${tool.name}.${field}`);
        }
      }
    }

    expect(undocumented).toEqual([]);
  });
});

describe('prompt metadata', () => {
  it('gives every prompt a display title', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    const untitled = prompts.filter((p) => !p.title || !p.title.trim()).map((p) => p.name);
    expect(untitled).toEqual([]);
  });
});

describe('pagination cursors', () => {
  // -32602 is JSON-RPC "Invalid params"; the spec requires it for a cursor the
  // server did not issue, rather than silently serving the first page.
  const INVALID_PARAMS = -32602;

  it('rejects an unknown cursor on tools/list', async () => {
    await expect(client.listTools({ cursor: 'not-a-cursor' })).rejects.toMatchObject({
      code: INVALID_PARAMS,
    });
  });

  it('rejects an unknown cursor on prompts/list', async () => {
    await expect(client.listPrompts({ cursor: 'not-a-cursor' })).rejects.toMatchObject({
      code: INVALID_PARAMS,
    });
  });

  it('still serves the catalog when no cursor is passed', async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});
