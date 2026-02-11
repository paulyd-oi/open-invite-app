// src/lib/errors.ts

import { devError } from "./devLog";

// ── Create-event error receipt ──────────────────────────────────────────────
export interface CreateEventErrorReceipt {
  status: number | null;
  code: string | null;
  message: string;
  hint: string;
  requestId: string | null;
  ts: string;
  isCircle: boolean;
  circleId: string | null;
}

/** Map status/code to actionable user-facing copy for event creation. */
function createEventUserCopy(
  status: number | null,
  code: string | null,
  isCircle: boolean,
): { message: string; hint: string } {
  if (code === "HOST_LIMIT_REACHED") {
    return { message: "Event limit reached", hint: "Upgrade to create more events." };
  }

  if (status === 401 || status === 403) {
    return {
      message: "Please sign in",
      hint: isCircle
        ? "Your session expired. Sign in again to post to this circle."
        : "Your session expired. Please sign in again.",
    };
  }

  if (status === 404) {
    return {
      message: isCircle ? "Circle not found" : "Not found",
      hint: isCircle
        ? "This circle may have been deleted or you lost access."
        : "The requested resource could not be found.",
    };
  }

  if (status === 409) {
    return {
      message: isCircle ? "Couldn't post to circle" : "Conflict",
      hint: isCircle
        ? "The circle is out of sync. Pull to refresh and try again."
        : "Please refresh and try again.",
    };
  }

  if (status === 429) {
    return {
      message: "Too many requests",
      hint: "Wait a moment before creating another event.",
    };
  }

  if (status !== null && status >= 500) {
    return {
      message: "Service issue",
      hint: "Something went wrong on our end. Please try again shortly.",
    };
  }

  // Network / null status (offline, DNS, timeout)
  if (status === null) {
    return {
      message: "Connection problem",
      hint: "Check your internet connection and try again.",
    };
  }

  return { message: "Create failed", hint: "Something went wrong. Please try again." };
}

/**
 * Normalize any error from the create-event mutation into a structured receipt.
 * Provides deterministic, status-specific user copy (never generic "Server Error").
 */
export function normalizeCreateEventError(
  error: unknown,
  circleId: string | null,
): CreateEventErrorReceipt {
  const status: number | null =
    (error as any)?.status ??
    (error as any)?.response?.status ??
    null;

  const code: string | null =
    (error as any)?.data?.error ??
    (error as any)?.response?.data?.error ??
    null;

  const requestId: string | null =
    (error as any)?.data?.requestId ??
    (error as any)?.response?.data?.requestId ??
    (error as any)?.response?.headers?.["x-request-id"] ??
    null;

  const isCircle = !!circleId;
  const { message, hint } = createEventUserCopy(status, code, isCircle);

  return {
    status,
    code,
    message,
    hint,
    requestId,
    ts: new Date().toISOString(),
    isCircle,
    circleId: circleId ?? null,
  };
}

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
