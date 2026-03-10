/**
 * devFlags.ts — SSOT for DEV-only feature flags.
 *
 * Probe logging (layout jump probes, network auth gate diagnostics)
 * is OFF by default to keep Metro console quiet.
 * Flip the flag to `true` to re-enable during active debugging.
 *
 * Usage: import { DEV_PROBES_ENABLED } from '@/lib/devFlags';
 *        if (DEV_PROBES_ENABLED) devLog('[P0_LAYOUT_JUMP_PROBE]', ...);
 *
 * Tags controlled:
 *   [P0_LAYOUT_JUMP_PROBE]
 *   [P0_WELCOME_JUMP_PROBE]
 *   [P0_POST_LOGOUT_NET]
 */

// eslint-disable-next-line no-constant-binary-expression
export const DEV_PROBES_ENABLED = __DEV__ && false;

/**
 * Show dev debug overlays (QueryDebugOverlay, LiveRefreshProofOverlay).
 * OFF by default — flip to `true` when actively debugging query freshness.
 * These overlays are always tree-shaken from production builds via __DEV__,
 * but this flag prevents them from appearing in Expo Go / dev client.
 */
// eslint-disable-next-line no-constant-binary-expression
export const DEV_OVERLAYS_VISIBLE = __DEV__ && false;
