// src/lib/errors.ts

import { devError } from "./devLog";

/**
 * Convert an unknown error into a user-friendly message
 * Standardizes error handling across the app
 */
export function toUserMessage(err: unknown): { title: string; message?: string } {
  // Handle API error responses
  if (err && typeof err === 'object') {
    // Check for status property (from api.ts auth errors)
    if ('status' in err && typeof err.status === 'number') {
      if (err.status === 401) {
        return {
          title: 'Session Expired',
          message: 'Please log in again.',
        };
      }
      
      if (err.status === 403) {
        return {
          title: 'Access Denied',
          message: 'You do not have permission to perform this action.',
        };
      }
    }

    // Check for message property
    if ('message' in err && typeof err.message === 'string') {
      const msg = err.message;
      
      // Common API error patterns
      if (msg.includes('network') || msg.includes('fetch')) {
        return {
          title: 'Connection Error',
          message: 'Please check your internet connection and try again.',
        };
      }
      
      if (msg.includes('401') || msg.includes('unauthorized')) {
        return {
          title: 'Session Expired',
          message: 'Please log in again.',
        };
      }
      
      if (msg.includes('403') || msg.includes('forbidden')) {
        return {
          title: 'Access Denied',
          message: 'You do not have permission to perform this action.',
        };
      }
      
      if (msg.includes('404') || msg.includes('not found')) {
        return {
          title: 'Not Found',
          message: 'The requested item could not be found.',
        };
      }
      
      if (msg.includes('409') || msg.includes('conflict')) {
        return {
          title: 'Conflict',
          message: msg, // Often contains useful details like "username already taken"
        };
      }
      
      if (msg.includes('500') || msg.includes('server error')) {
        return {
          title: 'Server Error',
          message: 'Something went wrong on our end. Please try again later.',
        };
      }
      
      // Return the message as-is if it's user-friendly
      if (msg.length < 100 && !msg.includes('Error:') && !msg.includes('Exception')) {
        return {
          title: 'Error',
          message: msg,
        };
      }
    }
    
    // Check for code property (common in API errors)
    if ('code' in err && typeof err.code === 'string') {
      return {
        title: 'Error',
        message: `Error code: ${err.code}`,
      };
    }
  }
  
  // Handle string errors
  if (typeof err === 'string') {
    return {
      title: 'Error',
      message: err,
    };
  }
  
  // Generic fallback
  return {
    title: 'Error',
    message: 'Something went wrong. Please try again.',
  };
}

/**
 * Log error in development mode
 */
export function logError(context: string, error: unknown): void {
  if (__DEV__) {
    devError(`[${context}]`, error);
  }
}

/**
 * Handle error with toast notification
 * Combines logging and user feedback
 */
export function handleErrorWithToast(
  context: string,
  error: unknown,
  safeToast: {
    error: (title: string, message?: string) => void;
  }
): void {
  logError(context, error);
  const { title, message } = toUserMessage(error);
  safeToast.error(title, message);
}
