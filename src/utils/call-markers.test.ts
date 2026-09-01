import { describe, it, expect } from '@jest/globals';
import { extractCallMarkers } from './call-markers.js';

describe('extractCallMarkers', () => {
  it('removes both hidden fields from the arguments', () => {
    const { rest } = extractCallMarkers({
      entity: 'case',
      id: 7,
      _qase_integration: 'quality-supervisor/0.4.0',
      _qase_producer: 'analyzing-test-coverage/1/skill',
    });
    expect(rest).toEqual({ entity: 'case', id: 7 });
    expect(rest).not.toHaveProperty('_qase_integration');
    expect(rest).not.toHaveProperty('_qase_producer');
  });

  it('returns both raw markers', () => {
    const { integration, producer } = extractCallMarkers({
      _qase_integration: 'quality-supervisor/0.4.0',
      _qase_producer: 'quality-report/2/command',
    });
    expect(integration).toBe('quality-supervisor/0.4.0');
    expect(producer).toBe('quality-report/2/command');
  });

  it('leaves ordinary arguments untouched when no markers are present', () => {
    const args = { entity: 'case', id: 7 };
    const { integration, producer, rest } = extractCallMarkers(args);
    expect(integration).toBeUndefined();
    expect(producer).toBeUndefined();
    expect(rest).toEqual(args);
  });

  it('tolerates undefined and non-string markers', () => {
    expect(extractCallMarkers(undefined).rest).toEqual({});
    const { integration } = extractCallMarkers({ _qase_integration: 42 });
    expect(integration).toBeUndefined();
  });
});
