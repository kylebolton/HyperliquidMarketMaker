import { toast } from "sonner";

/**
 * Error types for categorizing Hyperliquid API errors
 */
export enum ErrorType {
  // Critical errors that require immediate attention
  CRITICAL = "critical",
  // Warnings that may affect functionality but aren't critical
  WARNING = "warning",
  // Informational messages about expected rejections
  INFO = "info",
}

/**
 * Error categories for Hyperliquid API
 */
export enum ErrorCategory {
  // Authentication and authorization errors
  AUTH = "auth",
  // Network-related errors
  NETWORK = "network",
  // Order placement errors
  ORDER = "order",
  // Rate limiting errors
  RATE_LIMIT = "rate_limit",
  // Validation errors
  VALIDATION = "validation",
  // Unknown errors
  UNKNOWN = "unknown",
}

/**
 * Interface for structured error information
 */
export interface ErrorInfo {
  type: ErrorType;
  category: ErrorCategory;
  message: string;
  details?: string;
  code?: string;
  timestamp: number;
}

/**
 * Common error messages from Hyperliquid API
 */
const ERROR_PATTERNS = {
  // Order rejection patterns (INFO level)
  ORDER_REJECTION: [
    {
      pattern: /price slippage/,
      category: ErrorCategory.ORDER,
      type: ErrorType.INFO,
    },
    {
      pattern: /insufficient funds/,
      category: ErrorCategory.ORDER,
      type: ErrorType.INFO,
    },
    {
      pattern: /minimum order size/,
      category: ErrorCategory.ORDER,
      type: ErrorType.INFO,
    },
    {
      pattern: /price outside allowed range/,
      category: ErrorCategory.ORDER,
      type: ErrorType.INFO,
    },
    {
      pattern: /order would be immediately filled/,
      category: ErrorCategory.ORDER,
      type: ErrorType.INFO,
    },
  ],

  // Authentication errors (CRITICAL level)
  AUTH_ERRORS: [
    {
      pattern: /invalid api key/,
      category: ErrorCategory.AUTH,
      type: ErrorType.CRITICAL,
    },
    {
      pattern: /signature mismatch/,
      category: ErrorCategory.AUTH,
      type: ErrorType.CRITICAL,
    },
    {
      pattern: /api key expired/,
      category: ErrorCategory.AUTH,
      type: ErrorType.CRITICAL,
    },
    {
      pattern: /unauthorized/,
      category: ErrorCategory.AUTH,
      type: ErrorType.CRITICAL,
    },
  ],

  // Network errors (CRITICAL or WARNING level)
  NETWORK_ERRORS: [
    {
      pattern: /network error/,
      category: ErrorCategory.NETWORK,
      type: ErrorType.CRITICAL,
    },
    {
      pattern: /timeout/,
      category: ErrorCategory.NETWORK,
      type: ErrorType.WARNING,
    },
    {
      pattern: /connection refused/,
      category: ErrorCategory.NETWORK,
      type: ErrorType.CRITICAL,
    },
  ],

  // Rate limiting (WARNING level)
  RATE_LIMIT: [
    {
      pattern: /rate limit exceeded/,
      category: ErrorCategory.RATE_LIMIT,
      type: ErrorType.WARNING,
    },
    {
      pattern: /too many requests/,
      category: ErrorCategory.RATE_LIMIT,
      type: ErrorType.WARNING,
    },
  ],
};

/**
 * Analyzes an error from the Hyperliquid API and categorizes it
 * @param error The error object or message
 * @returns Structured error information
 */
export function analyzeError(error: unknown): ErrorInfo {
  const errorMessage = extractErrorMessage(error);
  const lowerCaseMessage = errorMessage.toLowerCase();

  // Check against known patterns
  for (const [, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const { pattern, category, type } of patterns) {
      if (pattern.test(lowerCaseMessage)) {
        return {
          type,
          category,
          message: formatErrorMessage(errorMessage, type),
          details:
            typeof error === "object" ? JSON.stringify(error) : undefined,
          timestamp: Date.now(),
        };
      }
    }
  }

  // Default to unknown critical error
  return {
    type: ErrorType.CRITICAL,
    category: ErrorCategory.UNKNOWN,
    message: formatErrorMessage(errorMessage, ErrorType.CRITICAL),
    details: typeof error === "object" ? JSON.stringify(error) : undefined,
    timestamp: Date.now(),
  };
}

/**
 * Extracts a readable error message from various error types
 * @param error The error object or message
 * @returns A string representation of the error
 */
function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    // Try to extract message from common API error formats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyError = error as any;
    if (anyError.message) return anyError.message;
    if (anyError.error?.message) return anyError.error.message;
    if (anyError.data?.message) return anyError.data.message;
    if (anyError.response?.data?.message) return anyError.response.data.message;

    // If no message field found, stringify the object
    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error occurred";
    }
  }

  return "Unknown error occurred";
}

/**
 * Formats an error message based on its type
 * @param message The raw error message
 * @param type The error type
 * @returns Formatted error message
 */
function formatErrorMessage(message: string, type: ErrorType): string {
  switch (type) {
    case ErrorType.CRITICAL:
      return `Critical Error: ${message}`;
    case ErrorType.WARNING:
      return `Warning: ${message}`;
    case ErrorType.INFO:
      return `Info: ${message}`;
    default:
      return message;
  }
}

/**
 * Handles an error by analyzing it and displaying appropriate UI notification
 * @param error The error to handle
 * @param context Optional context information
 * @returns The analyzed error information
 */
export function handleError(error: unknown, context?: string): ErrorInfo {
  const errorInfo = analyzeError(error);

  // Add context to the message if provided
  const contextMessage = context
    ? `[${context}] ${errorInfo.message}`
    : errorInfo.message;

  // Display appropriate UI notification based on error type
  switch (errorInfo.type) {
    case ErrorType.CRITICAL:
      toast.error(contextMessage, {
        duration: 5000,
        id: `error-${errorInfo.category}-${Date.now()}`,
      });
      // Log critical errors
      console.error(contextMessage, errorInfo.details);
      break;

    case ErrorType.WARNING:
      toast.warning(contextMessage, {
        duration: 4000,
        id: `warning-${errorInfo.category}-${Date.now()}`,
      });
      // Log warnings
      console.warn(contextMessage, errorInfo.details);
      break;

    case ErrorType.INFO:
      toast.info(contextMessage, {
        duration: 3000,
        id: `info-${errorInfo.category}-${Date.now()}`,
      });
      // Optionally log info messages
      console.info(contextMessage);
      break;
  }

  return errorInfo;
}

/**
 * Determines if an error is a critical error that requires immediate attention
 * @param error The error to check
 * @returns True if the error is critical
 */
export function isCriticalError(error: unknown): boolean {
  const errorInfo = analyzeError(error);
  return errorInfo.type === ErrorType.CRITICAL;
}

/**
 * Determines if an error is just an expected order rejection
 * @param error The error to check
 * @returns True if the error is an expected order rejection
 */
export function isOrderRejection(error: unknown): boolean {
  const errorInfo = analyzeError(error);
  return (
    errorInfo.type === ErrorType.INFO &&
    errorInfo.category === ErrorCategory.ORDER
  );
}
