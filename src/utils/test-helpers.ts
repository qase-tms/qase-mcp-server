/**
 * Test Helper Utilities
 *
 * Provides mock objects and helper functions for testing.
 */

import { QaseApi } from 'qaseio';

/**
 * Mock successful API response
 */
export function mockApiSuccess<T>(data: T) {
  return Promise.resolve({
    data: {
      status: true,
      result: data,
    },
  });
}

/**
 * Mock API error response
 */
export function mockApiError(statusCode: number, message: string) {
  const error: any = new Error(message);
  error.response = {
    status: statusCode,
    data: {
      errorMessage: message,
    },
  };
  return Promise.reject(error);
}

/**
 * Set environment variables for testing
 */
export function setTestEnv() {
  process.env.QASE_API_TOKEN = 'test-token-123';
  process.env.QASE_API_DOMAIN = 'api.qase.io';
}

/**
 * Clear environment variables
 */
export function clearTestEnv() {
  delete process.env.QASE_API_TOKEN;
  delete process.env.QASE_API_DOMAIN;
}

/**
 * Create mock API client for testing
 */
export function createMockApiClient(): jest.Mocked<Partial<QaseApi>> {
  return {
    projects: {
      getProjects: jest.fn(),
      getProject: jest.fn(),
      createProject: jest.fn(),
      deleteProject: jest.fn(),
      grantAccess: jest.fn(),
      revokeAccess: jest.fn(),
    } as any,
    cases: {
      getCases: jest.fn(),
      getCase: jest.fn(),
      createCase: jest.fn(),
      updateCase: jest.fn(),
      deleteCase: jest.fn(),
      bulkCreateCases: jest.fn(),
    } as any,
    suites: {
      getSuites: jest.fn(),
      getSuite: jest.fn(),
      createSuite: jest.fn(),
      updateSuite: jest.fn(),
      deleteSuite: jest.fn(),
    } as any,
    runs: {
      getRuns: jest.fn(),
      getRun: jest.fn(),
      createRun: jest.fn(),
      deleteRun: jest.fn(),
      completeRun: jest.fn(),
    } as any,
  } as any;
}
