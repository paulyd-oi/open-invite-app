/**
 * LiveRefreshProofOverlay - DEV-only floating panel showing live-refresh diagnostics.
 *
 * Displays per-screen: last trigger, last timestamp, total count, anti-storm counters.
 * Includes a "Force refresh all" button that fires all registered refetch functions.
 *
 * Mounted alongside QueryDebugOverlay in _layout.tsx, gated by __DEV__.
 * Zero production impact (never imported in prod builds).
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import {
  getRecords,
  getCounters,
  subscribe,
  forceRefreshAllScreens,
  type ScreenRefreshRecord,
  type AntiStormCounters,
} from "@/lib/liveRefreshProofStore";

// -- Helpers --------------------------------------------------------------

const SCREENS = ["discover", "social", "calendar", "friends"] as const;

function formatTs(ts: number): string {
  if (ts === 0) return "\u2014";
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return hh + ":" + mm + ":" + ss;
}

function triggerColor(trigger: string | null): string {
  if (!trigger) return "#666";
  switch (trigger) {
    case "manual":
      return "#51CF66";
    case "foreground":
      return "#FFD43B";
    case "focus":
      return "#74C0FC";
    default:
      return "#888";
  }
}

function triggerLabel(trigger: string | null): string {
  if (!trigger) return "\u2014";
  return trigger.charAt(0).toUpperCase() + trigger.slice(1);
}

// -- Component ------------------------------------------------------------

export default function LiveRefreshProofOverlay() {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState<Record<string, ScreenRefreshRecord>>(
    {},
  );
  const [counters, setCounters] = useState<
    Record<string, AntiStormCounters>
  >({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    setRecords({ ...getRecords() });
    setCounters({ ...getCounters() });
  }, []);

  // Subscribe to store changes
  useEffect(() => {
    const unsub = subscribe(refresh);
    return unsub;
  }, [refresh]);

  // Periodic refresh when expanded (for timestamp age updates)
  useEffect(() => {
    if (expanded) {
      refresh();
      intervalRef.current = setInterval(refresh, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [expanded, refresh]);

  if (!expanded) {
    return (
      <Pressable
        style={styles.pill}
        onPress={() => setExpanded(true)}
        accessibilityLabel="Open live refresh proof overlay"
      >
        <Text style={styles.pillText}>LR</Text>
      </Pressable>
    );
  }

  const totalAll = SCREENS.reduce(
    (sum, s) => sum + (records[s]?.totalCount ?? 0),
    0,
  );

  return (
    <View style={styles.overlay}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Live Refresh Proof</Text>
        <Pressable onPress={() => setExpanded(false)} hitSlop={12}>
          <Text style={styles.close}>{"\u2715"}</Text>
        </Pressable>
      </View>

      {/* Column headers */}
      <View style={styles.colHeaders}>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text style={[styles.colH, { flex: 1 }]}>Screen</Text>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text style={[styles.colH, { width: 52 }]}>Trigger</Text>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text style={[styles.colH, { width: 52 }]}>Time</Text>
        {/* INVARIANT_ALLOW_INLINE_OBJECT_PROP */}
        <Text style={[styles.colH, { width: 26, textAlign: "right" }]}>#</Text>
      </View>

      {/* Per-screen rows */}
      {SCREENS.map((screen) => {
        const rec = records[screen];
        const ctr = counters[screen];
        const hasStorm =
          (ctr?.focusInCurrentSession ?? 0) > 1 ||
          (ctr?.foregroundIn30s ?? 0) > 3;

        return (
          <View key={screen} style={styles.row}>
            <Text
              style={[styles.screenName, hasStorm && styles.stormText]}
              numberOfLines={1}
            >
              {screen}
            </Text>
            <View
              style={[
                styles.triggerBadge,
                // INVARIANT_ALLOW_INLINE_OBJECT_PROP
                {
                  backgroundColor:
                    triggerColor(rec?.lastTrigger ?? null) + "22",
                },
              ]}
            >
              <Text
                style={[
                  styles.triggerText,
                  // INVARIANT_ALLOW_INLINE_OBJECT_PROP
                  { color: triggerColor(rec?.lastTrigger ?? null) },
                ]}
              >
                {triggerLabel(rec?.lastTrigger ?? null)}
              </Text>
            </View>
            <Text style={styles.timestamp}>
              {formatTs(rec?.lastTimestamp ?? 0)}
            </Text>
            <Text style={styles.count}>{rec?.totalCount ?? 0}</Text>
          </View>
        );
      })}

      {/* Anti-storm summary */}
      {SCREENS.some((s) => {
        const ctr = counters[s];
        return (
          (ctr?.focusInCurrentSession ?? 0) > 1 ||
          (ctr?.foregroundIn30s ?? 0) > 3
        );
      }) && (
        <View style={styles.stormBanner}>
          <Text style={styles.stormBannerText}>
            {"\u26A0"} Storm detected
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.totalText}>Total: {totalAll}</Text>
        <Pressable style={styles.forceBtn} onPress={forceRefreshAllScreens}>
          <Text style={styles.forceBtnText}>{"\u27F3"} Force All</Text>
        </Pressable>
      </View>
    </View>
  );
}

// -- Styles ---------------------------------------------------------------

const { width: SCREEN_W } = Dimensions.get("window");
const OVERLAY_W = Math.min(280, SCREEN_W - 32);

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    bottom: 160,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99999,
  },
  pillText: {
    color: "#74C0FC",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  overlay: {
    position: "absolute",
    bottom: 160,
    right: 12,
    width: OVERLAY_W,
    backgroundColor: "rgba(20,20,20,0.94)",
    borderRadius: 12,
    padding: 10,
    zIndex: 99999,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  close: {
    color: "#888",
    fontSize: 16,
    fontWeight: "600",
  },
  colHeaders: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    paddingBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  colH: {
    color: "#666",
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  screenName: {
    color: "#ccc",
    fontSize: 10,
    flex: 1,
    fontFamily: "monospace",
  },
  triggerBadge: {
    width: 52,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    alignItems: "center",
  },
  triggerText: {
    fontSize: 9,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  timestamp: {
    color: "#888",
    fontSize: 10,
    width: 52,
    textAlign: "center",
    fontFamily: "monospace",
  },
  count: {
    color: "#aaa",
    fontSize: 10,
    width: 26,
    textAlign: "right",
    fontFamily: "monospace",
    fontWeight: "600",
  },
  stormText: {
    color: "#FF6B6B",
  },
  stormBanner: {
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,107,107,0.15)",
    borderRadius: 4,
    alignItems: "center",
  },
  stormBannerText: {
    color: "#FF6B6B",
    fontSize: 10,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  totalText: {
    color: "#888",
    fontSize: 10,
    fontFamily: "monospace",
  },
  forceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(116,192,252,0.15)",
  },
  forceBtnText: {
    color: "#74C0FC",
    fontSize: 10,
    fontWeight: "700",
  },
});
