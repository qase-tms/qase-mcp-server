/**
 * QQL Helpers Tests
 */

import { describe, it, expect } from '@jest/globals';
import { QqlQueryBuilder, QqlEntity, QqlExamples } from './qql-helpers.js';

describe('QQL Helpers', () => {
  describe('QqlQueryBuilder', () => {
    it('should build simple entity query', () => {
      const query = new QqlQueryBuilder().entity(QqlEntity.Case).build();

      expect(query).toBe('entity = "case"');
    });

    it('should build query with project filter', () => {
      const query = new QqlQueryBuilder().entity(QqlEntity.Case).project('DEMO').build();

      expect(query).toBe('entity = "case" and project = "DEMO"');
    });

    it('should build query with multiple projects', () => {
      const query = new QqlQueryBuilder().entity(QqlEntity.Defect).projects(['DEMO', 'TEST']).build();

      expect(query).toBe('entity = "defect" and project in ["DEMO", "TEST"]');
    });

    it('should build query with custom where clause', () => {
      const query = new QqlQueryBuilder()
        .entity(QqlEntity.Result)
        .project('DEMO')
        .where('status = "failed"')
        .build();

      expect(query).toContain('entity = "result"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('status = "failed"');
    });

    it('should build query with order by ascending', () => {
      const query = new QqlQueryBuilder().entity(QqlEntity.Case).orderBy('id', 'ASC').build();

      expect(query).toBe('entity = "case" and ORDER BY id ASC');
    });

    it('should build query with order by descending', () => {
      const query = new QqlQueryBuilder().entity(QqlEntity.Case).orderBy('id', 'DESC').build();

      expect(query).toContain('ORDER BY id DESC');
    });

    it('should build complex query with all features', () => {
      const query = new QqlQueryBuilder()
        .entity(QqlEntity.Case)
        .projects(['DEMO', 'TEST'])
        .where('status = "Actual"')
        .where('automation = "Not automated"')
        .orderBy('created', 'DESC')
        .build();

      expect(query).toContain('entity = "case"');
      expect(query).toContain('project in ["DEMO", "TEST"]');
      expect(query).toContain('status = "Actual"');
      expect(query).toContain('automation = "Not automated"');
      expect(query).toContain('ORDER BY created DESC');
    });

    it('should handle empty query builder', () => {
      const query = new QqlQueryBuilder().build();
      expect(query).toBe('');
    });

    it('should chain methods correctly', () => {
      const builder = new QqlQueryBuilder();
      const result = builder.entity(QqlEntity.Run).project('DEMO');

      expect(result).toBe(builder); // Should return same instance for chaining
    });
  });

  describe('QqlExamples', () => {
    it('should generate recent failures query', () => {
      const query = QqlExamples.recentFailures('DEMO');
      expect(query).toContain('entity = "result"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('status = "failed"');
      expect(query).toContain('now("-7d")');
    });

    it('should generate blocker defects query', () => {
      const query = QqlExamples.blockerDefects('DEMO');
      expect(query).toContain('entity = "defect"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('severity = "blocker"');
      expect(query).toContain('status = "open"');
    });

    it('should generate flaky tests query', () => {
      const query = QqlExamples.flakyTests('DEMO');
      expect(query).toContain('entity = "case"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('isFlaky = true');
    });

    it('should generate not automated query', () => {
      const query = QqlExamples.notAutomated('DEMO');
      expect(query).toContain('entity = "case"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('automation = "Not automated"');
      expect(query).toContain('status = "Actual"');
    });

    it('should generate by author query', () => {
      const query = QqlExamples.byAuthor('DEMO', 'john.doe');
      expect(query).toContain('entity = "case"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('author = "john.doe"');
    });

    it('should generate active runs query', () => {
      const query = QqlExamples.activeRuns('DEMO');
      expect(query).toContain('entity = "run"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('isStarted = true');
      expect(query).toContain('isEnded = false');
    });

    it('should generate by milestone query', () => {
      const query = QqlExamples.byMilestone('DEMO', 'Sprint 12');
      expect(query).toContain('entity = "case"');
      expect(query).toContain('project = "DEMO"');
      expect(query).toContain('milestone ~ "Sprint 12"');
    });

    it('should handle different project codes', () => {
      const query1 = QqlExamples.recentFailures('PROJECT1');
      const query2 = QqlExamples.recentFailures('PROJECT2');

      expect(query1).toContain('project = "PROJECT1"');
      expect(query2).toContain('project = "PROJECT2"');
    });
  });

  describe('QqlEntity enum', () => {
    it('should have all entity types', () => {
      expect(QqlEntity.Case).toBe('case');
      expect(QqlEntity.Defect).toBe('defect');
      expect(QqlEntity.Run).toBe('run');
      expect(QqlEntity.Result).toBe('result');
      expect(QqlEntity.Plan).toBe('plan');
      expect(QqlEntity.Requirement).toBe('requirement');
    });
  });
});
