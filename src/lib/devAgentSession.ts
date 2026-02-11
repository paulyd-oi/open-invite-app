/**
 * DEV-only Agent Session Tagging
 *
 * Generates a unique agent ID per session so concurrent agent edits
 * are visible, traceable, and merge-safe in DEV console logs.
 *
 * In PROD this is a complete no-op (null / early-return).
 */

import { devLog } from "@/lib/devLog";

export const DEV_AGENT_ID =
  __DEV__ ? `agent_${Date.now().toString(36)}` : null;

export function logAgentAction(tag: string, payload?: Record<string, unknown>) {
  if (!__DEV__) return;
  devLog("[P0_AGENT]", {
    agent: DEV_AGENT_ID,
    tag,
    ...payload,
  });
}
