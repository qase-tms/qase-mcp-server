import { describe, it, expect } from '@jest/globals';
import {
  ALLOWED_INTEGRATIONS,
  parseIntegrationMarker,
  normalizeIntegrationMarker,
} from './integration-marker.js';

describe('parseIntegrationMarker', () => {
  it('accepts <name>/<version>', () => {
    expect(parseIntegrationMarker('quality-supervisor/1.2.3')).toEqual({
      name: 'quality-supervisor',
      version: '1.2.3',
    });
  });

  it('accepts a bare name with no version', () => {
    expect(parseIntegrationMarker('quality-supervisor')).toEqual({ name: 'quality-supervisor' });
  });

  it('lowercases the name', () => {
    expect(parseIntegrationMarker('Quality-Supervisor/1.0.0')).toEqual({
      name: 'quality-supervisor',
      version: '1.0.0',
    });
  });

  it('trims surrounding whitespace on both parts', () => {
    expect(parseIntegrationMarker('  quality-supervisor / 1.0.0  ')).toEqual({
      name: 'quality-supervisor',
      version: '1.0.0',
    });
  });

  it('keeps versions made of word chars, dots, dashes and pluses', () => {
    for (const version of ['1', '1.0.0', '2.0.0-beta.1', '1.0.0+build_7', 'v1_2']) {
      expect(parseIntegrationMarker(`quality-supervisor/${version}`)).toEqual({
        name: 'quality-supervisor',
        version,
      });
    }
  });

  it('drops a version that fails the pattern but keeps the name', () => {
    for (const version of ['1.0 0', 'v1;drop', '1.0/2.0', '../etc', 'ünïcode']) {
      expect(parseIntegrationMarker(`quality-supervisor/${version}`)).toEqual({
        name: 'quality-supervisor',
      });
    }
  });

  it('drops a version longer than 32 chars', () => {
    expect(parseIntegrationMarker(`quality-supervisor/${'1'.repeat(33)}`)).toEqual({
      name: 'quality-supervisor',
    });
  });

  it('drops an empty version after the separator', () => {
    expect(parseIntegrationMarker('quality-supervisor/')).toEqual({ name: 'quality-supervisor' });
  });

  it('ignores a name that is not allowlisted', () => {
    expect(parseIntegrationMarker('some-random-plugin/1.0.0')).toBeUndefined();
    expect(parseIntegrationMarker('quality-supervisor-evil/1.0.0')).toBeUndefined();
  });

  it('ignores empty, whitespace-only and missing input', () => {
    expect(parseIntegrationMarker('')).toBeUndefined();
    expect(parseIntegrationMarker('   ')).toBeUndefined();
    expect(parseIntegrationMarker(undefined)).toBeUndefined();
    expect(parseIntegrationMarker(null)).toBeUndefined();
  });

  it('ignores an oversized name rather than truncating it into a match', () => {
    // Truncation caps the field at 100 chars; it must not turn a longer string
    // into an allowlisted name by cutting off the tail.
    const padded = `quality-supervisor${'x'.repeat(200)}`;
    expect(parseIntegrationMarker(padded)).toBeUndefined();
  });

  it('starts the allowlist with quality-supervisor', () => {
    expect(ALLOWED_INTEGRATIONS).toContain('quality-supervisor');
  });
});

describe('normalizeIntegrationMarker', () => {
  it('re-serialises to the canonical form', () => {
    expect(normalizeIntegrationMarker(' Quality-Supervisor/1.2.3 ')).toBe(
      'quality-supervisor/1.2.3',
    );
    expect(normalizeIntegrationMarker('quality-supervisor/bad version')).toBe(
      'quality-supervisor',
    );
  });

  it('returns undefined for anything unusable', () => {
    expect(normalizeIntegrationMarker('nope/1.0.0')).toBeUndefined();
    expect(normalizeIntegrationMarker(undefined)).toBeUndefined();
  });
});
