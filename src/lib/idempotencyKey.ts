/**
 * Idempotency Key Helper — Critical Write Protection
 *
 * Generates a unique x-idempotency-key header per mutation invocation.
 * Protects against accidental double-submits from UI taps / network flaps.
 *
 * SCOPE: RSVP, send-message, create-event mutations ONLY.
 * Backend may not consume the header yet; this is forward-compatible.
 *
 * INVARIANT: Each call to postIdempotent generates a fresh UUID key.
 * INVARIANT: The key is attached as x-idempotency-key HTTP header.
 */

import { authClient } from "./authClient";
import { devLog } from "./devLog";

/**
 * Generate a UUID-v4 idempotency key.
 * Prefers crypto.randomUUID() (Hermes/Expo SDK 50+), falls back to
 * timestamp+random for older runtimes.
 */
function generateIdempotencyKey(): string {
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
 * POST with an idempotency key header.
 *
 * Drop-in replacement for `api.post` on critical write paths.
 * Calls authClient.$fetch directly (same transport as api.post) with the
 * extra x-idempotency-key header attached.
 *
 * @template T - Expected response type
 * @param path - API endpoint path (e.g. "/api/events")
 * @param body - Optional JSON-serialisable request body
 * @returns Promise resolving to the typed response data
 */
export async function postIdempotent<T>(path: string, body?: object): Promise<T> {
  const key = generateIdempotencyKey();

  if (__DEV__) {
    devLog("[P0_IDEMPOTENCY]", { endpoint: path, idempotencyKey: key });
  }

  const response = await authClient.$fetch(path, {
    method: "POST",
    body,
    headers: { "x-idempotency-key": key },
  } as any);

  return response as T;
}
