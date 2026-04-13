/**
 * Recursively strip `null`, `undefined`, empty arrays, and empty objects
 * from API responses before sending them to the LLM.
 *
 * Zero, false, and empty strings are preserved — they carry signal (e.g.
 * `"description": ""` is different from missing description when the user
 * asked about it).
 *
 * Returns `undefined` only when the input itself is `null` or `undefined`.
 * For objects that collapse to zero kept fields, returns `{}` (an empty
 * object) — callers should test with `Object.keys(result).length === 0` if
 * they want to detect collapse, not `result === undefined`. Arrays that
 * become empty are returned as `[]`.
 */
export function compactResponse(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    const compactedItems: unknown[] = [];
    for (const item of value) {
      const c = compactResponse(item);
      if (c !== undefined) compactedItems.push(c);
    }
    return compactedItems;
  }

  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let kept = 0;
  for (const key of Object.keys(record)) {
    const c = compactResponse(record[key]);
    if (c === undefined) continue;
    if (Array.isArray(c) && c.length === 0) continue;
    if (isPlainObject(c) && Object.keys(c).length === 0) continue;
    out[key] = c;
    kept += 1;
  }
  return kept === 0 ? {} : out;
}

/**
 * Keep only the listed top-level fields on an object, or apply the same
 * projection to each element of an array.
 *
 * Special case: `['*']` returns the input unchanged.
 */
export function projectFields<T>(value: T, fields: string[]): T {
  if (fields.length === 1 && fields[0] === '*') return value;
  if (Array.isArray(value)) {
    return value.map((item) => projectSingle(item, fields)) as unknown as T;
  }
  return projectSingle(value, fields) as T;
}

function projectSingle(obj: unknown, fields: string[]): unknown {
  if (!isPlainObject(obj)) return obj;
  const src = obj as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in src) out[f] = src[f];
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
