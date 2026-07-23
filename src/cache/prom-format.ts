/**
 * Render a label object into the Prometheus `{k="v",…}` format.
 * Label values are escaped per the Prometheus text format spec:
 *   `\` → `\\`, `"` → `\"`, `\n` → `\n`.
 */
export function formatLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  const parts = keys.sort().map((k) => `${k}="${escapeLabelValue(labels[k])}"`);
  return `{${parts.join(',')}}`;
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
