/**
 * Rich Response Utilities
 *
 * Helpers for building multi-block MCP tool responses with audience annotations.
 * Tools that return RichToolResult bypass the default JSON.stringify wrapping
 * and deliver content blocks directly to the client.
 *
 * - summaryBlock: human-readable markdown for the user (audience: ['user'])
 * - dataBlock: structured JSON for the assistant (audience: ['assistant'])
 */

/** Symbol marker to distinguish rich results from plain handler returns */
const RICH_MARKER = Symbol.for('qase.rich_result');

/** A single content block in a rich tool result */
export interface ContentBlock {
  type: 'text';
  text: string;
  annotations?: {
    audience?: Array<'user' | 'assistant'>;
    priority?: number;
  };
}

/** Pre-formatted tool result with multiple content blocks */
export interface RichToolResult {
  [RICH_MARKER]: true;
  content: ContentBlock[];
  /** Machine-readable data for programmatic processing by MCP clients */
  structuredContent?: Record<string, unknown>;
}

/**
 * Type guard: returns true if the value is a RichToolResult.
 */
export function isRichResult(value: unknown): value is RichToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[RICH_MARKER] === true
  );
}

/**
 * Build a rich tool result from content blocks.
 * @param content - Content blocks for display
 * @param structuredContent - Machine-readable data for programmatic client processing
 */
export function richResult(
  content: ContentBlock[],
  structuredContent?: Record<string, unknown>,
): RichToolResult {
  return {
    [RICH_MARKER]: true,
    content,
    ...(structuredContent && { structuredContent }),
  };
}

/**
 * Create a user-facing summary block (markdown).
 * Shown to the user with highest priority.
 */
export function summaryBlock(text: string): ContentBlock {
  return {
    type: 'text',
    text,
    annotations: { audience: ['user'], priority: 1 },
  };
}

/**
 * Create an assistant-facing data block (JSON).
 * Consumed by the LLM for further reasoning.
 */
export function dataBlock(data: unknown): ContentBlock {
  return {
    type: 'text',
    text: JSON.stringify(data),
    annotations: { audience: ['assistant'], priority: 0 },
  };
}

/**
 * Build a markdown table with properly padded columns.
 *
 * @param headers - Column header labels
 * @param rows - Array of row data (same length as headers)
 * @param align - Per-column alignment: 'l' (left, default), 'r' (right), 'c' (center)
 */
export function markdownTable(headers: string[], rows: string[][], align?: string[]): string {
  // Compute max width per column
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));

  const pad = (s: string, w: number, a: string) => {
    const gap = w - s.length;
    if (gap <= 0) return s;
    if (a === 'r') return ' '.repeat(gap) + s;
    if (a === 'c') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
    return s + ' '.repeat(gap);
  };

  const aligns = align ?? headers.map(() => 'l');

  const headerRow = '| ' + headers.map((h, i) => pad(h, widths[i], aligns[i])).join(' | ') + ' |';
  const sepRow =
    '| ' +
    widths
      .map((w, i) => {
        const a = aligns[i];
        const bar = '-'.repeat(w);
        if (a === 'r') return bar.slice(0, -1) + ':';
        if (a === 'c') return ':' + bar.slice(1, -1) + ':';
        return bar;
      })
      .join(' | ') +
    ' |';
  const dataRows = rows.map(
    (r) => '| ' + r.map((c, i) => pad(c ?? '', widths[i], aligns[i])).join(' | ') + ' |',
  );

  return [headerRow, sepRow, ...dataRows].join('\n');
}
