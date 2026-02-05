/**
 * Error Handling Tests
 */

import { describe, it, expect } from '@jest/globals';
import {
  formatApiError,
  isAuthenticationError,
  isNotFoundError,
  isValidationError,
  isRateLimitError,
  ToolExecutionError,
  createToolError,
} from './errors.js';
import { AxiosError } from 'axios';

describe('Error Utilities', () => {
  describe('formatApiError', () => {
    it('should format authentication error (401)', () => {
      const error = {
        response: {
          status: 401,
          data: { message: 'Invalid token' },
        },
        message: 'Request failed',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toContain('Authentication failed');
      expect(formatted).toContain('QASE_API_TOKEN');
    });

    it('should format forbidden error (403)', () => {
      const error = {
        response: {
          status: 403,
          data: { message: 'Access denied' },
        },
        message: 'Request failed',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toContain('Access forbidden');
    });

    it('should format not found error (404)', () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'Project not found' },
        },
        message: 'Request failed',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toContain('Resource not found');
    });

    it('should format validation error (400)', () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'Invalid input' },
        },
        message: 'Request failed',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toContain('Invalid request');
    });

    it('should format unprocessable entity error (422)', () => {
      const error = {
        response: {
          status: 422,
          data: { message: 'Validation failed' },
        },
        message: 'Request failed',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toContain('Validation error');
    });

    it('should format rate limit error (429)', () => {
      const error = {
        response: {
          status: 429,
          data: { message: 'Too many requests' },
        },
        message: 'Request failed',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toContain('Rate limit exceeded');
    });

    it('should format server error (500)', () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal server error' },
        },
        message: 'Request failed',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toContain('Qase API server error');
    });

    it('should handle non-Axios errors', () => {
      const error = new Error('Generic error');
      const formatted = formatApiError(error);
      expect(formatted).toBe('Generic error');
    });

    it('should handle errors without response', () => {
      const error = {
        message: 'Network error',
        isAxiosError: true,
      } as AxiosError;

      const formatted = formatApiError(error);
      expect(formatted).toBe('Network error');
    });
  });

  describe('isAuthenticationError', () => {
    it('should return true for 401 errors', () => {
      const error = {
        response: { status: 401 },
        isAxiosError: true,
      } as AxiosError;
      expect(isAuthenticationError(error)).toBe(true);
    });

    it('should return false for non-401 errors', () => {
      const error = {
        response: { status: 404 },
        isAxiosError: true,
      } as AxiosError;
      expect(isAuthenticationError(error)).toBe(false);
    });

    it('should return false for non-Axios errors', () => {
      const error = new Error('Not an Axios error');
      expect(isAuthenticationError(error)).toBe(false);
    });
  });

  describe('isNotFoundError', () => {
    it('should return true for 404 errors', () => {
      const error = {
        response: { status: 404 },
        isAxiosError: true,
      } as AxiosError;
      expect(isNotFoundError(error)).toBe(true);
    });

    it('should return false for non-404 errors', () => {
      const error = {
        response: { status: 500 },
        isAxiosError: true,
      } as AxiosError;
      expect(isNotFoundError(error)).toBe(false);
    });
  });

  describe('isValidationError', () => {
    it('should return true for 400 errors', () => {
      const error = {
        response: { status: 400 },
        isAxiosError: true,
      } as AxiosError;
      expect(isValidationError(error)).toBe(true);
    });

    it('should return true for 422 errors', () => {
      const error = {
        response: { status: 422 },
        isAxiosError: true,
      } as AxiosError;
      expect(isValidationError(error)).toBe(true);
    });

    it('should return false for other errors', () => {
      const error = {
        response: { status: 500 },
        isAxiosError: true,
      } as AxiosError;
      expect(isValidationError(error)).toBe(false);
    });
  });

  describe('isRateLimitError', () => {
    it('should return true for 429 errors', () => {
      const error = {
        response: { status: 429 },
        isAxiosError: true,
      } as AxiosError;
      expect(isRateLimitError(error)).toBe(true);
    });

    it('should return false for non-429 errors', () => {
      const error = {
        response: { status: 401 },
        isAxiosError: true,
      } as AxiosError;
      expect(isRateLimitError(error)).toBe(false);
    });
  });

  describe('ToolExecutionError', () => {
    it('should create error with message only', () => {
      const error = new ToolExecutionError('Operation failed');
      expect(error.message).toBe('Operation failed');
      expect(error.name).toBe('ToolExecutionError');
      expect(error.suggestion).toBeUndefined();
    });

    it('should create error with message and suggestion', () => {
      const error = new ToolExecutionError('Project not found', 'Use list_projects to check existing projects');
      expect(error.message).toBe('Project not found');
      expect(error.suggestion).toBe('Use list_projects to check existing projects');
    });

    it('should format user message without suggestion', () => {
      const error = new ToolExecutionError('Operation failed');
      expect(error.toUserMessage()).toBe('Operation failed');
    });

    it('should format user message with suggestion', () => {
      const error = new ToolExecutionError('Project not found', 'Check the project code');
      expect(error.toUserMessage()).toBe('Project not found\n\nSuggestion: Check the project code');
    });

    it('should be instanceof Error', () => {
      const error = new ToolExecutionError('Test');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ToolExecutionError).toBe(true);
    });
  });

  describe('createToolError', () => {
    it('should create error with authentication suggestion', () => {
      const error = createToolError('Authentication failed: Invalid token');
      expect(error.suggestion).toContain('QASE_API_TOKEN');
    });

    it('should create error with permission suggestion for 403', () => {
      const error = createToolError('Access forbidden: No access to project');
      expect(error.suggestion).toContain('permission');
    });

    it('should create error with not found suggestion', () => {
      const error = createToolError('Resource not found: Project DEMO');
      expect(error.suggestion).toContain('Verify the resource exists');
    });

    it('should create error with validation suggestion for projects', () => {
      const error = createToolError('Invalid request: Data is invalid', 'creating project');
      expect(error.suggestion).toContain('project code may already exist');
    });

    it('should create error with validation suggestion for cases', () => {
      const error = createToolError('Invalid request: Data is invalid', 'case operation');
      expect(error.suggestion).toContain('project code exists');
    });

    it('should create error with rate limit suggestion', () => {
      const error = createToolError('Rate limit exceeded: Too many requests');
      expect(error.suggestion).toContain('Wait');
    });

    it('should create error with server error suggestion', () => {
      const error = createToolError('Qase API server error: 500');
      expect(error.suggestion).toContain('temporary');
    });

    it('should create error without suggestion for unknown errors', () => {
      const error = createToolError('Some unknown error');
      expect(error.suggestion).toBeUndefined();
    });
  });
});
