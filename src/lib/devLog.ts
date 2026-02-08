/**
 * Dev Logging Helper (SSOT)
 *
 * Quiet-by-default logging for development. In DEV, logs are silenced unless:
 * 1. The tag is in ALWAYS_ON_TAG_PREFIXES (proof tags that must always print)
 * 2. Dev logging is explicitly enabled via EXPO_PUBLIC_DEV_LOGS=1 or runtime override
 *
 * In PROD, all logging is NO-OP.
 *
 * CRITICAL: SESSION_SHAPE in authClient.ts is NOT routed through this - it stays ungated.
 */

// Tags that always print in DEV (proof tags, critical diagnostics)
const ALWAYS_ON_TAG_PREFIXES = [
  // Pro entitlements proof
  "[PRO_SOT]",
  // Push notification proof tags
  "[P0_PUSH_REG]",
  "[P0_PUSH_TAP]",
  "[PUSH_DIAG]",
  "[PUSH_BOOTSTRAP]",
  "[P0_PUSH_SEND]",
  // Logout SSOT
  "[LOGOUT_SSOT]",
  // Auth trace tags
  "[AUTH_TRACE]",
  "[APPLE_AUTH_TRACE]",
  "[APPLE_TOKEN_PROOF]",
  "[AUTH_BARRIER]",
  "[AUTH_BARRIER_RESULT]",
  // Privacy/event invariant tags
  "[BUSY_GREY_INVARIANT_FAIL]",
  "[P0_PRIVACY_BUSY]",
  "[P0_BLOCKED_EVENT]",
  "[P0_EVENT_QK]",
  // Session shape (but this one stays raw in authClient.ts)
  "[SESSION_SHAPE]",
  // Hard reset logging (critical for debugging auth issues)
  "[HARD_RESET]",
  "[HARD_RESET_BLOCKED]",
  "[AUTH_WARN]",
  // P1 UX perf proof tags
  "[P1_QUERY_DEFAULTS]",
  "[P1_JITTER]",
  "[P1_FEED_PAGINATION]",
  // P0 SecureStore error handling
  "[P0_SECURESTORE]",
  // P1 loading invariant proof
  "[P1_LOADING_INV]",
  // P1 RSVP patch proof
  "[P1_RSVP_PATCH]",
  // P1 circle message patch proof
  "[P1_MSG_PATCH]",
  // P1 optimistic message send proof
  "[P1_MSG_OPT]",
  // P1 message delivery + retry proof
  "[P1_MSG_DELIVERY]",
  // P1 scroll anchor proof
  "[P1_SCROLL_ANCHOR]",
];

/**
 * Check if dev logging is enabled via env or runtime override
 */
function isDevLoggingEnabled(): boolean {
  // Check runtime override first
  if (typeof globalThis !== "undefined" && (globalThis as any).OI_DEV_LOGS === true) {
    return true;
  }
  // Check env var
  return process.env.EXPO_PUBLIC_DEV_LOGS === "1";
}

/**
 * Check if tag is always-on (proof tags)
 */
function isAlwaysOnTag(tag: string): boolean {
  return ALWAYS_ON_TAG_PREFIXES.some(prefix => tag.startsWith(prefix));
}

/**
 * DEV-only log. No-op in PROD.
 * Only prints if tag is always-on OR dev logging is enabled.
 */
export function devLog(tag: string, ...args: unknown[]): void {
  if (!__DEV__) return;
  if (!isAlwaysOnTag(tag) && !isDevLoggingEnabled()) return;
  console.log(tag, ...args);
}

/**
 * DEV-only warn. No-op in PROD.
 * Only prints if tag is always-on OR dev logging is enabled.
 */
export function devWarn(tag: string, ...args: unknown[]): void {
  if (!__DEV__) return;
  if (!isAlwaysOnTag(tag) && !isDevLoggingEnabled()) return;
  console.warn(tag, ...args);
}

/**
 * DEV-only error. No-op in PROD.
 * Only prints if tag is always-on OR dev logging is enabled.
 */
export function devError(tag: string, ...args: unknown[]): void {
  if (!__DEV__) return;
  if (!isAlwaysOnTag(tag) && !isDevLoggingEnabled()) return;
  console.error(tag, ...args);
}
