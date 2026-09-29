import { describe, it, expect, beforeEach } from '@jest/globals';
import { PROTOCOL_VERSION_META_KEY, CLIENT_INFO_META_KEY } from '@modelcontextprotocol/server';
import {
  ClientLabeller,
  protocolLabels,
  recordProtocolRequest,
  CLIENT_LABEL_LIMIT,
} from './protocol-telemetry.js';
import { getMetrics, resetMetricsForTest } from '../cache/index.js';
import { serverStorage } from './server-context.js';
import type { Server } from '@modelcontextprotocol/server';

/** A modern request context: the per-request envelope names the revision and the client. */
function modernCtx(version: string, clientName?: unknown) {
  return {
    mcpReq: {
      envelope: {
        [PROTOCOL_VERSION_META_KEY]: version,
        ...(clientName === undefined ? {} : { [CLIENT_INFO_META_KEY]: { name: clientName } }),
      },
    },
  };
}

/** A 2025-era request carries no envelope at all — measured, not assumed. */
const legacyCtx = { mcpReq: {} };

describe('ClientLabeller', () => {
  it('lowercases and strips everything outside [a-z0-9._-]', () => {
    expect(new ClientLabeller().label('Claude Desktop')).toBe('claude-desktop');
  });

  it('truncates a long name rather than letting it into a series key', () => {
    expect(new ClientLabeller().label('x'.repeat(200))).toHaveLength(32);
  });

  it('reads a name that is not a string as unknown', () => {
    const labeller = new ClientLabeller();
    expect(labeller.label(undefined)).toBe('unknown');
    expect(labeller.label(42)).toBe('unknown');
    expect(labeller.label('!!!')).toBe('unknown');
  });

  it('caps how many distinct names it will ever emit', () => {
    const labeller = new ClientLabeller(3);
    expect(labeller.label('a')).toBe('a');
    expect(labeller.label('b')).toBe('b');
    expect(labeller.label('c')).toBe('c');
    // The fourth distinct name is bucketed — a client cannot grow the series map.
    expect(labeller.label('d')).toBe('other');
    // …but names already seen keep their own series.
    expect(labeller.label('b')).toBe('b');
  });

  it('defaults to a limit that is documented, not implicit', () => {
    expect(CLIENT_LABEL_LIMIT).toBe(20);
  });
});

describe('protocolLabels', () => {
  it('reports the revision the modern envelope names', () => {
    expect(protocolLabels(modernCtx('2026-07-28', 'cursor'), new ClientLabeller())).toEqual({
      protocol: '2026-07-28',
      client: 'cursor',
    });
  });

  it('passes an unknown future revision through rather than flattening it', () => {
    expect(protocolLabels(modernCtx('2027-01-01', 'cursor'), new ClientLabeller()).protocol).toBe(
      '2027-01-01',
    );
  });

  it('reports a request with no envelope as legacy', () => {
    expect(protocolLabels(legacyCtx, new ClientLabeller()).protocol).toBe('legacy');
  });

  it('names a legacy client from the identity its initialize established', () => {
    // On a stateful legacy connection (stdio, SSE) there is no envelope, but the
    // Server instance pinned to the connection knows who opened it.
    const server = { getClientVersion: () => ({ name: 'Claude Desktop', version: '1.2.3' }) };

    const labels = serverStorage.run(server as unknown as Server, () =>
      protocolLabels(legacyCtx, new ClientLabeller()),
    );

    expect(labels).toEqual({ protocol: 'legacy', client: 'claude-desktop' });
  });

  it('reports the client as unknown when the envelope names none', () => {
    expect(protocolLabels(modernCtx('2026-07-28'), new ClientLabeller()).client).toBe('unknown');
  });
});

describe('recordProtocolRequest', () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  it('counts a request under the revision and client it came from', () => {
    recordProtocolRequest(modernCtx('2026-07-28', 'Claude Code'));
    recordProtocolRequest(modernCtx('2026-07-28', 'Claude Code'));
    recordProtocolRequest(legacyCtx);

    expect(
      getMetrics().getCounter('qase_mcp_requests_total', {
        protocol: '2026-07-28',
        client: 'claude-code',
      }),
    ).toBe(2);
    expect(
      getMetrics().getCounter('qase_mcp_requests_total', { protocol: 'legacy', client: 'unknown' }),
    ).toBe(1);
  });

  it('renders with HELP and TYPE, so the series is a registered metric', () => {
    recordProtocolRequest(modernCtx('2026-07-28', 'cursor'));
    const text = getMetrics().renderPrometheus();

    expect(text).toContain('# HELP qase_mcp_requests_total');
    expect(text).toContain('# TYPE qase_mcp_requests_total counter');
    expect(text).toContain('protocol="2026-07-28"');
    expect(text).toContain('client="cursor"');
  });
});
