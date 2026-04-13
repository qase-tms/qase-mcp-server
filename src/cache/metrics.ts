import { formatLabels } from './prom-format.js';

type Labels = Record<string, string>;

interface MetricDef {
  help: string;
  type: 'counter' | 'gauge';
}

/**
 * Minimal, dependency-free metrics registry.
 *
 * Supports Prometheus text-format rendering. Designed for a small fixed set
 * of metrics (cache hits/misses/errors, CB state, entry gauges); not a
 * general-purpose replacement for prom-client.
 */
export class Metrics {
  private readonly defs = new Map<string, MetricDef>();
  private readonly counters = new Map<string, Map<string, number>>();
  private readonly gauges = new Map<string, Map<string, number>>();

  registerCounter(name: string, help: string): void {
    this.defs.set(name, { help, type: 'counter' });
    if (!this.counters.has(name)) this.counters.set(name, new Map());
  }

  registerGauge(name: string, help: string): void {
    this.defs.set(name, { help, type: 'gauge' });
    if (!this.gauges.has(name)) this.gauges.set(name, new Map());
  }

  incCounter(name: string, labels: Labels, by = 1): void {
    const series =
      this.counters.get(name) ??
      (this.counters.set(name, new Map()).get(name) as Map<string, number>);
    const key = this.seriesKey(labels);
    series.set(key, (series.get(key) ?? 0) + by);
  }

  getCounter(name: string, labels: Labels): number {
    return this.counters.get(name)?.get(this.seriesKey(labels)) ?? 0;
  }

  setGauge(name: string, labels: Labels, value: number): void {
    const series =
      this.gauges.get(name) ?? (this.gauges.set(name, new Map()).get(name) as Map<string, number>);
    series.set(this.seriesKey(labels), value);
  }

  getGauge(name: string, labels: Labels): number {
    return this.gauges.get(name)?.get(this.seriesKey(labels)) ?? 0;
  }

  /**
   * Render all registered metrics as Prometheus exposition text.
   * Series from unregistered metric names are rendered too (with no HELP/TYPE
   * lines) — this keeps `incCounter` safe to call even before `registerCounter`.
   */
  renderPrometheus(): string {
    const lines: string[] = [];

    const emit = (name: string, series: Map<string, number>, type: 'counter' | 'gauge'): void => {
      const def = this.defs.get(name);
      if (def) {
        lines.push(`# HELP ${name} ${def.help}`);
        lines.push(`# TYPE ${name} ${type}`);
      }
      for (const [labelKey, val] of series.entries()) {
        const labels = labelKey ? JSON.parse(labelKey) : {};
        lines.push(`${name}${formatLabels(labels)} ${val}`);
      }
    };

    for (const [name, series] of this.counters.entries()) emit(name, series, 'counter');
    for (const [name, series] of this.gauges.entries()) emit(name, series, 'gauge');

    return lines.join('\n') + '\n';
  }

  private seriesKey(labels: Labels): string {
    const keys = Object.keys(labels);
    if (keys.length === 0) return '';
    const sorted: Labels = {};
    for (const k of keys.sort()) sorted[k] = labels[k];
    return JSON.stringify(sorted);
  }
}

/**
 * Process-wide singleton accessor. Reset only from tests.
 */
let instance: Metrics | null = null;

export function getMetrics(): Metrics {
  if (!instance) {
    instance = new Metrics();
    registerDefaults(instance);
  }
  return instance;
}

/** @internal — used by tests to reset the registry. */
export function resetMetricsForTest(): void {
  instance = null;
}

function registerDefaults(m: Metrics): void {
  m.registerCounter('qase_mcp_cache_hits_total', 'Cache hits by tier (l1 or l2)');
  m.registerCounter('qase_mcp_cache_misses_total', 'Cache misses by tier');
  m.registerCounter('qase_mcp_cache_errors_total', 'Cache errors by tier');
  m.registerGauge('qase_mcp_cache_entries', 'Current cache entries by tier');
  m.registerGauge(
    'qase_mcp_circuit_breaker_state',
    'Circuit breaker state (0=closed, 1=half_open, 2=open) by name',
  );
}
