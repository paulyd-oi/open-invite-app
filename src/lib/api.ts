/**
 * API Client Module
 *
 * This module provides a centralized API client for making HTTP requests to the backend.
 * It handles authentication, request formatting, error handling, and response parsing.
 */

// Import fetch from expo/fetch for React Native compatibility
// This ensures fetch works correctly across different platforms (iOS, Android, Web)
import { fetch } from "expo/fetch";

// Import the authentication client to access user auth token
import { getAuthToken } from "./authClient";

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
 * A generic, type-safe wrapper around the fetch API that handles all HTTP requests.
 *
 * @template T - The expected response type (for type safety)
 * @param path - The API endpoint path (e.g., "/api/posts")
 * @param options - Configuration object containing HTTP method and optional body
 * @returns Promise resolving to the typed response data
 *
 * Features:
 * - Automatic authentication: Attaches session cookies from authClient
 * - JSON handling: Automatically stringifies request bodies and parses responses
 * - Error handling: Throws descriptive errors with status codes and messages
 * - Type safety: Returns strongly-typed responses using TypeScript generics
 *
 * @throws Error if the response is not ok (status code outside 200-299 range)
 */
const fetchFn = async <T>(path: string, options: FetchOptions): Promise<T> => {
  const { method, body } = options;
  // Step 1: Authentication - Retrieve auth token from SecureStore
  // This token is used to identify the user and maintain their session
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    // Always send JSON content type since our API uses JSON
    "Content-Type": "application/json",
  };
  
  // Add Authorization header if token exists
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Step 2: Make the HTTP request
  try {
    // Construct the full URL by combining the base backend URL with the endpoint path
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      headers,
      // Stringify the body if present (for POST, PUT, PATCH requests)
      body: body ? JSON.stringify(body) : undefined,
      // Use "include" for proper credential handling
      credentials: "include",
    });

    // Step 3: Error handling - Check if the response was successful
    if (!response.ok) {
      // Special case: Treat 404 on GET requests as empty state (not an error)
      // This prevents console spam when querying for resources that don't exist yet
      if (response.status === 404 && method === "GET") {
        return null as T;
      }

      // For all other errors, try to parse the error details from the response body
      // Handle both JSON and non-JSON error responses gracefully
      let errorMessage = `${response.status} ${response.statusText}`;
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
        } else {
          // Non-JSON response (e.g., "Not Found" text)
          const text = await response.text();
          errorMessage = text || errorMessage;
        }
      } catch {
        // If parsing fails, use the default error message
      }
      // Throw a descriptive error
      throw new Error(errorMessage);
    }

    // Step 4: Parse and return the successful response as JSON
    // The response is cast to the expected type T for type safety
    return response.json() as Promise<T>;
  } catch (error: any) {
    // Log the error for debugging purposes (dev only)
    if (__DEV__) {
      console.log(`[api.ts]: ${error}`);
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
   * @template T - Expected response type
   * @param path - API endpoint path
   * @param formData - FormData containing the file(s) to upload
   */
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const token = await getAuthToken();
    const headers: Record<string, string> = {};
    
    // Add Authorization header if token exists
    // Don't set Content-Type - let fetch set it with boundary for multipart
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${BACKEND_URL}${path}`, {
        method: "POST",
        headers,
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        let errorMessage = `${response.status} ${response.statusText}`;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || JSON.stringify(errorData);
          } else {
            const text = await response.text();
            errorMessage = text || errorMessage;
          }
        } catch {
          // If parsing fails, use the default error message
        }
        throw new Error(errorMessage);
      }

      return response.json() as Promise<T>;
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[api.ts upload]: ${error}`);
      }
      throw error;
    }
  },
};

// Export the API client and backend URL to be used in other modules
export { api, BACKEND_URL };
