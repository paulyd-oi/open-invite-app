/**
 * API Client Module
 *
 * This module provides a centralized API client for making HTTP requests to the backend.
 * It handles authentication, request formatting, error handling, and response parsing.
 * 
 * All authenticated requests are routed through authClient.$fetch to ensure consistent
 * Authorization header attachment and auth state management.
 */

// Import the authentication client for all authenticated requests
import { authClient, getLastServerRequestId } from "./authClient";

// Import fetch for upload FormData handling
import { fetch } from "expo/fetch";
import { devLog, devWarn, devError } from "./devLog";
import { trackApiError, trackApiRequest } from "@/analytics/analyticsEventsSSOT";

// Import centralized backend URL configuration
import { BACKEND_URL } from "./config";

// [P0_POST_LOGOUT_NET] SSOT gate — blocks authed calls immediately on logout
import { shouldAllowAuthedRequest } from "./networkAuthGate";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type FetchOptions = {
  method: HttpMethod;
  body?: object; // Request body, will be JSON stringified before sending
};

/**
 * Generate a unique request ID for tracing.
 * Prefers crypto.randomUUID() (available in Hermes/Expo SDK 50+),
 * falls back to timestamp+random.
 */
function generateRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fallback below
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Derive a route group from API path for analytics bucketing.
 * Maps /api/events/... -> "events", /api/auth/... -> "auth", etc.
 * No PII — only uses route prefix. [GROWTH_FULLPHASE_C]
 */
function deriveRouteGroup(path: string): string {
  const match = path.match(/^\/api\/([a-z-]+)/);
  if (!match) return "other";
  const prefix = match[1];
  // Bucket common prefixes
  if (prefix === "auth" || prefix === "email-verification") return "auth";
  if (prefix === "events" || prefix === "calendar-events") return "events";
  if (prefix === "friends" || prefix === "circles") return "social";
  if (prefix === "notifications") return "notifications";
  if (prefix === "profile" || prefix === "profiles") return "profile";
  if (prefix === "upload") return "upload";
  return prefix;
}

/**
 * Core Fetch Function
 *
 * A generic, type-safe wrapper around authClient.$fetch for all API requests.
 * This ensures consistent authentication handling and Authorization header attachment.
 *
 * @template T - The expected response type (for type safety)
 * @param path - The API endpoint path (e.g., "/api/posts")
 * @param options - Configuration object containing HTTP method and optional body
 * @returns Promise resolving to the typed response data
 *
 * Features:
 * - Routes through authClient.$fetch for consistent auth handling
 * - Automatic authentication: Authorization headers managed by authClient
 * - JSON handling: Automatically handles request bodies and response parsing
 * - Error handling: Preserves original error handling with enhanced logging
 * - Type safety: Returns strongly-typed responses using TypeScript generics
 *
 * @throws Error if the response is not ok (status code outside 200-299 range)
 */
const fetchFn = async <T>(path: string, options: FetchOptions): Promise<T> => {
  const { method, body } = options;
  const requestId = generateRequestId();

  // [P0_POST_LOGOUT_NET] SSOT gate: block authed endpoints when network auth is disabled.
  // Throws immediately (no fetch) so React Query sees a normal error, not a 401.
  if (!shouldAllowAuthedRequest(path)) {
    const err: any = new Error(`[P0_POST_LOGOUT_NET] blocked: ${path}`);
    err.status = 0; // synthetic — not a real HTTP status
    err.isNetworkAuthGated = true; // marker so callers can identify gate blocks
    throw err;
  }

  const _t0 = Date.now();
  try {
    // Use authClient.$fetch for all requests - this handles authentication automatically
    // IMPORTANT: Pass body directly, authClient handles JSON serialization
    const response = await authClient.$fetch(path, {
      method,
      body: body,
      headers: { "x-request-id": requestId },
    } as any);

    const durationMs = Date.now() - _t0;

    if (__DEV__) {
      const serverRequestId = getLastServerRequestId();
      devLog("[P0_REQID_CLIENT]", {
        method,
        path,
        clientRequestId: requestId,
        ...(serverRequestId ? { serverRequestId } : {}),
        status: "ok",
      });
      // [P1_SLOW_API] flag requests over 1200ms
      if (durationMs > 1200) {
        devWarn(`[P1_SLOW_API] route=${method} ${path} durationMs=${durationMs}`);
      }
    }

    // [P1_API_TIMING] PostHog telemetry — fire-and-forget
    trackApiRequest({ route: `${method} ${path}`, durationMs, success: true, requestId, routeGroup: deriveRouteGroup(path) });

    return response as T;
  } catch (error: any) {
    const durationMs = Date.now() - _t0;
    // Attach requestId to error for downstream debugging
    error.requestId = requestId;
    // Prefer server-echoed request ID when available
    const serverReqId = error.serverRequestId ?? getLastServerRequestId();
    if (serverReqId) error.serverRequestId = serverReqId;
    // Enhanced error handling for debugging
    if (__DEV__) {
      devLog("[P0_REQID_CLIENT]", {
        method,
        path,
        clientRequestId: requestId,
        ...(serverReqId ? { serverRequestId: serverReqId } : {}),
        status: "error",
        errorStatus: error.status,
      });

      // Known optional endpoints - don't log 404s as errors
      const isKnownOptional = error.status === 404 && (
        path.includes("/api/entitlements")
      );
      
      // Expected auth errors during logout/bootstrap - only log, don't show red overlay
      const isExpectedAuthError = error.status === 401 || error.status === 403;
      
      if (!isKnownOptional && !isExpectedAuthError) {
        devLog(`[api.ts]: ${method} ${path} - ${error.message || error}`);
      } else if (isExpectedAuthError) {
        // Use devLog (not error) to avoid red overlay for expected auth failures
        devLog(`[api.ts auth]: ${error.status} ${method} ${path} - expected during logout/bootstrap`);
      }
      
      // Detailed error logging for /api/profile (non-401) to debug validation failures
      if (path.includes("/api/profile") && !isExpectedAuthError) {
        devLog(`[api.ts] /api/profile ERROR DETAILS:`);
        devLog(`  status: ${error.status}`);
        devLog(`  data: ${typeof error.data === 'object' ? JSON.stringify(error.data, null, 2) : error.data || 'none'}`);
        devLog(`  message: ${error.message}`);
      }
    }

    // [P1_API_TIMING] PostHog telemetry for errors too
    trackApiRequest({ route: `${method} ${path}`, durationMs, success: false, requestId, routeGroup: deriveRouteGroup(path) });

    // [P1_POSTHOG_API_ERROR] Emit api_error for HTTP 4xx/5xx
    const httpStatus = error.status;
    if (typeof httpStatus === "number" && httpStatus >= 400) {
      trackApiError({
        path,
        method,
        status: httpStatus,
        errorCode: error.data?.code ?? error.code,
      });
    }

    // Special case: Treat 404 on GET requests as empty state (not an error)
    // This prevents console spam when querying for resources that don't exist yet
    // EXCEPTION: Event detail endpoints need the error preserved for privacy handling
    if (error.status === 404 && method === "GET") {
      // Check if this is an event detail endpoint - these need 404 errors preserved
      const isEventDetailEndpoint = /^\/api\/events\/[^/]+$/.test(path);
      if (!isEventDetailEndpoint) {
        return null as T;
      }
      // For event detail endpoints, re-throw to let caller handle privacy logic
    }

    // Re-throw the error so the calling code can handle it appropriately
    throw error;
  }
};

/**
 * API Client Object
 *
 * Provides convenient methods for making HTTP requests with different methods.
 * Each method is a thin wrapper around fetchFn with the appropriate HTTP verb.
 *
 * Usage Examples:
 *
 * // GET request - Fetch data
 * const posts = await api.get<Post[]>('/api/posts');
 *
 * // POST request - Create new data
 * const newPost = await api.post<Post>('/api/posts', {
 *   title: 'My Post',
 *   content: 'Hello World'
 * });
 *
 * // PUT request - Replace existing data
 * const updatedPost = await api.put<Post>('/api/posts/123', {
 *   title: 'Updated Title',
 *   content: 'Updated Content'
 * });
 *
 * // PATCH request - Partially update existing data
 * const patchedPost = await api.patch<Post>('/api/posts/123', {
 *   title: 'New Title Only'
 * });
 *
 * // DELETE request - Remove data
 * await api.delete('/api/posts/123');
 */
const api = {
  /**
   * GET - Retrieve data from the server
   * @template T - Expected response type
   * @param path - API endpoint path
   */
  get: <T>(path: string) => fetchFn<T>(path, { method: "GET" }),

  /**
   * POST - Create new data on the server
   * @template T - Expected response type
   * @param path - API endpoint path
   * @param body - Optional request body containing data to create
   */
  post: <T>(path: string, body?: object) => fetchFn<T>(path, { method: "POST", body }),

  /**
   * PUT - Replace existing data on the server
   * @template T - Expected response type
   * @param path - API endpoint path
   * @param body - Optional request body containing data to replace
   */
  put: <T>(path: string, body?: object) => fetchFn<T>(path, { method: "PUT", body }),

  /**
   * PATCH - Partially update existing data on the server
   * @template T - Expected response type
   * @param path - API endpoint path
   * @param body - Optional request body containing partial data to update
   */
  patch: <T>(path: string, body?: object) => fetchFn<T>(path, { method: "PATCH", body }),

  /**
   * DELETE - Remove data from the server
   * @template T - Expected response type
   * @param path - API endpoint path
   * @param body - Optional request body (some DELETE endpoints require a body)
   */
  delete: <T>(path: string, body?: object) => fetchFn<T>(path, { method: "DELETE", body }),

  /**
   * UPLOAD - Upload files (FormData) to the server
   * Routes through authClient.$fetch for consistent auth handling
   * @template T - Expected response type
   * @param path - API endpoint path
   * @param formData - FormData containing the file(s) to upload
   */
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const requestId = generateRequestId();
    try {
      // Use authClient.$fetch which handles FormData correctly (no JSON Content-Type)
      const response = await authClient.$fetch<T>(path, {
        method: "POST",
        body: formData,
        headers: { "x-request-id": requestId },
      } as any);

      if (__DEV__) {
        const serverRequestId = getLastServerRequestId();
        devLog("[P0_REQID_CLIENT]", {
          method: "POST",
          path,
          clientRequestId: requestId,
          ...(serverRequestId ? { serverRequestId } : {}),
          status: "ok",
          upload: true,
        });
      }

      return response;
    } catch (error: any) {
      error.requestId = requestId;
      const serverReqId = error.serverRequestId ?? getLastServerRequestId();
      if (serverReqId) error.serverRequestId = serverReqId;
      if (__DEV__) {
        devLog("[P0_REQID_CLIENT]", {
          method: "POST",
          path,
          clientRequestId: requestId,
          ...(serverReqId ? { serverRequestId: serverReqId } : {}),
          status: "error",
          upload: true,
          errorStatus: error.status,
        });
      }
      throw error;
    }
  },
};

// Export the API client and backend URL to be used in other modules
export { api, BACKEND_URL };
