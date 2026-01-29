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
import { authClient } from "./authClient";

// Import fetch for upload FormData handling
import { fetch } from "expo/fetch";

// Import centralized backend URL configuration
import { BACKEND_URL } from "./config";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type FetchOptions = {
  method: HttpMethod;
  body?: object; // Request body, will be JSON stringified before sending
};

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

  try {
    // Use authClient.$fetch for all requests - this handles authentication automatically
    // IMPORTANT: Pass body directly, authClient handles JSON serialization
    const response = await authClient.$fetch(path, {
      method,
      body: body,
    } as any);

    return response as T;
  } catch (error: any) {
    // Enhanced error handling for debugging
    if (__DEV__) {
      // Known optional endpoints - don't log 404s as errors
      const isKnownOptional = error.status === 404 && (
        path.includes("/api/entitlements")
      );
      
      // Expected auth errors during logout/bootstrap - only log, don't show red overlay
      const isExpectedAuthError = error.status === 401 || error.status === 403;
      
      if (!isKnownOptional && !isExpectedAuthError) {
        console.log(`[api.ts]: ${method} ${path} - ${error.message || error}`);
      } else if (isExpectedAuthError) {
        // Use console.log (not error) to avoid red overlay for expected auth failures
        console.log(`[api.ts auth]: ${error.status} ${method} ${path} - expected during logout/bootstrap`);
      }
      
      // Detailed error logging for /api/profile (non-401) to debug validation failures
      if (path.includes("/api/profile") && !isExpectedAuthError) {
        console.log(`[api.ts] /api/profile ERROR DETAILS:`);
        console.log(`  status: ${error.status}`);
        console.log(`  data: ${typeof error.data === 'object' ? JSON.stringify(error.data, null, 2) : error.data || 'none'}`);
        console.log(`  message: ${error.message}`);
      }
    }

    // Special case: Treat 404 on GET requests as empty state (not an error)
    // This prevents console spam when querying for resources that don't exist yet
    if (error.status === 404 && method === "GET") {
      return null as T;
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
    try {
      // Use authClient.$fetch which handles FormData correctly (no JSON Content-Type)
      const response = await authClient.$fetch<T>(path, {
        method: "POST",
        body: formData,
      });

      return response;
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[api.ts upload]: ${error}`);
      }
      throw error;
    }
  },
  
  // Expose BACKEND_URL for debugging
  BACKEND_URL,
};

// Export the API client and backend URL to be used in other modules
export { api, BACKEND_URL };
