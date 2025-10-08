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
});
