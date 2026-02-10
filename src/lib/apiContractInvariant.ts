/**
 * apiContractInvariant.ts — DEV-only API response shape sanity checker.
 *
 * Detects backend/frontend contract drift at the shared network boundary.
 * Never blocks, throws, or mutates responses. Instrumentation only.
 *
 * Canonical tag: [P16_API_INVAR]
 */
import { devLog } from "@/lib/devLog";

// ─── Spam control: once-per-endpoint-per-issue ──────────────────
const _seen = new Set<string>();

function logOnce(key: string, endpoint: string, issue: string, sample?: unknown): void {
  if (_seen.has(key)) return;
  _seen.add(key);
  devLog("[P16_API_INVAR]", { endpoint, issue, ...(sample !== undefined ? { sample } : {}) });
}

/**
 * Validate API response shape. DEV-only, zero mutation, zero throw.
 */
export function validateApiContract(endpoint: string, data: unknown): void {
  if (!__DEV__) return;

  // A) null / undefined response
  if (data == null) {
    logOnce(`${endpoint}:null`, endpoint, "null_response");
    return;
  }

  // B) unexpected primitive (string, number, boolean)
  if (typeof data !== "object") {
    logOnce(`${endpoint}:primitive`, endpoint, "unexpected_primitive", typeof data);
    return;
  }

  // C) array — verify elements are objects
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const el = data[i];
      if (el != null && typeof el !== "object") {
        logOnce(`${endpoint}:array_primitive`, endpoint, "array_contains_primitive", {
          index: i,
          type: typeof el,
        });
        break; // first violation only
      }
    }
    return;
  }

  // D) object — detect undefined first-level fields
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (obj[key] === undefined) {
      logOnce(`${endpoint}:undef_${key}`, endpoint, "undefined_field", { field: key });
      break; // first violation only
    }
  }
}
