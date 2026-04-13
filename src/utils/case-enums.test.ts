import {
  normalizeCaseEnums,
  __setCaseEnumCacheForTest,
  resetCaseEnumCacheForTest,
} from './case-enums.js';
import { resetCacheForTest } from '../cache/index.js';

const defaultFieldSnapshot = {
  priority: { high: 1, medium: 2, low: 3 },
  type: { functional: 8, smoke: 2, regression: 3 },
  behavior: { positive: 2, negative: 3 },
};

describe('normalizeCaseEnums', () => {
  beforeAll(() => {
    process.env.QASE_API_TOKEN = 'test-token-for-case-enums';
  });

  beforeEach(async () => {
    await resetCacheForTest();
    await resetCaseEnumCacheForTest();
    await __setCaseEnumCacheForTest(defaultFieldSnapshot);
  });

  afterAll(async () => {
    await resetCacheForTest();
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
    const payload = { priority: 2, type: '3', behavior: 5 };
    const normalized = await normalizeCaseEnums(payload);
    expect(normalized).toEqual({ priority: 2, type: 3, behavior: 5 });
  });

  it('falls back when slug is unknown', async () => {
    const payload = { priority: 'super-high', behavior: 'dangerous' };
    const normalized = await normalizeCaseEnums(payload);
    expect(normalized).toEqual(payload);
  });

  it('isolates different tenants — tokenA cannot see tokenB data', async () => {
    process.env.QASE_API_TOKEN = 'token-a';
    await resetCaseEnumCacheForTest();
    await __setCaseEnumCacheForTest({ priority: { high: 99 } });

    process.env.QASE_API_TOKEN = 'token-b';
    await resetCaseEnumCacheForTest();
    await __setCaseEnumCacheForTest({ priority: { high: 42 } });

    const resultB = await normalizeCaseEnums({ priority: 'high' });
    expect(resultB.priority).toBe(42);

    process.env.QASE_API_TOKEN = 'token-a';
    const resultA = await normalizeCaseEnums({ priority: 'high' });
    expect(resultA.priority).toBe(99);

    process.env.QASE_API_TOKEN = 'test-token-for-case-enums';
  });
});
