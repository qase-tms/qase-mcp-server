import { describe, it, expect } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { QaseApiClient } from './index.js';
import { serverStorage } from '../utils/server-context.js';

const HOST = 'https://api.qase.io';
const OPAQUE = 'opaque-token-123';

function serverWithClient(name: string, version: string): Server {
  return { getClientVersion: () => ({ name, version }) } as unknown as Server;
}

describe('MCP client identity headers (metrics)', () => {
  it('tags requests with X-MCP-Client-Name/Version from the initialize clientInfo', async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(`${HOST}/projects`).reply(200, {});

    const client = new QaseApiClient({ token: OPAQUE, host: HOST }, instance);
    await serverStorage.run(serverWithClient('claude-ai', '1.2.3'), () =>
      client.request('/projects'),
    );

    const headers = mock.history.get[0].headers ?? {};
    expect(headers['X-MCP-Client-Name']).toBe('claude-ai');
    expect(headers['X-MCP-Client-Version']).toBe('1.2.3');
  });

  it('applies to SDK-generated calls too', async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/v1\/project/).reply(200, { status: true, result: { entities: [], total: 0 } });

    const client = new QaseApiClient({ token: OPAQUE, host: HOST }, instance);
    await serverStorage.run(serverWithClient('cursor-vscode', '0.42.0'), () =>
      client.projects.getProjects(undefined, undefined, undefined),
    );

    const headers = mock.history.get[0].headers ?? {};
    expect(headers['X-MCP-Client-Name']).toBe('cursor-vscode');
    expect(headers['X-MCP-Client-Version']).toBe('0.42.0');
  });

  it('adds no client headers when there is no server context', async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(`${HOST}/projects`).reply(200, {});

    const client = new QaseApiClient({ token: OPAQUE, host: HOST }, instance);
    await client.request('/projects'); // outside any serverStorage.run scope

    const headers = mock.history.get[0].headers ?? {};
    expect(headers['X-MCP-Client-Name']).toBeUndefined();
    expect(headers['X-MCP-Client-Version']).toBeUndefined();
  });
});
