/**
 * CircleChatSection — Chat message components extracted from circle/[id].tsx
 * to reduce mount cost and file size.
 *
 * Includes:
 *  - MessageBubble component
 *  - formatDateSeparator helper
 *  - parseSystemEventPayload helper
 *  - parseSystemMemberLeftPayload helper
 */

import React, { useRef } from "react";
import { View, Text, Pressable } from "react-native";
import { devLog } from "@/lib/devLog";
import * as Haptics from "expo-haptics";
import { Calendar, RefreshCw } from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import type { CircleMessage } from "@/shared/contracts";

function formatDateSeparator(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = today.getTime() - msgDay.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() !== now.getFullYear()) return `${month} ${day}, ${d.getFullYear()}`;
  return `${month} ${day}`;
}

// -- Parse __system:event_created:{JSON} payload from message content --
function parseSystemEventPayload(content: string): { eventId: string; title: string; startTime: string; endTime?: string; hostId: string } | null {
  const PREFIX = "__system:event_created:";
  if (!content.startsWith(PREFIX)) return null;
  try {
    const raw = JSON.parse(content.slice(PREFIX.length));
    if (raw && typeof raw.eventId === "string" && typeof raw.title === "string" && typeof raw.startTime === "string" && typeof raw.hostId === "string") {
      return { eventId: raw.eventId, title: raw.title, startTime: raw.startTime, endTime: typeof raw.endTime === "string" ? raw.endTime : undefined, hostId: raw.hostId };
    }
  } catch { /* malformed JSON — fall through */ }
  return null;
}

// -- Parse __system:member_left:{JSON} payload from message content --
function parseSystemMemberLeftPayload(content: string): { type: "member_left" | "member_removed"; circleId: string; userId: string; name: string } | null {
  const PREFIX = "__system:member_left:";
  if (!content.startsWith(PREFIX)) return null;
  try {
    const raw = JSON.parse(content.slice(PREFIX.length));
    if (raw && (raw.type === "member_left" || raw.type === "member_removed") && typeof raw.userId === "string" && typeof raw.name === "string") {
      return { type: raw.type, circleId: raw.circleId ?? "", userId: raw.userId, name: raw.name };
    }
  } catch { /* malformed JSON — fall through */ }
  return null;
}

// Message Bubble Component
function MessageBubble({
  message,
  isOwn,
  themeColor,
  colors,
  isDark,
  onRetry,
  onLongPress,
  onPress,
  isRunContinuation,
  showTimestamp,
  reactions,
  editedContent,
  isDeleted,
  onViewEvent,
}: {
  message: CircleMessage & { status?: string; retryCount?: number; clientMessageId?: string };
  isOwn: boolean;
  themeColor: string;
  colors: any;
  isDark: boolean;
  onRetry?: () => void;
  onLongPress?: () => void;
  onPress?: () => void;
  isRunContinuation?: boolean;
  showTimestamp?: boolean;
  reactions?: string[];
  editedContent?: string;
  isDeleted?: boolean;
  onViewEvent?: (eventId: string) => void;
}) {
  const isLegacySystemMessage = message.content.startsWith("📅");
  const systemEventPayload = parseSystemEventPayload(message.content);
  const memberLeftPayload = parseSystemMemberLeftPayload(message.content);
  const isSending = (message as any).status === "sending";
  const isFailed = (message as any).status === "failed";
  const isSent = (message as any).status === "sent" || (!isSending && !isFailed);
  // Guard: prevent onPress firing after onLongPress
  const longPressFiredRef = useRef(false);

  // Rich event card for __system:event_created messages
  if (systemEventPayload) {
    const d = new Date(systemEventPayload.startTime);
    const endTime = systemEventPayload.endTime ? new Date(systemEventPayload.endTime) : null;
    const isPast = endTime ? endTime < new Date() : d < new Date();
    const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const headerLabel = isPast ? "Past Event" : "Upcoming";
    const accentColor = isPast ? colors.textTertiary : themeColor;
    return (
      <View className="items-center" style={{ marginVertical: isPast ? 10 : 20 }}>
        <Pressable
          onPress={() => onViewEvent?.(systemEventPayload.eventId)}
          style={{
            width: isPast ? "80%" : "88%",
            borderRadius: isPast ? 14 : 18,
            backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
            borderWidth: isPast ? 1 : 1.5,
            borderColor: isPast
              ? (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)")
              : (isDark ? themeColor + "30" : themeColor + "22"),
            overflow: "hidden",
            opacity: isPast ? 0.6 : 1,
          }}
        >
          <View style={{
            backgroundColor: accentColor + (isPast ? "10" : "18"),
            paddingHorizontal: isPast ? 14 : 16,
            paddingVertical: isPast ? 8 : 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}>
            <Calendar size={isPast ? 14 : 16} color={accentColor} />
            <Text style={{ fontSize: isPast ? 12 : 13, fontWeight: "700", color: accentColor, letterSpacing: 0.3, textTransform: "uppercase" }}>{headerLabel}</Text>
          </View>
          <View style={{ paddingHorizontal: isPast ? 14 : 18, paddingTop: isPast ? 10 : 16, paddingBottom: isPast ? 12 : 18 }}>
            <Text style={{ fontSize: isPast ? 14 : 17, fontWeight: isPast ? "600" : "700", color: isPast ? colors.textSecondary : colors.text }} numberOfLines={2}>
              {systemEventPayload.title}
            </Text>
            <Text style={{ fontSize: isPast ? 12 : 14, color: isPast ? colors.textTertiary : colors.textSecondary, marginTop: isPast ? 3 : 6 }}>
              {dateStr} · {timeStr}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  }

  // [P1_MEMBER_LEFT_RENDER] Member left/removed system pill
  if (memberLeftPayload) {
    if (__DEV__) {
      devLog("[P1_MEMBER_LEFT_RENDER]", {
        circleId: memberLeftPayload.circleId,
        type: memberLeftPayload.type,
        userId: memberLeftPayload.userId,
        name: memberLeftPayload.name,
      });
    }
    const pillText = memberLeftPayload.type === "member_removed"
      ? `${memberLeftPayload.name} was removed`
      : `${memberLeftPayload.name} left the circle`;
    return (
      <View className="items-center my-2">
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {pillText}
          </Text>
        </View>
      </View>
    );
  }

  // Legacy system messages (📅 prefix)
  if (isLegacySystemMessage) {
    return (
      <View className="items-center my-2">
        <View className="rounded-full px-3 py-1" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
          <Text className="text-xs" style={{ color: colors.textSecondary }}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (longPressFiredRef.current) { longPressFiredRef.current = false; return; }
        onPress?.();
      }}
      onLongPress={() => {
        longPressFiredRef.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress?.();
      }}
      delayLongPress={400}
    >
    <View className={`${isRunContinuation ? "mb-0.5" : "mb-3"} ${isOwn ? "items-end" : "items-start"}`}>
      <View className={`flex-row items-end ${isOwn ? "flex-row-reverse" : ""}`}>
        {!isOwn && !isRunContinuation && (
          <View
            className="w-7 h-7 rounded-full overflow-hidden mr-2"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#E5E7EB" }}
          >
            <EntityAvatar
              photoUrl={message.user.image}
              initials={message.user.name?.[0] ?? "?"}
              size={28}
              backgroundColor={message.user.image ? (isDark ? "#2C2C2E" : "#E5E7EB") : themeColor + "20"}
              foregroundColor={themeColor}
            />
          </View>
        )}
        {/* Spacer to keep alignment when avatar is hidden in a run */}
        {!isOwn && isRunContinuation && <View style={{ width: 36 }} />}
        <View style={{ maxWidth: "75%" }}>
          {!isOwn && !isRunContinuation && (
            <Text className="text-xs mb-1 ml-1" style={{ color: colors.textTertiary }}>
              {message.user.name?.split(" ")[0] ?? "Unknown"}
            </Text>
          )}
          <View
            className={`rounded-2xl px-4 py-2.5 ${isOwn ? "rounded-br-md" : "rounded-bl-md"}`}
            style={{
              backgroundColor: isOwn ? themeColor : isDark ? "#2C2C2E" : "#F3F4F6",
              opacity: isSending ? 0.7 : isFailed ? 0.5 : /* isSent */ 1,
            }}
          >
            {isDeleted ? (
              <Text style={{ fontStyle: "italic", color: isOwn ? "rgba(255,255,255,0.5)" : colors.textTertiary }}>Message deleted</Text>
            ) : (
              <>
                {message.reply && (
                  <View style={{ marginBottom: 4, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: isOwn ? "rgba(255,255,255,0.25)" : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)") }}>
                    <Text style={{ fontSize: 12, fontStyle: "italic", color: isOwn ? "rgba(255,255,255,0.8)" : colors.textSecondary }} numberOfLines={1}>
                      ↩︎ {message.reply.userName}: {message.reply.snippet}
                    </Text>
                  </View>
                )}
                <Text style={{ color: isOwn ? "#fff" : colors.text }}>{editedContent ?? message.content}</Text>
              </>
            )}
          </View>
          {/* [P2_CHAT_REACTIONS] Reaction chips */}
          {!isDeleted && reactions && reactions.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2, ...(isOwn ? { justifyContent: "flex-end", marginRight: 2 } : { marginLeft: 2 }) }}>
              {reactions.map((emoji) => (
                <View
                  key={emoji}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                    borderRadius: 10,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    marginRight: 4,
                    marginBottom: 2,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>{emoji}</Text>
                  <Text style={{ fontSize: 10, marginLeft: 2, color: colors.textTertiary }}>1</Text>
                </View>
              ))}
            </View>
          )}
          {showTimestamp && (
          <View className={`flex-row items-center mt-1 ${isOwn ? "justify-end mr-1" : "ml-1"}`}>
            <Text className="text-[10px]" style={{ color: colors.textTertiary }}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </Text>
            {editedContent && !isDeleted && (
              <Text className="text-[10px] ml-1" style={{ color: colors.textTertiary, fontStyle: "italic" }}>(edited)</Text>
            )}
            {isSending && !isSent && (
              <Text className="text-[10px] ml-1" style={{ color: colors.textTertiary }}>Sending…</Text>
            )}
            {isFailed && !isSent && onRetry && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRetry();
                }}
                className="flex-row items-center ml-1.5"
                hitSlop={8}
              >
                <RefreshCw size={10} color="#EF4444" />
                <Text className="text-[10px] ml-0.5" style={{ color: "#EF4444" }}>Retry</Text>
              </Pressable>
            )}
          </View>
          )}
          {/* Always show status indicators even when timestamp is hidden */}
          {!showTimestamp && (isSending || isFailed) && (
          <View className={`flex-row items-center mt-1 ${isOwn ? "justify-end mr-1" : "ml-1"}`}>
            {isSending && !isSent && (
              <Text className="text-[10px]" style={{ color: colors.textTertiary }}>Sending…</Text>
            )}
            {isFailed && !isSent && onRetry && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRetry();
                }}
                className="flex-row items-center"
                hitSlop={8}
              >
                <RefreshCw size={10} color="#EF4444" />
                <Text className="text-[10px] ml-0.5" style={{ color: "#EF4444" }}>Retry</Text>
              </Pressable>
            )}
          </View>
          )}
        </View>
      </View>
    </View>
    </Pressable>
  );
}

export { MessageBubble, formatDateSeparator, parseSystemEventPayload, parseSystemMemberLeftPayload };
