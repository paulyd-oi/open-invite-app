import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { devLog } from "@/lib/devLog";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const BEST_TIME_PICK_KEY = "oi:bestTimePick";
const BEST_TIME_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * [P0_FIND_BEST_TIME_SSOT] Return-flow: on focus, pick up time selected in /whos-free
 * and apply to the create form via the provided setters.
 */
export function useBestTimePick(
  setStartDate: (d: Date) => void,
  setEndDate: (d: Date) => void,
) {
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        let raw: string | null = null;
        try {
          raw = await AsyncStorage.getItem(BEST_TIME_PICK_KEY);
        } catch {
          // read failed
        }
        try { await AsyncStorage.removeItem(BEST_TIME_PICK_KEY); } catch {}
        if (!raw || cancelled) return;
        try {
          const parsed = JSON.parse(raw) as { startISO?: string; endISO?: string; pickedAtMs?: number };
          const { startISO, endISO, pickedAtMs } = parsed;
          if (typeof startISO !== "string" || typeof endISO !== "string" || typeof pickedAtMs !== "number") {
            if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "invalid_shape", raw });
            return;
          }
          const ageMs = Date.now() - pickedAtMs;
          if (ageMs > BEST_TIME_TTL_MS) {
            if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "stale", ageMs, ttl: BEST_TIME_TTL_MS });
            return;
          }
          const pickedStart = new Date(startISO);
          const pickedEnd = new Date(endISO);
          if (isNaN(pickedStart.getTime()) || isNaN(pickedEnd.getTime())) {
            if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "bad_date", startISO, endISO });
            return;
          }
          setStartDate(pickedStart);
          setEndDate(pickedEnd);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (__DEV__) {
            devLog("[P0_FIND_BEST_TIME_SSOT] apply", { startISO, endISO, ageMs, decision: "applied" });
          }
        } catch {
          if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "parse_error" });
        }
      })();
      return () => { cancelled = true; };
    }, [setStartDate, setEndDate])
  );
}
