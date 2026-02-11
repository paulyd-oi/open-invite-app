/**
 * P0_QUERY_STALENESS_VISUALIZER
 *
 * DEV-only floating overlay that shows real-time query freshness state.
 * Monitors key circle + event queries and displays:
 *   - stale / fresh status
 *   - last dataUpdatedAt timestamp
 *   - current fetch status
 *
 * Rendered only when __DEV__ is true. Zero production impact.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { circleKeys } from "@/lib/circleQueryKeys";
import { eventKeys } from "@/lib/eventQueryKeys";

// ============================================================================
// TYPES
// ============================================================================

interface QueryRow {
  label: string;
  key: readonly string[];
}

interface QuerySnapshot {
  label: string;
  isStale: boolean;
  fetchStatus: string;
  dataUpdatedAt: number;
  dataAge: string;
}

// ============================================================================
// MONITORED KEYS
// ============================================================================

const WATCHED_KEYS: QueryRow[] = [
  { label: "circles.all", key: circleKeys.all() },
  { label: "circles.unread", key: circleKeys.unreadCount() },
  { label: "events.feed", key: eventKeys.feed() },
  { label: "events.calendar", key: eventKeys.calendar() },
  { label: "events.myEvents", key: eventKeys.myEvents() },
  { label: "friends", key: ["friends"] },
];

// ============================================================================
// HELPERS
// ============================================================================

function formatAge(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function QueryDebugOverlay() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [snapshots, setSnapshots] = useState<QuerySnapshot[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    const now = Date.now();
    const next = WATCHED_KEYS.map(({ label, key }) => {
      const state = queryClient.getQueryState(key as string[]);
      const updatedAt = state?.dataUpdatedAt ?? 0;
      return {
        label,
        isStale: state?.isInvalidated ?? true,
        fetchStatus: state?.fetchStatus ?? "idle",
        dataUpdatedAt: updatedAt,
        dataAge: formatAge(updatedAt > 0 ? now - updatedAt : 0),
      };
    });
    setSnapshots(next);
  }, [queryClient]);

  useEffect(() => {
    if (expanded) {
      refresh();
      intervalRef.current = setInterval(refresh, 2000);
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
        accessibilityLabel="Open query debug overlay"
      >
        <Text style={styles.pillText}>QD</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.title}>Query Debug</Text>
        <Pressable onPress={() => setExpanded(false)} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      {snapshots.map((s) => (
        <View key={s.label} style={styles.row}>
          <View
            style={[
              styles.dot,
              { backgroundColor: s.isStale ? "#FF6B6B" : "#51CF66" },
            ]}
          />
          <Text style={styles.label} numberOfLines={1}>
            {s.label}
          </Text>
          <Text style={styles.age}>{s.dataAge}</Text>
          <Text
            style={[
              styles.status,
              s.fetchStatus === "fetching" && styles.statusFetching,
            ]}
          >
            {s.fetchStatus === "fetching"
              ? "⟳"
              : s.isStale
                ? "stale"
                : "fresh"}
          </Text>
        </View>
      ))}

      <Pressable onPress={refresh} style={styles.refreshBtn}>
        <Text style={styles.refreshText}>↻ Refresh</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const { width: SCREEN_W } = Dimensions.get("window");
const OVERLAY_W = Math.min(260, SCREEN_W - 32);

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    bottom: 120,
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
    color: "#51CF66",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  overlay: {
    position: "absolute",
    bottom: 120,
    right: 12,
    width: OVERLAY_W,
    backgroundColor: "rgba(20,20,20,0.92)",
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  label: {
    color: "#ccc",
    fontSize: 10,
    flex: 1,
    fontFamily: "monospace",
  },
  age: {
    color: "#888",
    fontSize: 10,
    marginHorizontal: 6,
    fontFamily: "monospace",
    minWidth: 24,
    textAlign: "right",
  },
  status: {
    color: "#888",
    fontSize: 10,
    minWidth: 34,
    textAlign: "right",
    fontFamily: "monospace",
  },
  statusFetching: {
    color: "#FFD43B",
  },
  refreshBtn: {
    marginTop: 6,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  refreshText: {
    color: "#aaa",
    fontSize: 10,
    fontWeight: "600",
  },
});
