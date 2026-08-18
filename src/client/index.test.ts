/**
 * API Client Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setTestEnv, clearTestEnv } from '../utils/test-helpers.js';

jest.mock('../utils/auth-context.js', () => ({
  requestTokenStorage: { getStore: jest.fn(() => undefined) },
  getEffectiveToken: jest.fn(() => {
    const envToken = process.env.QASE_API_TOKEN;
    if (!envToken) {
      throw new Error(
        'QASE_API_TOKEN environment variable is required or a per-request Bearer token must be provided.',
      );
    }
    return envToken;
  }),
}));

async function resetClient() {
  jest.resetModules();
}

/** The host the client resolved, read off one of the generated SDK resources. */
function basePathOf(client: { cases: unknown }): string {
  return (client.cases as { basePath: string }).basePath;
}

describe('API Client', () => {
  beforeEach(() => {
    setTestEnv();
  });

  afterEach(async () => {
    clearTestEnv();
    await resetClient();
  });

  it('should throw error when QASE_API_TOKEN is missing', async () => {
    delete process.env.QASE_API_TOKEN;

    const { getApiClient } = await import('./index.js');
    expect(() => getApiClient()).toThrow('QASE_API_TOKEN environment variable is required');
  });

  it('should use default domain when QASE_API_DOMAIN is not set', async () => {
    delete process.env.QASE_API_DOMAIN;

    const { getApiClient } = await import('./index.js');
    const client = getApiClient();
    expect(client).toBeDefined();
  });

  it('should use custom domain when QASE_API_DOMAIN is set', async () => {
    process.env.QASE_API_DOMAIN = 'api.custom.qase.io';

    const { getApiClient } = await import('./index.js');
    const client = getApiClient();
    expect(client).toBeDefined();
  });

  it('should validate API token format', async () => {
    process.env.QASE_API_TOKEN = '';

    const { getApiClient } = await import('./index.js');
    expect(() => getApiClient()).toThrow('QASE_API_TOKEN environment variable is required');
  });

  it('should reject QASE_API_DOMAIN with protocol or path', async () => {
    process.env.QASE_API_DOMAIN = 'https://api.qase.io';

    const { getApiClient } = await import('./index.js');
    expect(() => getApiClient()).toThrow('QASE_API_DOMAIN should only contain the domain name');
  });

  it('should default to https when QASE_API_PROTOCOL is not set', async () => {
    delete process.env.QASE_API_PROTOCOL;
    process.env.QASE_API_DOMAIN = 'api.custom.qase.io';

    const { getApiClient } = await import('./index.js');
    expect(basePathOf(getApiClient())).toBe('https://api.custom.qase.io/v1');
  });

  it('should use http when QASE_API_PROTOCOL says so', async () => {
    process.env.QASE_API_PROTOCOL = 'http';
    process.env.QASE_API_DOMAIN = 'api.qase.lo';

    const { getApiClient } = await import('./index.js');
    expect(basePathOf(getApiClient())).toBe('http://api.qase.lo/v1');
  });

  it('should accept QASE_API_PROTOCOL written as a scheme with separator', async () => {
    process.env.QASE_API_PROTOCOL = 'HTTP://';
    process.env.QASE_API_DOMAIN = 'api.qase.lo';

    const { getApiClient } = await import('./index.js');
    expect(basePathOf(getApiClient())).toBe('http://api.qase.lo/v1');
  });

  it('should keep a port given in QASE_API_DOMAIN', async () => {
    process.env.QASE_API_PROTOCOL = 'http';
    process.env.QASE_API_DOMAIN = 'api.qase.lo:8080';

    const { getApiClient } = await import('./index.js');
    expect(basePathOf(getApiClient())).toBe('http://api.qase.lo:8080/v1');
  });

  it('should fall back to https on an unrecognised QASE_API_PROTOCOL', async () => {
    process.env.QASE_API_PROTOCOL = 'ftp';
    process.env.QASE_API_DOMAIN = 'api.qase.lo';

    const { getApiClient } = await import('./index.js');
    expect(basePathOf(getApiClient())).toBe('https://api.qase.lo/v1');
  });

  it('should use per-request token when requestTokenStorage has a token', async () => {
    const { requestTokenStorage } = await import('../utils/auth-context.js');
    (requestTokenStorage.getStore as jest.Mock).mockReturnValueOnce('per-request-bearer-token');

    const { getApiClient } = await import('./index.js');
    const client = getApiClient();

    expect(client).toBeDefined();
    expect(requestTokenStorage.getStore).toHaveBeenCalled();
  });

});
