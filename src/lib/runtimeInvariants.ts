/**
 * runtimeInvariants.ts — DEV-only runtime invariant helpers for P15.
 *
 * Provides lightweight logging utilities to detect impossible runtime states.
 * All exports are no-ops in production builds.
 *
 * Canonical tags:
 *   [P15_AUTH_INVAR]  — session vs bootStatus sanity
 *   [P15_NAV_INVAR]   — illegal auth-route transitions
 *   [P15_NET_INVAR]   — authed fetch without credentials
 *   [P15_UI_INVAR]    — duplicate/impossible press states
 */
import { devLog, devWarn } from "@/lib/devLog";

// ─── Once-per-run dedup set (module-scoped, DEV only) ───────────
const _seen = new Set<string>();

/**
 * Log with a canonical P15 tag. No-op in production.
 */
export function p15(
  tag: "[P15_AUTH_INVAR]" | "[P15_NAV_INVAR]" | "[P15_NET_INVAR]" | "[P15_UI_INVAR]",
  payload: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  devWarn(tag, payload);
}

/**
 * Returns true the FIRST time `key` is seen per app run. DEV only.
 * Useful to avoid log spam for recurring invariant violations.
 */
export function once(key: string): boolean {
  if (!__DEV__) return false;
  if (_seen.has(key)) return false;
  _seen.add(key);
  return true;
}

/**
 * If `condition` is false, log a violation under `tag`. DEV only.
 * Does NOT throw — this is instrumentation, not enforcement.
 */
export function assertDev(
  condition: boolean,
  tag: "[P15_AUTH_INVAR]" | "[P15_NAV_INVAR]" | "[P15_NET_INVAR]" | "[P15_UI_INVAR]",
  payload: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  if (condition) return;
  devWarn(tag, { violation: true, ...payload });
}
