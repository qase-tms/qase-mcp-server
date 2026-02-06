/**
 * Error Handling Utilities
 *
 * Provides comprehensive error handling for Qase API interactions:
 * - Custom error classes
 * - Error formatting with user-friendly messages
 * - Type guards for specific error types
 * - Integration with neverthrow Result type
 */

import { AxiosError } from 'axios';
import { ResultAsync } from 'neverthrow';

/**
 * Custom error class for Qase API errors
 */
export class QaseApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'QaseApiError';
    Object.setPrototypeOf(this, QaseApiError.prototype);
  }
}

/**
 * Error class for tool execution errors
 *
 * Use this for expected failures during tool execution (API errors, validation errors,
 * business logic errors). These errors are returned to the LLM with isError: true,
 * allowing the LLM to understand the failure and take corrective action.
 *
 * Protocol errors (unknown tool, invalid schema) should use regular Error instead.
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public suggestion?: string,
  ) {
    super(message);
    this.name = 'ToolExecutionError';
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }

  /**
   * Format the error message for LLM consumption
   */
  toUserMessage(): string {
    if (this.suggestion) {
      return `${this.message}\n\nSuggestion: ${this.suggestion}`;
    }
    return this.message;
  }
}

/**
 * Format API error into a user-friendly message
 *
 * @param error - The error to format
 * @returns Formatted error message
 */
export function formatApiError(error: unknown): string {
  // Handle Axios errors (most common from API calls)
  const axiosError = error as AxiosError;
  if (axiosError.isAxiosError || error instanceof AxiosError) {
    const status = axiosError.response?.status;
    const data = axiosError.response?.data as any;
    const message = data?.errorMessage || data?.message || axiosError.message;

    // Format based on HTTP status code
    switch (status) {
      case 401:
        return `Authentication failed: ${message}. Please check your QASE_API_TOKEN environment variable.`;
      case 403:
        return `Access forbidden: ${message}. You don't have permission to perform this action.`;
      case 404:
        return `Resource not found: ${message}`;
      case 400:
        return `Invalid request: ${message}`;
      case 422:
        return `Validation error: ${message}`;
      case 429:
        return `Rate limit exceeded: ${message}. Please try again later.`;
      case 500:
      case 502:
      case 503:
      case 504:
        return `Qase API server error: ${message}. Please try again later.`;
      default:
        return message || 'Unknown API error occurred';
    }
  }

  // Handle QaseApiError
  if (error instanceof QaseApiError) {
    return error.message;
  }

  // Handle generic Error
  if (error instanceof Error) {
    return error.message;
  }

  // Handle unknown error types
  return String(error);
}

/**
 * Type guard to check if an error is an authentication error (401)
 *
 * @param error - The error to check
 * @returns True if the error is a 401 authentication error
 */
export function isAuthenticationError(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return (
    (axiosError.isAxiosError || error instanceof AxiosError) && axiosError.response?.status === 401
  );
}

/**
 * Type guard to check if an error is a not found error (404)
 *
 * @param error - The error to check
 * @returns True if the error is a 404 not found error
 */
export function isNotFoundError(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return (
    (axiosError.isAxiosError || error instanceof AxiosError) && axiosError.response?.status === 404
  );
}

/**
 * Type guard to check if an error is a validation error (400 or 422)
 *
 * @param error - The error to check
 * @returns True if the error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return (
    (axiosError.isAxiosError || error instanceof AxiosError) &&
    (axiosError.response?.status === 400 || axiosError.response?.status === 422)
  );
}

/**
 * Type guard to check if an error is a rate limit error (429)
 *
 * @param error - The error to check
 * @returns True if the error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return (
    (axiosError.isAxiosError || error instanceof AxiosError) && axiosError.response?.status === 429
  );
}

/**
 * Helper to wrap promises in neverthrow Result type
 *
 * Converts Promise<T> to ResultAsync<T, string> with formatted error messages
 *
 * @param promise - The promise to wrap
 * @returns ResultAsync with formatted error on rejection
 *
 * @example
 * ```typescript
 * const result = await toResultAsync(apiClient.projects.getProjects());
 * result.match(
 *   (projects) => console.log(projects),
 *   (error) => console.error(error)
 * );
 * ```
 */
export function toResultAsync<T>(promise: Promise<T>): ResultAsync<T, string> {
  return ResultAsync.fromPromise(promise, formatApiError);
}

/**
 * Create a ToolExecutionError from an API error with helpful suggestions
 *
 * @param error - The formatted error message
 * @param context - Optional context about the operation (e.g., "creating project")
 * @returns ToolExecutionError with suggestion for recovery
 */
export function createToolError(error: string, context?: string): ToolExecutionError {
  const suggestion = getSuggestionForError(error, context);
  return new ToolExecutionError(error, suggestion);
}

/**
 * Get a helpful suggestion based on the error message
 */
function getSuggestionForError(error: string, context?: string): string | undefined {
  const lowerError = error.toLowerCase();

  // Authentication errors
  if (lowerError.includes('authentication failed') || lowerError.includes('401')) {
    return 'Check that QASE_API_TOKEN environment variable is set correctly.';
  }

  // Permission errors
  if (lowerError.includes('forbidden') || lowerError.includes('403')) {
    return 'Verify you have the required permissions for this operation.';
  }

  // Not found errors
  if (lowerError.includes('not found') || lowerError.includes('404')) {
    return 'Verify the resource exists. Use the appropriate list or get tool to check.';
  }

  // Validation errors - try to provide context-specific suggestions
  if (lowerError.includes('invalid') || lowerError.includes('validation')) {
    if (context?.includes('project')) {
      return 'The project code may already exist, or the input data is invalid. Use list_projects or get_project to check existing projects.';
    }
    if (context?.includes('case')) {
      return 'Verify the project code exists and the case data is valid. Use get_project to check the project.';
    }
    if (context?.includes('run')) {
      return 'Verify the project code exists and the run configuration is valid.';
    }
    return 'Check that all required fields are provided and values are in the correct format.';
  }

  // Rate limiting
  if (lowerError.includes('rate limit') || lowerError.includes('429')) {
    return 'Wait a moment and try again, or reduce the frequency of requests.';
  }

  // Server errors
  if (lowerError.includes('server error') || lowerError.includes('5')) {
    return 'This is a temporary server issue. Please try again later.';
  }

  return undefined;
}
