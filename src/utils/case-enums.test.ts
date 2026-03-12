import { normalizeCaseEnums, __setCaseEnumCacheForTest, resetCaseEnumCacheForTest } from './case-enums.js';

const defaultFieldSnapshot = {
  priority: new Map([
    ['high', 1],
    ['medium', 2],
    ['low', 3],
  ]),
  type: new Map([
    ['functional', 8],
    ['smoke', 2],
    ['regression', 3],
  ]),
  behavior: new Map([
    ['positive', 2],
    ['negative', 3],
  ]),
};

describe('normalizeCaseEnums', () => {
  beforeEach(() => {
    resetCaseEnumCacheForTest();
    __setCaseEnumCacheForTest(defaultFieldSnapshot);
  });

  it('maps slug and title values to numeric IDs', async () => {
    const payload = {
      priority: 'High',
      type: 'smoke',
      behavior: 'positive',
      severity: 'critical',
    };

    const normalized = await normalizeCaseEnums(payload);

    expect(normalized).toEqual({
      priority: 1,
      type: 2,
      behavior: 2,
      severity: 'critical',
    });
  });

  it('keeps numeric values when they are already integers', async () => {
    const payload = {
      priority: 2,
      type: '3',
      behavior: 5,
    };

    const normalized = await normalizeCaseEnums(payload);

    expect(normalized).toEqual({
      priority: 2,
      type: 3,
      behavior: 5,
    });
  });

  it('falls back when slug is unknown', async () => {
    const payload = {
      priority: 'super-high',
      behavior: 'dangerous',
    };

    const normalized = await normalizeCaseEnums(payload);

    expect(normalized).toEqual(payload);
  });

  it('clears cache on fetch error and retries on next call', async () => {
    resetCaseEnumCacheForTest();

    // Simulate a failed fetch by setting cache to a rejected promise
    // We need to access the internal cache, so we use the test helper
    // to set it to a rejected promise
    const rejectedPromise = Promise.reject(new Error('network error'));
    rejectedPromise.catch(() => {}); // prevent unhandled rejection
    __setCaseEnumCacheForTest(rejectedPromise as any);

    await expect(normalizeCaseEnums({ priority: 'high' })).rejects.toThrow('network error');

    // After failure, set valid cache — next call should succeed
    __setCaseEnumCacheForTest(defaultFieldSnapshot);
    const result = await normalizeCaseEnums({ priority: 'High' });
    expect(result.priority).toBe(1);
  });
});
