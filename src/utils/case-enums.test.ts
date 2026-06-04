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
  automation: new Map([
    ['is-not-automated', 0],
    ['manual', 0],
    ['0', 0],
    ['to-be-automated', 1],
    ['to be automated', 1],
    ['1', 1],
    ['automated', 2],
    ['2', 2],
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

  it('maps automation slug, title, and numeric values to numeric IDs', async () => {
    expect(await normalizeCaseEnums({ automation: 'Automated' })).toEqual({ automation: 2 });
    expect(await normalizeCaseEnums({ automation: 'automated' })).toEqual({ automation: 2 });
    expect(await normalizeCaseEnums({ automation: 'Manual' })).toEqual({ automation: 0 });
    expect(await normalizeCaseEnums({ automation: 'is-not-automated' })).toEqual({ automation: 0 });
    expect(await normalizeCaseEnums({ automation: '2' })).toEqual({ automation: 2 });
    expect(await normalizeCaseEnums({ automation: 1 })).toEqual({ automation: 1 });
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
