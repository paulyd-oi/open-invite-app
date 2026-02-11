/**
 * liveRefreshProofStore - DEV-only in-memory store for live-refresh proof harness.
 *
 * Module-scoped singleton: no React context, no deps, no persistence.
 * useLiveRefreshContract reports into this store on every trigger.
 * The LiveRefreshProofOverlay reads it on an interval.
 *
 * PRODUCTION: every export is a no-op or returns safe defaults.
 */

// -- Types ----------------------------------------------------------------

export type RefreshTrigger = "manual" | "foreground" | "focus";

export interface ScreenRefreshRecord {
  /** Last trigger type */
  lastTrigger: RefreshTrigger | null;
  /** Date.now() of last trigger */
  lastTimestamp: number;
  /** Total refresh count since app start */
  totalCount: number;
}

export interface AntiStormCounters {
  /** Focus triggers in current focus session (should be <=1) */
  focusInCurrentSession: number;
  /** Foreground triggers in last 30 s window */
  foregroundIn30s: number;
  /** Timestamps of foreground triggers (rolling window) */
  foregroundTimestamps: number[];
  /** Whether a storm warning has fired */
  stormWarningFired: boolean;
}

// -- Constants ------------------------------------------------------------

const SCREEN_NAMES = ["discover", "social", "calendar", "friends"] as const;
export type ScreenName = (typeof SCREEN_NAMES)[number];

const FOREGROUND_STORM_WINDOW_MS = 30_000;
const FOREGROUND_STORM_THRESHOLD = 3;

// -- Store (module-scoped) ------------------------------------------------

function makeEmptyRecord(): ScreenRefreshRecord {
  return { lastTrigger: null, lastTimestamp: 0, totalCount: 0 };
}

function makeEmptyCounters(): AntiStormCounters {
  return {
    focusInCurrentSession: 0,
    foregroundIn30s: 0,
    foregroundTimestamps: [],
    stormWarningFired: false,
  };
}

/** Per-screen refresh records */
const records: Record<string, ScreenRefreshRecord> = {};
/** Per-screen anti-storm counters */
const counters: Record<string, AntiStormCounters> = {};
/** Listeners notified on every record change */
const listeners = new Set<() => void>();

// Initialize all screens
for (const name of SCREEN_NAMES) {
  records[name] = makeEmptyRecord();
  counters[name] = makeEmptyCounters();
}

// -- Public API -----------------------------------------------------------

/**
 * Called by useLiveRefreshContract on every trigger (DEV only).
 * Returns { stormWarning } if anti-storm threshold breached.
 */
export function reportRefresh(
  screen: string,
  trigger: RefreshTrigger,
): { stormWarning: string | null } {
  if (!__DEV__) return { stormWarning: null };

  const now = Date.now();

  // Update record
  if (!records[screen]) records[screen] = makeEmptyRecord();
  const rec = records[screen];
  rec.lastTrigger = trigger;
  rec.lastTimestamp = now;
  rec.totalCount += 1;

  // Update anti-storm counters
  if (!counters[screen]) counters[screen] = makeEmptyCounters();
  const ctr = counters[screen];
  let stormWarning: string | null = null;

  if (trigger === "focus") {
    ctr.focusInCurrentSession += 1;
    if (ctr.focusInCurrentSession > 1) {
      stormWarning =
        "[LIVE_REFRESH_STORM] " + screen + " focus fired " +
        ctr.focusInCurrentSession + "x in one focus session";
    }
  }

  if (trigger === "foreground") {
    ctr.foregroundTimestamps = ctr.foregroundTimestamps.filter(
      (ts) => now - ts < FOREGROUND_STORM_WINDOW_MS,
    );
    ctr.foregroundTimestamps.push(now);
    ctr.foregroundIn30s = ctr.foregroundTimestamps.length;

    if (
      ctr.foregroundIn30s > FOREGROUND_STORM_THRESHOLD &&
      !ctr.stormWarningFired
    ) {
      stormWarning =
        "[LIVE_REFRESH_STORM] " + screen + " foreground fired " +
        ctr.foregroundIn30s + "x in 30s (threshold: " +
        FOREGROUND_STORM_THRESHOLD + ")";
      ctr.stormWarningFired = true;
    }
  }

  // Notify UI listeners
  listeners.forEach((fn) => fn());

  return { stormWarning };
}

/**
 * Reset focus counter for a screen (called when screen blurs).
 */
export function resetFocusCounter(screen: string): void {
  if (!__DEV__) return;
  if (counters[screen]) {
    counters[screen].focusInCurrentSession = 0;
  }
}

/**
 * Force-refresh all screens (DEV button).
 * Uses registered refetch functions from each screen hook instance.
 */
const registeredRefetchFns: Record<string, Array<() => unknown>> = {};

export function registerScreenRefetchFns(
  screen: string,
  fns: Array<() => unknown>,
): void {
  if (!__DEV__) return;
  registeredRefetchFns[screen] = fns;
}

export function forceRefreshAllScreens(): void {
  if (!__DEV__) return;
  for (const screen of Object.keys(registeredRefetchFns)) {
    const fns = registeredRefetchFns[screen];
    fns.forEach((fn) => {
      try {
        fn();
      } catch {
        // swallow
      }
    });
    reportRefresh(screen, "manual");
  }
}

/**
 * Read current state (for overlay).
 */
export function getRecords(): Record<string, ScreenRefreshRecord> {
  return records;
}

export function getCounters(): Record<string, AntiStormCounters> {
  return counters;
}

/**
 * Subscribe to store changes (for overlay re-render).
 */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
