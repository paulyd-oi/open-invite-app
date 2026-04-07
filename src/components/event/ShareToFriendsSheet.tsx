/**
 * ShareToFriendsSheet — Send event to friends and circles via in-app chat.
 *
 * Multi-select bottom sheet with:
 *  - Search filter
 *  - Circles section (group circles only, no DMs)
 *  - Friends section (paginated)
 *  - Optional message input
 *  - Send button with loading state
 *
 * Sends `__system:event_share:{JSON}` as circle message content.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";

import BottomSheet from "@/components/BottomSheet";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { usePaginatedFriends } from "@/lib/usePaginatedFriends";
import { circleKeys } from "@/lib/circleQueryKeys";
import { api } from "@/lib/api";
import { postIdempotent } from "@/lib/idempotencyKey";
import { safeToast } from "@/lib/safeToast";
import { devLog } from "@/lib/devLog";
import { Search, Send, Check } from "@/ui/icons";
import type { Circle, GetCirclesResponse, Friendship } from "@/shared/contracts";

interface ShareToFriendsSheetProps {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  eventStartTime: string;
  eventEndTime?: string;
  eventEmoji?: string;
  eventPhotoUrl?: string | null;
  hostName: string;
  themeColor: string;
}

type SelectedTarget =
  | { type: "circle"; id: string; name: string }
  | { type: "friend"; friendId: string; name: string };

export function ShareToFriendsSheet({
  visible,
  onClose,
  eventId,
  eventTitle,
  eventStartTime,
  eventEndTime,
  eventEmoji,
  eventPhotoUrl,
  hostName,
  themeColor,
}: ShareToFriendsSheetProps) {
  const { colors, isDark } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedTarget[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // ── Data sources ──────────────────────────────────────────────
  const { data: circlesData } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: visible && isAuthedForNetwork(bootStatus, session),
  });

  const { data: friends, isLoading: friendsLoading } = usePaginatedFriends({
    enabled: visible && isAuthedForNetwork(bootStatus, session),
  });

  // Filter to group circles only (no DMs)
  const circles = useMemo(
    () => (circlesData?.circles ?? []).filter((c) => c.type !== "dm"),
    [circlesData],
  );

  // Search-filtered lists
  const searchLower = search.toLowerCase().trim();

  const filteredCircles = useMemo(
    () =>
      searchLower
        ? circles.filter((c) => c.name.toLowerCase().includes(searchLower))
        : circles,
    [circles, searchLower],
  );

  const filteredFriends = useMemo(
    () =>
      searchLower
        ? friends.filter((f) =>
            f.friend.name?.toLowerCase().includes(searchLower),
          )
        : friends,
    [friends, searchLower],
  );

  // ── Selection toggling ────────────────────────────────────────
  const isCircleSelected = useCallback(
    (id: string) => selected.some((s) => s.type === "circle" && s.id === id),
    [selected],
  );

  const isFriendSelected = useCallback(
    (friendId: string) =>
      selected.some((s) => s.type === "friend" && s.friendId === friendId),
    [selected],
  );

  const toggleCircle = useCallback(
    (circle: Circle) => {
      Haptics.selectionAsync();
      setSelected((prev) =>
        prev.some((s) => s.type === "circle" && s.id === circle.id)
          ? prev.filter((s) => !(s.type === "circle" && s.id === circle.id))
          : [...prev, { type: "circle", id: circle.id, name: circle.name }],
      );
    },
    [],
  );

  const toggleFriend = useCallback(
    (f: Friendship) => {
      Haptics.selectionAsync();
      setSelected((prev) =>
        prev.some((s) => s.type === "friend" && s.friendId === f.friendId)
          ? prev.filter(
              (s) => !(s.type === "friend" && s.friendId === f.friendId),
            )
          : [
              ...prev,
              { type: "friend", friendId: f.friendId, name: f.friend.name ?? "Friend" },
            ],
      );
    },
    [],
  );

  // ── Send handler ──────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (selected.length === 0 || sending) return;
    setSending(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const sharePayload = JSON.stringify({
      eventId,
      title: eventTitle,
      startTime: eventStartTime,
      endTime: eventEndTime,
      emoji: eventEmoji,
      eventPhotoUrl,
      hostName,
    });
    const systemContent = `__system:event_share:${sharePayload}`;

    let successCount = 0;
    const errors: string[] = [];

    for (const target of selected) {
      try {
        if (target.type === "circle") {
          // Send directly to group circle
          await postIdempotent(`/api/circles/${target.id}/messages`, {
            content: systemContent,
          });
          // Also send optional text message
          if (message.trim()) {
            await postIdempotent(`/api/circles/${target.id}/messages`, {
              content: message.trim(),
            });
          }
          successCount++;
        } else {
          // Friend — find or create DM circle, then send
          const dmResult = await api.post<{ circleId?: string; circle?: { id: string } }>(
            "/api/circles/dm",
            { targetUserId: target.friendId },
          );
          const dmCircleId = dmResult.circleId ?? dmResult.circle?.id;
          if (!dmCircleId) {
            errors.push(target.name);
            continue;
          }
          await postIdempotent(`/api/circles/${dmCircleId}/messages`, {
            content: systemContent,
          });
          if (message.trim()) {
            await postIdempotent(`/api/circles/${dmCircleId}/messages`, {
              content: message.trim(),
            });
          }
          successCount++;
        }
      } catch (err: any) {
        if (__DEV__) devLog("[EVENT_SHARE]", "send_error", { target, error: err?.message });
        errors.push(target.type === "circle" ? target.name : target.name);
      }
    }

    // Invalidate circle data so chat shows new messages
    queryClient.invalidateQueries({ queryKey: circleKeys.all() });

    setSending(false);

    if (successCount > 0) {
      const label = successCount === 1 ? "1 chat" : `${successCount} chats`;
      safeToast.success("Sent!", `Event shared to ${label}`);
    }
    if (errors.length > 0) {
      safeToast.error("Some failed", `Couldn't send to: ${errors.join(", ")}`);
    }

    // Reset and close
    setSelected([]);
    setMessage("");
    setSearch("");
    onClose();
  }, [selected, sending, eventId, eventTitle, eventStartTime, eventEndTime, eventEmoji, eventPhotoUrl, hostName, message, onClose, queryClient]);

  // ── Reset state when sheet closes ─────────────────────────────
  const handleClose = useCallback(() => {
    setSelected([]);
    setMessage("");
    setSearch("");
    onClose();
  }, [onClose]);

  // ── Combined list data ────────────────────────────────────────
  type ListItem =
    | { key: string; type: "section"; title: string }
    | { key: string; type: "circle"; circle: Circle }
    | { key: string; type: "friend"; friendship: Friendship };

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    if (filteredCircles.length > 0) {
      items.push({ key: "section-circles", type: "section", title: "Circles" });
      for (const c of filteredCircles) {
        items.push({ key: `circle-${c.id}`, type: "circle", circle: c });
      }
    }
    if (filteredFriends.length > 0) {
      items.push({ key: "section-friends", type: "section", title: "Friends" });
      for (const f of filteredFriends) {
        items.push({ key: `friend-${f.friendId}`, type: "friend", friendship: f });
      }
    }
    return items;
  }, [filteredCircles, filteredFriends]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "section") {
        return (
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              fontWeight: "600",
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {item.title}
          </Text>
        );
      }

      if (item.type === "circle") {
        const c = item.circle;
        const isSelected = isCircleSelected(c.id);
        return (
          <Pressable
            onPress={() => toggleCircle(c)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: isSelected
                ? (isDark ? themeColor + "18" : themeColor + "10")
                : "transparent",
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Text style={{ fontSize: 18 }}>{c.emoji || "👥"}</Text>
            </View>
            <Text style={{ flex: 1, color: colors.text, fontSize: 16 }} numberOfLines={1}>
              {c.name}
            </Text>
            {isSelected && (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: themeColor,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={14} color="#fff" />
              </View>
            )}
          </Pressable>
        );
      }

      // friend
      const f = item.friendship;
      const isSelected = isFriendSelected(f.friendId);
      return (
        <Pressable
          onPress={() => toggleFriend(f)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingVertical: 10,
            backgroundColor: isSelected
              ? (isDark ? themeColor + "18" : themeColor + "10")
              : "transparent",
          }}
        >
          <EntityAvatar
            photoUrl={f.friend.image}
            initials={f.friend.name?.[0] ?? "?"}
            size={40}
            backgroundColor={isDark ? "#2C2C2E" : "#F3F4F6"}
            foregroundColor={themeColor}
          />
          <Text
            style={{ flex: 1, color: colors.text, fontSize: 16, marginLeft: 12 }}
            numberOfLines={1}
          >
            {f.friend.name ?? "Friend"}
          </Text>
          {isSelected && (
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: themeColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={14} color="#fff" />
            </View>
          )}
        </Pressable>
      );
    },
    [colors, isDark, themeColor, isCircleSelected, isFriendSelected, toggleCircle, toggleFriend],
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      heightPct={0.75}
      backdropOpacity={0.5}
      keyboardMode="padding"
      title="Send to"
    >
      {/* Search bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 20,
          marginBottom: 8,
          paddingHorizontal: 12,
          height: 40,
          borderRadius: 12,
          backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
        }}
      >
        <Search size={18} color={colors.textTertiary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search friends or circles..."
          placeholderTextColor={colors.textTertiary}
          style={{
            flex: 1,
            marginLeft: 8,
            fontSize: 15,
            color: colors.text,
          }}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {/* Selected count pill */}
      {selected.length > 0 && (
        <View style={{ flexDirection: "row", paddingHorizontal: 20, marginBottom: 4 }}>
          <View
            style={{
              backgroundColor: themeColor + "20",
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: themeColor, fontSize: 13, fontWeight: "600" }}>
              {selected.length} selected
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        style={{ flex: 1 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <Text style={{ color: colors.textTertiary, fontSize: 15 }}>
              {friendsLoading ? "Loading..." : "No friends or circles yet"}
            </Text>
          </View>
        }
      />

      {/* Message input + Send button */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
        }}
      >
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Add a message (optional)"
          placeholderTextColor={colors.textTertiary}
          style={{
            fontSize: 15,
            color: colors.text,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
            marginBottom: 10,
          }}
          multiline
          maxLength={500}
        />
        <Pressable
          onPress={handleSend}
          disabled={selected.length === 0 || sending}
          style={{
            backgroundColor: selected.length === 0 ? (isDark ? "#3A3A3C" : "#D1D5DB") : themeColor,
            borderRadius: 14,
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            opacity: sending ? 0.7 : 1,
          }}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Send size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
                {selected.length === 0
                  ? "Select recipients"
                  : `Send to ${selected.length}`}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}
