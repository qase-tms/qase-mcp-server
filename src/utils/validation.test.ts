/**
 * Validation Utilities Tests
 */

import { describe, it, expect } from '@jest/globals';
import { PaginationSchema, ProjectCodeSchema, IdSchema, HashSchema } from './validation.js';

describe('Validation Schemas', () => {
  describe('PaginationSchema', () => {
    it('should accept valid pagination parameters', () => {
      const valid = { limit: 50, offset: 100 };
      expect(() => PaginationSchema.parse(valid)).not.toThrow();
    });

    it('should accept optional parameters', () => {
      const valid = {};
      expect(() => PaginationSchema.parse(valid)).not.toThrow();
    });

    it('should accept only limit', () => {
      const valid = { limit: 10 };
      expect(() => PaginationSchema.parse(valid)).not.toThrow();
    });

    it('should accept only offset', () => {
      const valid = { offset: 20 };
      expect(() => PaginationSchema.parse(valid)).not.toThrow();
    });

    it('should reject negative offset', () => {
      const invalid = { offset: -1 };
      expect(() => PaginationSchema.parse(invalid)).toThrow();
    });

    it('should reject limit over 100', () => {
      const invalid = { limit: 101 };
      expect(() => PaginationSchema.parse(invalid)).toThrow();
    });

    it('should reject zero limit', () => {
      const invalid = { limit: 0 };
      expect(() => PaginationSchema.parse(invalid)).toThrow();
    });

    it('should reject non-integer limit', () => {
      const invalid = { limit: 10.5 };
      expect(() => PaginationSchema.parse(invalid)).toThrow();
    });
  });

  describe('ProjectCodeSchema', () => {
    it('should accept valid project codes', () => {
      expect(() => ProjectCodeSchema.parse('DEMO')).not.toThrow();
      expect(() => ProjectCodeSchema.parse('TEST123')).not.toThrow();
      expect(() => ProjectCodeSchema.parse('MY_PROJECT')).not.toThrow();
      expect(() => ProjectCodeSchema.parse('AB')).not.toThrow();
    });

    it('should reject lowercase codes', () => {
      expect(() => ProjectCodeSchema.parse('demo')).toThrow();
      expect(() => ProjectCodeSchema.parse('Demo')).toThrow();
    });

    it('should reject codes that are too short', () => {
      expect(() => ProjectCodeSchema.parse('A')).toThrow();
    });

    it('should reject codes that are too long', () => {
      expect(() => ProjectCodeSchema.parse('VERYLONGCODE123')).toThrow();
    });

    it('should reject codes with special characters', () => {
      expect(() => ProjectCodeSchema.parse('DEMO-123')).toThrow();
      expect(() => ProjectCodeSchema.parse('DEMO.123')).toThrow();
      expect(() => ProjectCodeSchema.parse('DEMO@123')).toThrow();
    });

    it('should reject codes with spaces', () => {
      expect(() => ProjectCodeSchema.parse('DEMO 123')).toThrow();
    });

    it('should reject empty string', () => {
      expect(() => ProjectCodeSchema.parse('')).toThrow();
    });
  });

  describe('IdSchema', () => {
    it('should accept valid positive integers', () => {
      expect(() => IdSchema.parse(1)).not.toThrow();
      expect(() => IdSchema.parse(100)).not.toThrow();
      expect(() => IdSchema.parse(999999)).not.toThrow();
    });

    it('should reject zero', () => {
      expect(() => IdSchema.parse(0)).toThrow();
    });

    it('should reject negative numbers', () => {
      expect(() => IdSchema.parse(-1)).toThrow();
    });

    it('should reject non-integers', () => {
      expect(() => IdSchema.parse(1.5)).toThrow();
    });

    it('should reject strings', () => {
      expect(() => IdSchema.parse('123')).toThrow();
    });
  });

  describe('HashSchema', () => {
    it('should accept valid hash strings', () => {
      expect(() => HashSchema.parse('abc123')).not.toThrow();
      expect(() => HashSchema.parse('a1b2c3d4e5f6')).not.toThrow();
      expect(() => HashSchema.parse('hash-value-123')).not.toThrow();
    });

    it('should reject empty string', () => {
      expect(() => HashSchema.parse('')).toThrow();
    });

    it('should reject non-strings', () => {
      expect(() => HashSchema.parse(123)).toThrow();
    });
  });
});
