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
  is_flaky: { no: 0, yes: 1, '0': 0, '1': 1 },
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
    delete process.env.QASE_API_TOKEN;
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

  // is_flaky is a dictionary field (0=No, 1=Yes), not the boolean its name
  // suggests. Sending a JSON boolean fails with "The selected field value is
  // invalid. Allowed values: 0, 1." — an error that names no field, so it is
  // expensive to place inside a multi-field payload. Every spelling a caller
  // might reach for has to resolve here instead.
  it.each([
    ['yes', 1],
    ['no', 0],
    ['Yes', 1],
    ['1', 1],
    ['0', 0],
    [true, 1],
    [false, 0],
    [1, 1],
    [0, 0],
  ])('maps is_flaky %p to %p', async (input, expected) => {
    const normalized = await normalizeCaseEnums({ is_flaky: input });
    expect(normalized.is_flaky).toBe(expected);
  });

  it('leaves is_flaky absent when it was not given', async () => {
    const normalized = await normalizeCaseEnums({ title: 'Case' });
    expect(normalized).not.toHaveProperty('is_flaky');
  });

  // A boolean priority is a genuine caller mistake rather than the spelling the
  // field name invites, so it is left for the API to reject — mapping it onto
  // High silently would be worse.
  it('leaves a boolean on the other enum fields untouched', async () => {
    const normalized = await normalizeCaseEnums({ priority: true });
    expect(normalized.priority).toBe(true);
  });

  it('isolates different tenants — tokenA cannot see tokenB data', async () => {
    const original = process.env.QASE_API_TOKEN;
    try {
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
    } finally {
      process.env.QASE_API_TOKEN = original;
    }
  });
});
