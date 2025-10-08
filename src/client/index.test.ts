/**
 * API Client Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { setTestEnv, clearTestEnv } from '../utils/test-helpers.js';

// We need to dynamically import to reset the singleton between tests
async function resetClient() {
  // Clear the module cache to reset singleton
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
});
