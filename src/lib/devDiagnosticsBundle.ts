/**
 * DEV-only diagnostics bundle builder.
 * Collects push receipts, query receipts, device info, and session identifiers
 * into a single JSON string ready for clipboard export.
 *
 * Tag: [P0_DIAG_BUNDLE]
 * NO-OP in production builds.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { getAllReceipts, type PushReceipt } from "@/lib/push/pushReceiptStore";
import { DEV_AGENT_ID } from "@/lib/devAgentSession";
import { devLog } from "@/lib/devLog";

export interface DiagnosticsBundle {
  exportedAt: string;
  device: {
    platform: string;
    osVersion: string;
    appVersion: string;
  };
  session: {
    devAgentId: string | null;
    userId: string | null;
    email: string | null;
  };
  pushReceipts: PushReceipt[];
  queryReceipts: PushReceipt[];
}

/**
 * Build a complete diagnostics bundle from persisted stores.
 *
 * @param userId  Current user ID (from session), or null.
 * @param email   Current user email (from session), or null.
 */
export async function buildDiagnosticsBundle(
  userId: string | null,
  email: string | null,
): Promise<DiagnosticsBundle> {
  if (!__DEV__) {
    return {
      exportedAt: new Date().toISOString(),
      device: { platform: "", osVersion: "", appVersion: "" },
      session: { devAgentId: null, userId: null, email: null },
      pushReceipts: [],
      queryReceipts: [],
    };
  }

  const allReceipts = await getAllReceipts();

  const pushReceipts = allReceipts.filter(
    (r) => r.kind !== "query_invalidate" && r.kind !== "query_refetch",
  );

  const queryReceipts = allReceipts.filter(
    (r) => r.kind === "query_invalidate" || r.kind === "query_refetch",
  );

  const bundle: DiagnosticsBundle = {
    exportedAt: new Date().toISOString(),
    device: {
      platform: `${Platform.OS} ${Platform.Version}`,
      osVersion: String(Platform.Version),
      appVersion: Constants.expoConfig?.version ?? "unknown",
    },
    session: {
      devAgentId: DEV_AGENT_ID,
      userId,
      email,
    },
    pushReceipts,
    queryReceipts,
  };

  devLog("[P0_DIAG_BUNDLE]", {
    pushCount: pushReceipts.length,
    queryCount: queryReceipts.length,
    totalReceipts: allReceipts.length,
  });

  return bundle;
}
