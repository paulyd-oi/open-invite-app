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
  // P0 event color gate (host-only invariant)
  "[P0_EVENT_COLOR_GATE]",
  // P0 event color UI (viewer-scoped color change)
  "[P0_EVENT_COLOR_UI]",
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
  // P1 new messages indicator proof
  "[P1_NEW_MSG]",
  // P1 read/unread realtime proof
  "[P1_READ_UNREAD]",
  // P1 chat pagination proof
  "[P1_CHAT_PAGINATION]",
  // P1 unread v2 (totalUnread + byCircle) proof
  "[P1_UNREAD_V2]",
  // P1 read horizon v2 (multi-device correctness)
  "[P1_READ_HORIZON]",
  // P1 push contract validator (malformed payload guard)
  "[P1_PUSH_CONTRACT]",
  // P1 message idempotency (clientMessageId)
  "[P1_MSG_IDEMP]",
  // P1 chat grouped message runs
  "[P1_CHAT_GROUP]",
  // P1 chat send status UI (pending + failed banner)
  "[P1_CHAT_SEND_UI]",
  // P1 chat timestamp polish (run-aware + tap-to-toggle)
  "[P1_CHAT_TS]",
  // P1 chat new-messages pill
  "[P1_CHAT_PILL]",
  // P2 chat date separators
  "[P2_CHAT_DATESEP]",
  // P2 typing indicator UI
  "[P2_TYPING_UI]",
  // P2 scroll-to-bottom floating button
  "[P2_CHAT_SCROLL_BTN]",
  // Scheduling engine invariant proof logs
  "[SCHED_INVAR_V1]",
  // Suggested hours invariant proof logs
  "[SUGGESTED_HOURS_INVAR_V1]",
  // P2 chat reactions overlay
  "[P2_CHAT_REACTIONS]",
  // P2 chat reply overlay shell
  "[P2_CHAT_REPLY]",
  // P2 chat edit/delete shell
  "[P2_CHAT_EDITDEL]",
  // P2 chat reply wired to API
  "[P2_CHAT_REPLY_UI2]",
  // P0 chat anchor hardening QA
  "[P0_CHAT_ANCHOR]",
  // P1 availability summary strip UI
  "[P1_AVAIL_SUMMARY_UI]",
  // P1 plan lock strip UI
  "[P1_PLAN_LOCK_UI]",
  // P1 circle poll UI
  "[P1_POLL_UI]",
  // P1 poll-to-plan-lock bridge
  "[P1_POLL_LOCK_BRIDGE]",
  // P1 lock polish UX
  "[P1_LOCK_POLISH]",
  // P1 coordination flow visual pass
  "[P1_COORDINATION_FLOW]",
  // P1 lifecycle chip + run-it-back UI
  "[P1_LIFECYCLE_UI]",
  // P1 notification level UI
  "[P1_NOTIFY_LEVEL_UI]",
  // P1 polls E2E UX proof pass
  "[P1_POLLS_E2E_UI]",
  // P1 Who's Coming sheet lifecycle
  "[P1_WHO_COMING_SHEET]",
  // P1 back label resolution proof
  "[P1_BACK_LABEL]",
  // P1 prefill event from scheduling slot
  "[P1_PREFILL_EVENT]",
  // P1 profile banner upload/render proof
  "[P1_PROFILE_BANNER]",
  // P0 media route (upload kind + folder routing)
  "[P0_MEDIA_ROUTE]",
  // P0 media identity SSOT enforcement proof
  "[P0_MEDIA_IDENTITY]",
  // P0 auth/onboarding jitter stabilization proof
  "[P0_AUTH_JITTER]",
  // P0 modal transition guard proof
  "[P0_MODAL_GUARD]",
  // P1 suggestions deck (daily ideas card generation)
  "[P1_SUGGESTIONS_DECK]",
  // P1 ideas engine (deterministic idea-card generator)
  "[P1_IDEAS_ENGINE]",
  // P0 ideas boot (first-load readiness proof)
  "[P0_IDEAS_BOOT]",
  // P1 ideas card (media variant rendered)
  "[P1_IDEAS_CARD]",
  // P2 ideas recency decay (exposure-based score penalty)
  "[P2_RECENCY_DECAY]",
  // P2 ideas learning model (accept/dismiss bias)
  "[P2_LEARNING_MODEL]",
  // P2 ideas context boosts (time/social scoring)
  "[P2_CONTEXT_BOOSTS]",
  // P2 ideas habit engine (pattern reinforcement)
  "[P2_HABIT_ENGINE]",
  // P1 score breakdown (archetype scoring pipeline)
  "[P1_SCORE]",
  // P2 diversity merge (archetype interleave + entropy)
  "[P2_DIVERSITY]",
  // P2B seeded entropy (deterministic per-user per-day shuffle)
  "[P2B_SEEDED_ENTROPY]",
  // P3 archetype spacing (anti-streak greedy selector)
  "[P3_ARCHETYPE_SPACING]",
  // P3B confidence scoring (per-card confidence signal)
  "[P3B_CONFIDENCE]",
  // P4 session learning (next-day signals bias)
  "[P4_SESSION_LEARN]",
  // P4B rhythm shaping (day/hour-based archetype boosts)
  "[P4B_RHYTHM]",
  // P3C friend cooldown (same-friend spacing within window)
  "[P3C_FRIEND_COOLDOWN]",
  // P1 deck completion (end-of-deck UX surface)
  "[P1_DECK_COMPLETE]",
  // P1 microcopy intelligence (accept/dismiss feedback)
  "[P1_MICROCOPY]",
  // P1 ideas completion polish (reward + throttle + people hint)
  "[P1_IDEAS_POLISH]",
  // P1 idea debugger (DEV-only score overlay)
  "[P1_IDEA_DEBUGGER]",
  // P1 draft message variants (cycling composer prefills)
  "[P1_DRAFT_VARIANTS]",
  // P0 push two-ended proof (logout/login re-registration + stale refresh)
  "[P0_PUSH_TWO_ENDED]",
  // P1 create-event circle error receipts
  "[P1_CREATE_EVENT_CIRCLE_ERR]",
  // P1 circle staleness self-heal (focus + foreground + push)
  "[P1_CIRCLE_STALENESS]",
  // P0 circle list refresh contract (SSOT freshness)
  "[P0_CIRCLE_LIST_REFRESH]",
  // P0 realtime reconcile contract (push → server truth)
  "[P0_RECONCILE]",
  // P0 optimistic proof (mutation convergence / rollback)
  "[P0_OPTIMISTIC]",
  // P0 agent session tagging (concurrent agent tracing)
  "[P0_AGENT]",
  // P0 push/me activeCount SSOT decision proof
  "[P0_PUSH_ME_TRUTH]",
  // P0 convergence timeline (push → invalidate → refetch → UI)
  "[P0_TIMELINE]",
  // P0 logout deactivate order proof (numbered step audit)
  "[P0_LOGOUT_DEACTIVATE_ORDER]",
  // P0 login re-register proof (push reg decision on authed)
  "[P0_LOGIN_RE_REGISTER]",
  // Ideas anti-repeat (category-level consecutive-card prevention)
  "[IDEAS_ANTI_REPEAT]",
  // P0 action feedback proof (optimistic/success/error + durationMs)
  "[ACTION_FEEDBACK]",
  // P0 live refresh proof harness (trigger + anti-storm)
  "[LIVE_REFRESH]",
  "[LIVE_REFRESH_GUARD]",
  "[LIVE_REFRESH_STORM]",
  // P1 hosting quota backend fetch proof
  "[P1_HOSTING_QUOTA]",
  // P1 hosting quota UI indicator (create screen)
  "[P1_HOSTING_QUOTA_UI]",
  // P1 hosting nudge: soft banner (2/3 threshold)
  "[P1_HOSTING_NUDGE]",
  // P1 hosting nudge: soft banner (compat alias)
  "[P1_HOSTING_QUOTA_NUDGE]",
  // P1 hosting gate: hard paywall gate on submit
  "[P1_HOSTING_GATE]",
  // P1 hosting invariant (isUnlimited + nudgeMeta conflict)
  "[P1_HOSTING_INVARIANT]",
  // P0 premium status contract (SSOT proof)
  "[P0_PREMIUM_CONTRACT]",
  // P0 premium drift guard (cross-contract consistency)
  "[P0_PREMIUM_DRIFT_GUARD]",
  "[P0_PREMIUM_DRIFT_VIOLATION]",
  // P0 premium paywall decision (submit-time gate proof)
  "[P0_PREMIUM_PAYWALL_DECISION]",
  // P0 request-id client-side propagation proof
  "[P0_REQID_CLIENT]",
  // P0 net gate (authed-only query prevention)
  "[P0_NET_GATE]",
  // P0 idempotency client (pending-retry proof)
  "[P0_IDEMPOTENCY_CLIENT]",
  // P0 single-flight guard (double-submit prevention)
  "[P0_SINGLEFLIGHT]",
  // P0 WebSocket realtime client (connect/disconnect/retry/rooms/backpressure)
  "[P0_WS_CLIENT]",
  // P0 WebSocket degraded mode (kill switch flap detection)
  "[P0_WS_DEGRADED]",
  // P0 WebSocket typing indicator (send/recv)
  "[P0_WS_TYPING_UI]",
  // P0 WS read horizon apply (remote horizon → unread cache update)
  "[P0_WS_READ_APPLY]",
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

// ═══ Noise-reduction helpers (DEV-only, no-op in PROD) ═══

/** Keys that have already been logged this session (tag + key). */
const _onceKeys = new Set<string>();

/**
 * DEV-only: log once per app session for a given (tag, key) pair.
 * Subsequent calls with the same pair are silently dropped.
 * No-op in PROD.
 */
export function devLogOnce(tag: string, key: string, ...args: unknown[]): void {
  if (!__DEV__) return;
  const compound = `${tag}::${key}`;
  if (_onceKeys.has(compound)) return;
  _onceKeys.add(compound);
  devLog(tag, key, ...args);
}

/** Last-emit timestamps keyed by (tag + key). */
const _throttleTs = new Map<string, number>();

/**
 * DEV-only: log at most once per `windowMs` for a given (tag, key) pair.
 * Calls within the window are silently dropped.
 * No-op in PROD.
 */
export function devLogThrottle(tag: string, key: string, windowMs: number, ...args: unknown[]): void {
  if (!__DEV__) return;
  const compound = `${tag}::${key}`;
  const now = Date.now();
  const last = _throttleTs.get(compound) ?? 0;
  if (now - last < windowMs) return;
  _throttleTs.set(compound, now);
  devLog(tag, key, ...args);
}
