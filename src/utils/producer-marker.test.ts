import { describe, it, expect } from '@jest/globals';
import { parseProducerMarker, MAX_SEQ } from './producer-marker.js';

describe('parseProducerMarker', () => {
  it('accepts <producer>/<seq>/<entrypoint>', () => {
    expect(parseProducerMarker('analyzing-test-coverage/3/skill')).toEqual({
      producer: 'analyzing-test-coverage',
      seq: 3,
      entrypoint: 'skill',
    });
  });

  it('accepts every entrypoint', () => {
    expect(parseProducerMarker('quality-report/1/command')?.entrypoint).toBe('command');
    expect(parseProducerMarker('quality-supervisor/1/agent')?.entrypoint).toBe('agent');
  });

  it('lowercases the producer', () => {
    expect(parseProducerMarker('Analyzing-Test-Coverage/1/skill')?.producer).toBe(
      'analyzing-test-coverage',
    );
  });

  it('caps seq rather than rejecting a long run', () => {
    expect(parseProducerMarker(`a-skill/99999/skill`)?.seq).toBe(MAX_SEQ);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['no entrypoint', 'a-skill/1'],
    ['unknown entrypoint', 'a-skill/1/hacking'],
    ['non-numeric seq', 'a-skill/one/skill'],
    ['zero seq', 'a-skill/0/skill'],
    ['negative seq', 'a-skill/-1/skill'],
    ['producer starting with a dash', '-skill/1/skill'],
    ['producer with underscores', 'a_skill/1/skill'],
    ['producer with a space', 'a skill/1/skill'],
    ['producer too long', `${'a'.repeat(49)}/1/skill`],
    ['single character producer', 'a/1/skill'],
  ])('rejects %s', (_label, input) => {
    expect(parseProducerMarker(input as string | undefined | null)).toBeUndefined();
  });

  it('never throws on hostile input', () => {
    expect(() => parseProducerMarker('/'.repeat(10_000))).not.toThrow();
    expect(parseProducerMarker('/'.repeat(10_000))).toBeUndefined();
  });
});
