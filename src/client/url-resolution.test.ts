/**
 * Tests for how QaseApiClient.request() turns a caller-supplied path into a URL.
 *
 * The path is model-controlled — it arrives through the qase_api escape hatch,
 * which means it can carry text the model read from a case, a defect or a linked
 * issue. Every request out of this client carries the Qase credential in a
 * `Token` or `Authorization: Bearer` header, so a path that reaches another host
 * hands that credential to whoever runs it.
 *
 * The two obvious ways to build the URL fail on opposite inputs, which is why
 * both families are pinned here: string concatenation resolves
 * `https://api.qase.io` + `@evil.example/v1/x` to host `evil.example`, while
 * plain WHATWG resolution against the host accepts `//evil.example/x`,
 * `\\evil.example/x` and an absolute URL. The check that holds for both is the
 * resolved origin.
 */

import { describe, it, expect } from '@jest/globals';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { QaseApiClient } from './index.js';
import { ToolExecutionError } from '../utils/errors.js';

const HOST = 'https://api.qase.io';
const TOKEN = 'opaque-token-123';

function makeClient() {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  mock.onAny().reply(200, { status: true });
  return { client: new QaseApiClient({ token: TOKEN, host: HOST }, instance), mock };
}

describe('paths that name another host', () => {
  // Caught by the leading-slash rule: as relative references these would resolve
  // onto the Qase host as odd-looking path segments rather than reach another
  // host, but nothing legitimate sends them, so they are refused outright
  // instead of being silently rewritten.
  const relative = [
    ['userinfo prefix', '@evil.example/v1/project'],
    ['userinfo with password', 'user:pass@evil.example/v1/project'],
    ['bare segment', 'v1/project'],
  ] satisfies Array<[string, string]>;

  // Caught by the origin check: each of these really does resolve to another
  // host, and the leading slash does not stop the first two.
  const crossOrigin = [
    ['protocol-relative', '//evil.example/v1/project'],
    ['slash-backslash authority', '/\\\\evil.example/v1/project'],
    ['absolute https URL', 'https://evil.example/v1/project'],
    ['absolute http URL', 'http://evil.example/v1/project'],
    ['scheme-changing URL', 'file:///etc/passwd'],
  ] satisfies Array<[string, string]>;

  it.each([...relative, ...crossOrigin])(
    'refuses a %s and sends nothing',
    async (_label, path) => {
      const { client, mock } = makeClient();

      await expect(client.request(path)).rejects.toBeInstanceOf(ToolExecutionError);
      expect(mock.history.get).toHaveLength(0);
    },
  );

  it('names the origin it refused, so the caller can see why', async () => {
    const { client } = makeClient();

    await expect(client.request('//evil.example/v1/project')).rejects.toThrow(
      /https:\/\/evil\.example/,
    );
  });

  it('says what is wrong with a path that is not absolute', async () => {
    const { client } = makeClient();

    await expect(client.request('@evil.example/v1/project')).rejects.toThrow(/must start with/);
  });
});

describe('paths that stay on the configured host', () => {
  it('sends an ordinary endpoint path', async () => {
    const { client, mock } = makeClient();

    await client.request('/v1/project');

    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].url).toBe(`${HOST}/v1/project`);
  });

  it('keeps a query string intact, brackets and all', async () => {
    const { client, mock } = makeClient();

    await client.request('/v1/result/DEMO?filters[run]=1&limit=100');

    expect(mock.history.get[0].url).toBe(`${HOST}/v1/result/DEMO?filters[run]=1&limit=100`);
  });

  it('normalizes traversal without letting it escape the host', async () => {
    const { client, mock } = makeClient();

    await client.request('/v1/../../v1/project');

    expect(mock.history.get[0].url).toBe(`${HOST}/v1/project`);
  });

  it('still carries the credential on an allowed path', async () => {
    const { client, mock } = makeClient();

    await client.request('/v1/project');

    expect((mock.history.get[0].headers ?? {})['Token']).toBe(TOKEN);
  });
});

describe('a self-hosted API on its own origin', () => {
  const SELF_HOSTED = 'http://api.qase.lo:8080';

  function selfHosted() {
    const instance = axios.create();
    const mock = new MockAdapter(instance);
    mock.onAny().reply(200, { status: true });
    return { client: new QaseApiClient({ token: TOKEN, host: SELF_HOSTED }, instance), mock };
  }

  it('allows a path on that host, port included', async () => {
    const { client, mock } = selfHosted();

    await client.request('/v1/project');

    expect(mock.history.get[0].url).toBe(`${SELF_HOSTED}/v1/project`);
  });

  it('refuses a path that would reach the public host instead', async () => {
    const { client, mock } = selfHosted();

    await expect(client.request('//api.qase.io/v1/project')).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
    expect(mock.history.get).toHaveLength(0);
  });

  it('refuses the same host on a different port', async () => {
    const { client, mock } = selfHosted();

    await expect(client.request('//api.qase.lo:9999/v1/project')).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
    expect(mock.history.get).toHaveLength(0);
  });
});
