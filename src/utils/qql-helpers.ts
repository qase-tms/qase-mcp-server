/**
 * QQL Helper Utilities
 *
 * Provides common QQL query patterns and builders for Qase Query Language.
 */

/**
 * Common QQL entity types
 */
export enum QqlEntity {
  Case = 'case',
  Defect = 'defect',
  Run = 'run',
  Result = 'result',
  Plan = 'plan',
  Requirement = 'requirement',
}

/**
 * QQL query builder for common patterns
 */
export class QqlQueryBuilder {
  private parts: string[] = [];

  /**
   * Set entity type
   */
  entity(entityType: QqlEntity): this {
    this.parts.push(`entity = "${entityType}"`);
    return this;
  }

  /**
   * Filter by project
   */
  project(projectCode: string): this {
    this.parts.push(`project = "${projectCode}"`);
    return this;
  }

  /**
   * Filter by multiple projects
   */
  projects(projectCodes: string[]): this {
    const codes = projectCodes.map((c) => `"${c}"`).join(', ');
    this.parts.push(`project in [${codes}]`);
    return this;
  }

  /**
   * Add custom condition
   */
  where(condition: string): this {
    this.parts.push(`(${condition})`);
    return this;
  }

  /**
   * Order by field
   */
  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.parts.push(`ORDER BY ${field} ${direction}`);
    return this;
  }

  /**
   * Build the final query string
   */
  build(): string {
    return this.parts.join(' and ');
  }
}

/**
 * Common QQL query examples
 */
export const QqlExamples = {
  // Find all failed test results in last 7 days
  recentFailures: (projectCode: string) =>
    `entity = "result" and project = "${projectCode}" and status = "failed" and created >= now("-7d")`,

  // Find all open blocker defects
  blockerDefects: (projectCode: string) =>
    `entity = "defect" and project = "${projectCode}" and severity = "blocker" and status = "open"`,

  // Find all flaky test cases
  flakyTests: (projectCode: string) =>
    `entity = "case" and project = "${projectCode}" and isFlaky = true`,

  // Find all active test cases not automated
  notAutomated: (projectCode: string) =>
    `entity = "case" and project = "${projectCode}" and automation = "Not automated" and status = "Actual"`,

  // Find test cases created by specific author
  byAuthor: (projectCode: string, author: string) =>
    `entity = "case" and project = "${projectCode}" and author = "${author}"`,

  // Find test runs in progress
  activeRuns: (projectCode: string) =>
    `entity = "run" and project = "${projectCode}" and isStarted = true and isEnded = false`,

  // Find cases in specific milestone
  byMilestone: (projectCode: string, milestone: string) =>
    `entity = "case" and project = "${projectCode}" and milestone ~ "${milestone}"`,
};
