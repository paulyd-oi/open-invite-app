import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { devLog } from "@/lib/devLog";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UseHostingNudgeOptions {
  userId: string | undefined;
  userIsPro: boolean;
  entitlementsLoading: boolean;
  premiumIsFetching: boolean;
  hostingQuota: {
    isLoading: boolean;
    isFetching: boolean;
    error: unknown;
    isUnlimited: boolean;
    eventsUsed: number;
    monthlyLimit: number | null;
    nudgeMeta: { shouldNudgeNow: boolean } | null | undefined;
  };
}

export function useHostingNudge({
  userId,
  userIsPro,
  entitlementsLoading,
  premiumIsFetching,
  hostingQuota,
}: UseHostingNudgeOptions) {
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const nudgeCheckedRef = useRef(false);

  const nudgeMonthKey = useMemo(() => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }, []);

  const nudgeStorageKey = useMemo(() => {
    if (!userId) return null;
    return `oi:hosting_nudge_dismissed:${userId}:${nudgeMonthKey}`;
  }, [userId, nudgeMonthKey]);

  // Check dismiss state on mount
  useEffect(() => {
    if (nudgeCheckedRef.current || !nudgeStorageKey) return;
    nudgeCheckedRef.current = true;
    (async () => {
      try {
        const val = await AsyncStorage.getItem(nudgeStorageKey);
        if (val === "1") setNudgeDismissed(true);
      } catch {
        // fail-open: show banner if read fails
      }
    })();
  }, [nudgeStorageKey]);

  const handleNudgeDismiss = useCallback(async () => {
    setNudgeDismissed(true);
    if (__DEV__) {
      devLog("[P1_HOSTING_NUDGE]", { action: "dismiss", monthKey: nudgeMonthKey });
    }
    if (nudgeStorageKey) {
      try {
        await AsyncStorage.setItem(nudgeStorageKey, "1");
      } catch {
        // non-critical
      }
    }
  }, [nudgeStorageKey, nudgeMonthKey]);

  // ── [P1_HOSTING_NUDGE] Soft nudge: driven by backend nudgeMeta ──
  // Premium/unlimited: NEVER nudge. Loading/fetching/error: fail-open (no nudge).
  // nudgeMeta.shouldNudgeNow is the SSOT for threshold logic.
  const showNudgeBanner = useMemo(() => {
    // Premium suppression — usePremiumStatusContract is SSOT
    if (userIsPro) return false;
    // Fail-open: any loading/fetching/error → no nudge
    if (entitlementsLoading || premiumIsFetching) return false;
    if (hostingQuota.isLoading || hostingQuota.isFetching) return false;
    if (hostingQuota.error) return false;
    // Unlimited plans → no nudge
    if (hostingQuota.isUnlimited) return false;
    // Backend SSOT: nudgeMeta drives threshold logic
    if (!hostingQuota.nudgeMeta || !hostingQuota.nudgeMeta.shouldNudgeNow) return false;
    // User dismissed for this month
    if (nudgeDismissed) return false;
    return true;
  }, [
    userIsPro,
    entitlementsLoading,
    premiumIsFetching,
    hostingQuota.isLoading,
    hostingQuota.isFetching,
    hostingQuota.error,
    hostingQuota.isUnlimited,
    hostingQuota.nudgeMeta,
    nudgeDismissed,
  ]);

  // [P1_HOSTING_NUDGE] DEV proof log
  useEffect(() => {
    if (!__DEV__ || hostingQuota.isLoading || entitlementsLoading) return;
    devLog("[P1_HOSTING_NUDGE]", {
      action: showNudgeBanner ? "shown" : "suppressed",
      eventsUsed: hostingQuota.eventsUsed,
      monthlyLimit: hostingQuota.monthlyLimit,
      proSuppressed: userIsPro,
      unlimitedSuppressed: hostingQuota.isUnlimited,
      dismissed: nudgeDismissed,
    });
  }, [
    showNudgeBanner,
    hostingQuota.isLoading,
    entitlementsLoading,
    hostingQuota.eventsUsed,
    hostingQuota.monthlyLimit,
    userIsPro,
    hostingQuota.isUnlimited,
    nudgeDismissed,
  ]);

  return {
    showNudgeBanner,
    handleNudgeDismiss,
    nudgeMonthKey,
  };
}
