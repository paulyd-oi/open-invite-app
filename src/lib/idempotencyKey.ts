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
 * Handles HTTP 409 { error: "idempotency_pending" } by retrying up to
 * MAX_ATTEMPTS total (default 3). Waits for Retry-After header (seconds)
 * or falls back to 1 s between attempts.
 *
 * @template T - Expected response type
 * @param path - API endpoint path (e.g. "/api/events")
 * @param body - Optional JSON-serialisable request body
 * @returns Promise resolving to the typed response data
 */
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 1000;

export async function postIdempotent<T>(path: string, body?: object): Promise<T> {
  const key = generateIdempotencyKey();

  if (__DEV__) {
    devLog("[P0_IDEMPOTENCY]", { endpoint: path, idempotencyKey: key });
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await authClient.$fetch(path, {
        method: "POST",
        body,
        headers: { "x-idempotency-key": key },
      } as any);

      return response as T;
    } catch (error: any) {
      // Detect 409 idempotency_pending — the previous request with this key
      // is still being processed server-side.
      const isPending =
        error?.status === 409 &&
        (error?.data?.error === "idempotency_pending" ||
         error?.response?._data?.error === "idempotency_pending");

      if (!isPending || attempt === MAX_ATTEMPTS) {
        // Not a pending-retry situation, or we exhausted retries.
        if (isPending && __DEV__) {
          devLog("[P0_IDEMPOTENCY_CLIENT]", {
            outcome: "exhausted",
            attempt,
            endpoint: path,
            idempotencyKey: key,
          });
        }
        throw error;
      }

      // Compute wait: honour Retry-After (seconds) if present, else 1 s.
      const retryAfterRaw =
        error?.response?.headers?.get?.("retry-after") ??
        error?.headers?.["retry-after"];
      const retryMs =
        retryAfterRaw && !Number.isNaN(Number(retryAfterRaw))
          ? Number(retryAfterRaw) * 1000
          : DEFAULT_RETRY_MS;

      if (__DEV__) {
        devLog("[P0_IDEMPOTENCY_CLIENT]", {
          outcome: "pending-retry",
          attempt,
          endpoint: path,
          idempotencyKey: key,
          retryMs,
        });
      }

      await new Promise((r) => setTimeout(r, retryMs));
    }
  }

  // TypeScript exhaustiveness — should never reach here.
  throw new Error(`postIdempotent: unreachable after ${MAX_ATTEMPTS} attempts`);
}
