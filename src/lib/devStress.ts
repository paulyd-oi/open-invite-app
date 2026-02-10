/**
 * devStress.ts — DEV-only logic stress harness (P19).
 *
 * Provides chaos injection for network requests, invariant simulation,
 * and mutation race testing. All exports are no-ops in production.
 *
 * Env toggles (all require __DEV__):
 *   EXPO_PUBLIC_DEV_STRESS_ENABLE=1        master switch
 *   EXPO_PUBLIC_DEV_STRESS_NET_MODE=flaky   off|slow|flaky|offline|timeout|http500
 *   EXPO_PUBLIC_DEV_STRESS_RATE=0.15        flaky failure probability [0-1]
 *   EXPO_PUBLIC_DEV_STRESS_DELAY_MS=800     slow-mode delay / flaky jitter ceiling (ms)
 *   EXPO_PUBLIC_DEV_STRESS_INVARIANTS=1     fire synthetic invariant signals
 *   EXPO_PUBLIC_DEV_STRESS_MUTATION_RACE=1  double-fire mutations
 *   EXPO_PUBLIC_DEV_STRESS_SCENARIO=1       timed scenario runner (mode sequence after boot)
 *
 * Canonical tags:
 *   [STRESS_NET]      — network chaos intercepts
 *   [STRESS_MUT]      — mutation race outcomes
 *   [STRESS_INVAR]    — synthetic invariant triggers
 *   [STRESS_SCENARIO] — scenario runner phase transitions
 */
import { devLog } from "@/lib/devLog";

// ─── Types ──────────────────────────────────────────────────────
type NetMode = "off" | "slow" | "flaky" | "offline" | "timeout" | "http500";

interface StressConfig {
  netMode: NetMode;
  rate: number;
  delayMs: number;
  invariants: boolean;
  mutationRace: boolean;
  scenario: boolean;
}

interface FailResult {
  block: boolean;
  reason?: string;
  syntheticStatus?: number;
}

// ─── Dedup sets (module-scoped) ─────────────────────────────────
const _onceKeys = new Set<string>();
const _raceLabels = new Set<string>();
let _invariantsFired = false;
let _enableLogFired = false;
let _scenarioStarted = false;

// Runtime override for net mode (used by scenario runner)
let _netModeOverride: NetMode | null = null;

// ─── Exempt paths (never chaos'd) ──────────────────────────────
function isExemptPath(pathname: string): boolean {
  return pathname.startsWith("/api/auth/") || pathname === "/api/health";
}

// ─── Config readers ─────────────────────────────────────────────

/** Master switch: DEV + EXPO_PUBLIC_DEV_STRESS_ENABLE=1 */
export function isDevStressEnabled(): boolean {
  if (!__DEV__) return false;
  return process.env.EXPO_PUBLIC_DEV_STRESS_ENABLE === "1";
}

/** Read full config from env. All defaults are safe (off / no-op). */
export function getDevStressConfig(): StressConfig {
  const raw = (process.env.EXPO_PUBLIC_DEV_STRESS_NET_MODE ?? "off") as string;
  const validModes: NetMode[] = ["off", "slow", "flaky", "offline", "timeout", "http500"];
  const netMode: NetMode = validModes.includes(raw as NetMode) ? (raw as NetMode) : "off";

  return {
    netMode: _netModeOverride ?? netMode,
    rate: Math.min(1, Math.max(0, parseFloat(process.env.EXPO_PUBLIC_DEV_STRESS_RATE ?? "0.15"))),
    delayMs: parseInt(process.env.EXPO_PUBLIC_DEV_STRESS_DELAY_MS ?? "800", 10) || 800,
    invariants: process.env.EXPO_PUBLIC_DEV_STRESS_INVARIANTS === "1",
    mutationRace: process.env.EXPO_PUBLIC_DEV_STRESS_MUTATION_RACE === "1",
    scenario: process.env.EXPO_PUBLIC_DEV_STRESS_SCENARIO === "1",
  };
}

// ─── Network chaos ──────────────────────────────────────────────

/** Delay helper for slow + flaky modes. No-op unless enabled. */
export async function maybeDelay(): Promise<void> {
  if (!isDevStressEnabled()) return;
  const cfg = getDevStressConfig();
  if (cfg.netMode === "slow") {
    await new Promise((r) => setTimeout(r, cfg.delayMs));
  } else if (cfg.netMode === "flaky") {
    // Jittered delay: random 0..delayMs to simulate real-world variance
    const jitter = Math.floor(Math.random() * cfg.delayMs);
    if (jitter > 0) await new Promise((r) => setTimeout(r, jitter));
  }
}

/**
 * Evaluate whether to block a request. Safe no-op when disabled.
 * Never blocks /api/auth/* or /api/health.
 */
export function maybeFailRequest(pathname: string, method: string): FailResult {
  if (!isDevStressEnabled()) return { block: false };
  if (isExemptPath(pathname)) return { block: false };

  const cfg = getDevStressConfig();

  // One-time enable proof log
  if (!_enableLogFired) {
    _enableLogFired = true;
    devLog("[STRESS_NET]", {
      enabled: true,
      mode: cfg.netMode,
      rate: cfg.rate,
      delayMs: cfg.delayMs,
    });
  }

  switch (cfg.netMode) {
    case "off":
    case "slow": // slow only delays, doesn't block
      return { block: false };

    case "offline":
      devLog("[STRESS_NET]", { mode: "offline", path: pathname, method, reason: "offline" });
      return { block: true, reason: "offline" };

    case "timeout":
      devLog("[STRESS_NET]", { mode: "timeout", path: pathname, method, reason: "timeout" });
      return { block: true, reason: "timeout" };

    case "http500":
      devLog("[STRESS_NET]", { mode: "http500", path: pathname, method, reason: "http500", syntheticStatus: 500 });
      return { block: true, syntheticStatus: 500 };

    case "flaky": {
      const roll = Math.random();
      if (roll < cfg.rate) {
        devLog("[STRESS_NET]", { mode: "flaky", path: pathname, method, reason: "timeout", roll: roll.toFixed(3) });
        return { block: true, reason: "timeout" };
      }
      return { block: false };
    }

    default:
      return { block: false };
  }
}

// ─── Mutation race tester ───────────────────────────────────────

/**
 * Run `fn` twice concurrently (DEV-only, enabled via env).
 * Returns first successful result. If both fail, throws first error.
 * Deduplicates per label per app run.
 */
export async function wrapRace<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!__DEV__ || !isDevStressEnabled()) return fn();

  const cfg = getDevStressConfig();
  if (!cfg.mutationRace) return fn();

  // Dedup: only race once per label per app run
  if (_raceLabels.has(label)) return fn();
  _raceLabels.add(label);

  devLog("[STRESS_MUT]", { label, action: "race_start" });

  const resultA = fn().then(
    (v) => ({ ok: true as const, value: v }),
    (e) => ({ ok: false as const, error: e }),
  );
  const resultB = fn().then(
    (v) => ({ ok: true as const, value: v }),
    (e) => ({ ok: false as const, error: e }),
  );

  const [a, b] = await Promise.all([resultA, resultB]);

  devLog("[STRESS_MUT]", {
    label,
    outcomeA: a.ok ? "fulfilled" : "rejected",
    outcomeB: b.ok ? "fulfilled" : "rejected",
  });

  if (a.ok) return a.value;
  if (b.ok) return b.value;
  throw a.error;
}

// ─── Invariant simulation ───────────────────────────────────────

/**
 * Fire synthetic invariant signals once per app run (DEV-only).
 * Safe no-op when disabled. No side effects beyond logging.
 */
export function maybeTriggerInvariantsOnce(): void {
  if (!__DEV__ || !isDevStressEnabled()) return;

  const cfg = getDevStressConfig();
  if (!cfg.invariants) return;
  if (_invariantsFired) return;
  _invariantsFired = true;

  devLog("[STRESS_INVAR]", { kind: "P15_AUTH_SAMPLE", detail: "synthetic session/bootStatus mismatch probe" });
  devLog("[STRESS_INVAR]", { kind: "P15_NET_SAMPLE", detail: "synthetic authed fetch without cookie probe" });
  devLog("[STRESS_INVAR]", { kind: "P16_API_SAMPLE", detail: "synthetic null response probe" });

  // Try P16 validateApiContract if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateApiContract } = require("@/lib/apiContractInvariant");
    if (typeof validateApiContract === "function") {
      validateApiContract("/api/stress/sample", null);
    }
  } catch {
    // P16 module not found — skip gracefully
  }
}

// ─── Scenario runner ────────────────────────────────────────────

/** Timed scenario phases: [mode, durationMs] */
const SCENARIO_PHASES: [NetMode, number][] = [
  ["slow", 5_000],
  ["flaky", 8_000],
  ["offline", 3_000],
  ["http500", 3_000],
  ["timeout", 3_000],
  ["off", 0], // terminal — restores normal operation
];

/**
 * Run a timed sequence of chaos modes after boot (DEV-only).
 * Requires EXPO_PUBLIC_DEV_STRESS_ENABLE=1 AND EXPO_PUBLIC_DEV_STRESS_SCENARIO=1.
 * Safe no-op otherwise. Runs once per app lifecycle.
 * Always restores netMode to "off" at the end.
 */
export function maybeRunScenarioOnce(): void {
  if (!__DEV__ || !isDevStressEnabled()) return;
  if (!getDevStressConfig().scenario) return;
  if (_scenarioStarted) return;
  _scenarioStarted = true;

  devLog("[STRESS_SCENARIO]", {
    action: "start",
    phases: SCENARIO_PHASES.map(([mode, ms]) => `${mode}:${ms}ms`),
  });

  let elapsed = 0;
  SCENARIO_PHASES.forEach(([mode, durationMs], idx) => {
    setTimeout(() => {
      _netModeOverride = mode === "off" ? null : mode;
      devLog("[STRESS_SCENARIO]", {
        action: "phase_transition",
        phase: idx + 1,
        mode,
        durationMs,
        elapsedMs: elapsed,
      });
    }, elapsed);
    elapsed += durationMs;
  });

  // Safety: always restore to off after all phases complete
  setTimeout(() => {
    _netModeOverride = null;
    devLog("[STRESS_SCENARIO]", { action: "complete", totalMs: elapsed });
  }, elapsed + 100);
}
