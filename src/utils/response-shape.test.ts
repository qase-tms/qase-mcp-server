import { compactResponse, projectFields } from './response-shape.js';

describe('compactResponse', () => {
  it('returns primitives unchanged', () => {
    expect(compactResponse(0)).toBe(0);
    expect(compactResponse('')).toBe('');
    expect(compactResponse(false)).toBe(false);
  });

  it('returns undefined for null and undefined at top level', () => {
    expect(compactResponse(null)).toBeUndefined();
    expect(compactResponse(undefined)).toBeUndefined();
  });

  it('strips null and undefined fields from objects', () => {
    expect(compactResponse({ a: 1, b: null, c: undefined, d: 'x' })).toEqual({ a: 1, d: 'x' });
  });

  it('strips empty arrays and empty objects', () => {
    expect(compactResponse({ a: 1, b: [], c: {}, d: 'x' })).toEqual({ a: 1, d: 'x' });
  });

  it('keeps zero, false, and empty string — they carry signal', () => {
    expect(compactResponse({ a: 0, b: false, c: '' })).toEqual({ a: 0, b: false, c: '' });
  });

  it('recurses into nested objects and arrays', () => {
    const input = {
      user: { name: 'alice', age: null, tags: [] },
      items: [{ id: 1, note: null }, { id: 2, note: 'ok' }],
    };
    expect(compactResponse(input)).toEqual({
      user: { name: 'alice' },
      items: [{ id: 1 }, { id: 2, note: 'ok' }],
    });
  });

  it('drops objects that become empty after compaction', () => {
    expect(compactResponse({ meta: { a: null, b: undefined } })).toEqual({});
  });
});

describe('projectFields', () => {
  it('keeps only the requested top-level fields on a single object', () => {
    const input = { a: 1, b: 2, c: 3 };
    expect(projectFields(input, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('applies projection to each element of an array', () => {
    const input = [
      { id: 1, title: 'x', desc: 'long' },
      { id: 2, title: 'y', desc: 'also long' },
    ];
    expect(projectFields(input, ['id', 'title'])).toEqual([
      { id: 1, title: 'x' },
      { id: 2, title: 'y' },
    ]);
  });

  it('returns the value unchanged when fields is ["*"]', () => {
    const input = { a: 1, b: 2 };
    expect(projectFields(input, ['*'])).toEqual(input);
  });

  it('omits missing fields silently instead of producing undefined entries', () => {
    const input = { a: 1 };
    expect(projectFields(input, ['a', 'missing'])).toEqual({ a: 1 });
  });
});
