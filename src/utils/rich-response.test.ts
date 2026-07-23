/**
 * Rich Response Utilities Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  isRichResult,
  richResult,
  summaryBlock,
  dataBlock,
} from './rich-response.js';

describe('Rich Response Utilities', () => {
  describe('isRichResult', () => {
    it('returns true for objects created by richResult()', () => {
      const result = richResult([summaryBlock('hello')]);
      expect(isRichResult(result)).toBe(true);
    });

    it('returns false for plain objects', () => {
      expect(isRichResult({ content: [{ type: 'text', text: 'hi' }] })).toBe(false);
    });

    it('returns false for null', () => {
      expect(isRichResult(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isRichResult(undefined)).toBe(false);
    });

    it('returns false for strings', () => {
      expect(isRichResult('text')).toBe(false);
    });

    it('returns false for numbers', () => {
      expect(isRichResult(42)).toBe(false);
    });

    it('returns false for arrays', () => {
      expect(isRichResult([1, 2, 3])).toBe(false);
    });
  });

  describe('richResult', () => {
    it('creates a result with the content blocks', () => {
      const blocks = [summaryBlock('summary'), dataBlock({ id: 1 })];
      const result = richResult(blocks);

      expect(result.content).toBe(blocks);
      expect(result.content).toHaveLength(2);
    });

    it('is identifiable via isRichResult', () => {
      const result = richResult([]);
      expect(isRichResult(result)).toBe(true);
    });
  });

  describe('summaryBlock', () => {
    it('creates a text block with user audience', () => {
      const block = summaryBlock('## Test Summary');

      expect(block.type).toBe('text');
      expect(block.text).toBe('## Test Summary');
      expect(block.annotations?.audience).toEqual(['user']);
    });

    it('sets priority to 1 (highest)', () => {
      const block = summaryBlock('summary');
      expect(block.annotations?.priority).toBe(1);
    });
  });

  describe('dataBlock', () => {
    it('creates a text block with assistant audience', () => {
      const block = dataBlock({ key: 'value' });

      expect(block.type).toBe('text');
      expect(block.annotations?.audience).toEqual(['assistant']);
    });

    it('sets priority to 0 (lowest)', () => {
      const block = dataBlock({});
      expect(block.annotations?.priority).toBe(0);
    });

    it('serializes objects as JSON', () => {
      const data = { id: 1, name: 'test', nested: { a: true } };
      const block = dataBlock(data);

      expect(JSON.parse(block.text)).toEqual(data);
    });

    it('serializes arrays as JSON', () => {
      const data = [1, 2, 3];
      const block = dataBlock(data);

      expect(JSON.parse(block.text)).toEqual(data);
    });

    it('serializes primitives as JSON', () => {
      expect(JSON.parse(dataBlock(42).text)).toBe(42);
      expect(JSON.parse(dataBlock('hello').text)).toBe('hello');
      expect(JSON.parse(dataBlock(true).text)).toBe(true);
      expect(JSON.parse(dataBlock(null).text)).toBe(null);
    });
  });

  describe('integration: richResult with mixed blocks', () => {
    it('combines summary and data blocks correctly', () => {
      const result = richResult([
        summaryBlock('## CI Report\n- 10 passed'),
        dataBlock({ run_id: 123, passed: 10, failed: 0 }),
      ]);

      expect(isRichResult(result)).toBe(true);
      expect(result.content).toHaveLength(2);

      // First block: user summary
      expect(result.content[0].annotations?.audience).toEqual(['user']);
      expect(result.content[0].text).toContain('CI Report');

      // Second block: assistant data
      expect(result.content[1].annotations?.audience).toEqual(['assistant']);
      expect(JSON.parse(result.content[1].text)).toEqual({
        run_id: 123,
        passed: 10,
        failed: 0,
      });
    });
  });
});
