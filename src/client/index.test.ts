/**
 * API Client Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setTestEnv, clearTestEnv } from '../utils/test-helpers.js';

// Avoid pulling in Express (streamableHttp) in this test file
jest.mock('../transports/streamableHttp.js', () => ({
  requestTokenStorage: { getStore: jest.fn(() => undefined) },
}));

async function resetClient() {
  jest.resetModules();
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

  it('should use per-request token when requestTokenStorage has a token', async () => {
    const { requestTokenStorage } = await import('../transports/streamableHttp.js');
    (requestTokenStorage.getStore as jest.Mock).mockReturnValueOnce('per-request-bearer-token');

    const { getApiClient } = await import('./index.js');
    const client = getApiClient();

    expect(client).toBeDefined();
    expect(requestTokenStorage.getStore).toHaveBeenCalled();
  });

});
