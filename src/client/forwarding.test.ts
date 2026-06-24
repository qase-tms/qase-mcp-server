// src/client/forwarding.test.ts
import { describe, it, expect } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { QaseApiClient } from './index.js';

const HOST = 'https://api.qase.io';
const JWT = 'aaa.bbb.ccc';
const OPAQUE = 'opaque-token-123';

describe('Qase API token forwarding', () => {
  it('sends a JWT as Authorization: Bearer and no Token header', async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(`${HOST}/projects`).reply(200, {});

    const client = new QaseApiClient({ token: JWT, host: HOST }, instance);
    await client.request('/projects');

    const headers = mock.history.get[0].headers ?? {};
    expect(headers['Authorization']).toBe(`Bearer ${JWT}`);
    expect(headers['Token']).toBeUndefined();
  });

  it('sends an opaque token as the Token header and no Authorization', async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(`${HOST}/projects`).reply(200, {});

    const client = new QaseApiClient({ token: OPAQUE, host: HOST }, instance);
    await client.request('/projects');

    const headers = mock.history.get[0].headers ?? {};
    expect(headers['Token']).toBe(OPAQUE);
    expect(headers['Authorization']).toBeUndefined();
  });

  it('attaches Authorization: Bearer to SDK calls when the token is a JWT', async () => {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onGet(/\/v1\/project/).reply(200, { status: true, result: { entities: [], total: 0 } });

    const client = new QaseApiClient({ token: JWT, host: HOST }, instance);
    await client.projects.getProjects(undefined, undefined, undefined);

    const headers = mock.history.get[0].headers ?? {};
    expect(headers['Authorization']).toBe(`Bearer ${JWT}`);
    expect(headers['Token']).toBeUndefined();
  });
});
