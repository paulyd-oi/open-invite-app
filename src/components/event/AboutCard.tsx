import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Compass, ArrowRight, Users, Lock, ChevronRight, HandCoins, Copy, ListChecks, Check, Clock } from "@/ui/icons";
import { STATUS } from "@/ui/tokens";
import { RADIUS } from "@/ui/layout";

interface BringListItem {
  id: string;
  label: string;
  claimedByUserId?: string | null;
  claimedByName?: string | null;
}

interface EventMeta {
  capacity: number | null;
  goingCount: number | null;
  isFull: boolean;
}

interface AboutCardColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
}

interface AboutCardProps {
  // Description
  description: string | null | undefined;
  descriptionExpanded: boolean;
  onToggleDescription: () => void;
  // Location
  locationDisplay: string | null;
  onGetDirections: () => void;
  // Visibility (host only)
  isMyEvent: boolean;
  isBusy: boolean;
  visibility: string | null | undefined;
  circleName: string | null | undefined;
  circleId: string | null | undefined;
  groupVisibility?: Array<{ groupId: string; group: { id: string; name: string; color: string } }> | null;
  onOpenCircle: () => void;
  // Capacity
  eventMeta: EventMeta;
  // RSVP Deadline
  rsvpDeadline: string | null | undefined;
  // Cost Per Person
  costPerPerson: string | null | undefined;
  // Pitch In
  pitchInEnabled: boolean | null | undefined;
  pitchInHandle: string | null | undefined;
  pitchInMethod: string | null | undefined;
  pitchInAmount: string | null | undefined;
  pitchInNote: string | null | undefined;
  onCopyPitchInHandle: () => void;
  // Bring List
  bringListEnabled: boolean | null | undefined;
  bringListItems: BringListItem[];
  currentUserId: string | undefined;
  isBringListClaimPending: boolean;
  onClaimItem: (itemId: string) => void;
  onUnclaimItem: (itemId: string) => void;
  // Theme
  isDark: boolean;
  themeColor: string;
  colors: AboutCardColors;
}

export function AboutCard({
  description,
  descriptionExpanded,
  onToggleDescription,
  locationDisplay,
  onGetDirections,
  isMyEvent,
  isBusy,
  visibility,
  circleName,
  circleId,
  groupVisibility,
  onOpenCircle,
  eventMeta,
  rsvpDeadline,
  costPerPerson,
  pitchInEnabled,
  pitchInHandle,
  pitchInMethod,
  pitchInAmount,
  pitchInNote,
  onCopyPitchInHandle,
  bringListEnabled,
  bringListItems,
  currentUserId,
  isBringListClaimPending,
  onClaimItem,
  onUnclaimItem,
  isDark,
  themeColor,
  colors,
}: AboutCardProps) {
  return (
    <>
      {/* ═══ DESCRIPTION / VIBE ═══ */}
      {description && (
        <Animated.View entering={FadeInDown.delay(90).springify()} style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" }}>
            About
          </Text>
          <Text
            style={{ fontSize: 15, lineHeight: 24, color: colors.text, letterSpacing: 0.05 }}
            numberOfLines={descriptionExpanded ? undefined : 4}
          >
            {description}
          </Text>
          {description.length > 200 && (
            <Pressable onPress={onToggleDescription} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: themeColor }}>
                {descriptionExpanded ? "Show less" : "Read more"}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* ═══ DETAILS BLOCK ═══ */}
      <Animated.View entering={FadeInDown.delay(95).springify()} style={{ marginBottom: 18 }}>
        {/* Get Directions */}
        {locationDisplay && (
          <Pressable
            onPress={onGetDirections}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 16,
              marginBottom: 12,
              borderRadius: RADIUS.lg,
              backgroundColor: isDark ? "rgba(20,184,166,0.08)" : "rgba(20,184,166,0.05)",
              borderWidth: 0.5,
              borderColor: isDark ? "rgba(20,184,166,0.18)" : "rgba(20,184,166,0.15)",
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: isDark ? "rgba(20,184,166,0.15)" : "rgba(20,184,166,0.1)", alignItems: "center", justifyContent: "center" }}>
              <Compass size={18} color="#14B8A6" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }} numberOfLines={1}>{locationDisplay}</Text>
              <Text style={{ fontSize: 12, color: "#14B8A6", marginTop: 2, fontWeight: "500" }}>Get Directions</Text>
            </View>
            <ArrowRight size={16} color="#14B8A6" />
          </Pressable>
        )}

        {/* Visibility - Host only */}
        {isMyEvent && (
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
            {(() => {
              const isCircleTappable = visibility === "circle_only" && !!circleId;
              const RowWrapper = isCircleTappable ? Pressable : View;
              const rowProps = isCircleTappable
                ? {
                    onPress: onOpenCircle,
                    accessibilityRole: "button" as const,
                    accessibilityLabel: "Open circle chat",
                  }
                : {};
              return (
                <RowWrapper className="flex-row items-center flex-1" {...rowProps}>
                  {isBusy ? (
                    <Users size={16} color={colors.textTertiary} />
                  ) : visibility === "all_friends" ? (
                    <Compass size={16} color={colors.textTertiary} />
                  ) : visibility === "circle_only" ? (
                    <Lock size={16} color={colors.textTertiary} />
                  ) : visibility === "private" ? (
                    <Lock size={16} color={colors.textTertiary} />
                  ) : (
                    <Users size={16} color={colors.textTertiary} />
                  )}
                  <Text style={{ fontSize: 13, marginLeft: 8, color: colors.textSecondary }}>
                    {isBusy ? "Only self" : visibility === "all_friends" ? "All Friends" : visibility === "circle_only" ? (circleName ? `Circle: ${circleName}` : "Circle Only") : visibility === "private" ? "Private" : groupVisibility?.length ? groupVisibility.map((gv) => gv.group.name).join(", ") : "Specific Groups"}
                  </Text>
                  {isCircleTappable && <ChevronRight size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />}
                </RowWrapper>
              );
            })()}
          </View>
        )}

        {/* Spots (Capacity) */}
        {eventMeta.capacity != null && (() => {
          const goingNow = eventMeta.goingCount ?? 0;
          const spotsRemaining = Math.max(0, eventMeta.capacity - goingNow);
          const almostFull = !eventMeta.isFull && spotsRemaining > 0 && spotsRemaining <= 3;
          return (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
              <Users size={16} color={eventMeta.isFull ? STATUS.destructive.fg : almostFull ? STATUS.soon.fg : STATUS.going.fg} />
              <Text style={{ fontSize: 13, marginLeft: 8, color: eventMeta.isFull ? STATUS.destructive.fg : colors.textSecondary }}>
                {goingNow} / {eventMeta.capacity} spots
              </Text>
              {eventMeta.isFull ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8, backgroundColor: STATUS.destructive.bgSoft }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: STATUS.destructive.fg }}>Full</Text>
                </View>
              ) : almostFull ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8, backgroundColor: STATUS.soon.bgSoft }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: STATUS.soon.fg }}>
                    {spotsRemaining} {spotsRemaining === 1 ? "spot" : "spots"} left
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })()}

        {/* RSVP Deadline */}
        {rsvpDeadline && (() => {
          const deadline = new Date(rsvpDeadline);
          const isPast = deadline < new Date();
          const deadlineColor = isPast ? STATUS.destructive.fg : STATUS.soon.fg;
          return (
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
              <Clock size={16} color={deadlineColor} />
              <Text style={{ fontSize: 13, marginLeft: 8, color: isPast ? STATUS.destructive.fg : colors.textSecondary }}>
                {isPast ? "RSVPs Closed" : `RSVPs close ${deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${deadline.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
              </Text>
              {isPast && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8, backgroundColor: STATUS.destructive.bgSoft }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: STATUS.destructive.fg }}>Closed</Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Cost Per Person */}
        {costPerPerson && (
          <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
            <HandCoins size={16} color={themeColor} />
            <Text style={{ fontSize: 13, marginLeft: 8, color: colors.textSecondary }}>
              {costPerPerson}
            </Text>
          </View>
        )}
      </Animated.View>

      {/* ═══ PITCH IN V1 — Payment handle display ═══ */}
      {pitchInEnabled && pitchInHandle && (
        <Animated.View entering={FadeInDown.delay(92).springify()} style={{ marginBottom: 14 }}>
          <View style={{
            borderTopWidth: 0.5,
            borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            paddingTop: 14,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <HandCoins size={16} color={themeColor} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginLeft: 8 }}>
                {pitchInAmount ? "Suggested contribution" : "Optional contribution"}
              </Text>
              {pitchInAmount && (
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary, marginLeft: 6 }}>
                  {/^[\$\u20AC\u00A3\u00A5]/.test(pitchInAmount) ? pitchInAmount : `$${pitchInAmount}`}
                </Text>
              )}
            </View>
            {pitchInNote && (
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 10, lineHeight: 18 }}>
                {pitchInNote}
              </Text>
            )}
            {/* Handle display row with inline copy pill */}
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: RADIUS.md,
              backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
            }}>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                {pitchInMethod === "venmo" ? "Venmo" : pitchInMethod === "cashapp" ? "Cash App" : pitchInMethod === "paypal" ? "PayPal" : "Send to"}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginLeft: 8, flex: 1 }} numberOfLines={1}>
                {(pitchInMethod === "venmo" || pitchInMethod === "cashapp") ? "@" : ""}{pitchInHandle}
              </Text>
              <Pressable
                onPress={onCopyPitchInHandle}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginLeft: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                  backgroundColor: `${themeColor}14`,
                }}
              >
                <Copy size={12} color={themeColor} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: themeColor, marginLeft: 4 }}>Copy</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ═══ WHAT TO BRING V2 — Lightweight claim system ═══ */}
      {bringListEnabled && bringListItems.length > 0 && (() => {
        const unclaimed = bringListItems.filter((i) => !i.claimedByUserId);
        const claimed = bringListItems.filter((i) => !!i.claimedByUserId);
        return (
          <Animated.View entering={FadeInDown.delay(93).springify()} style={{ marginBottom: 14 }}>
            <View style={{
              borderTopWidth: 0.5,
              borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              paddingTop: 14,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                <ListChecks size={16} color={themeColor} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginLeft: 8 }}>
                  What to bring
                </Text>
                <Text style={{ fontSize: 11, color: colors.textTertiary, marginLeft: 8 }}>
                  {claimed.length}/{bringListItems.length} claimed
                </Text>
              </View>
              {/* Unclaimed items first */}
              {unclaimed.length > 0 && (
                <View style={{ gap: 6, marginBottom: claimed.length > 0 ? 6 : 0 }}>
                  {unclaimed.map((item) => (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: RADIUS.md,
                        backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                      }}
                    >
                      <View style={{
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: colors.textTertiary,
                        marginRight: 10,
                      }} />
                      <Text style={{ fontSize: 14, color: colors.text, flex: 1 }}>{item.label}</Text>
                      <Pressable
                        onPress={() => onClaimItem(item.id)}
                        disabled={isBringListClaimPending}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          backgroundColor: `${themeColor}14`,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "600", color: themeColor }}>I'll bring this</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {/* Claimed items */}
              {claimed.length > 0 && (
                <View style={{ gap: 6 }}>
                  {claimed.map((item) => {
                    const isMine = item.claimedByUserId === currentUserId;
                    return (
                      <View
                        key={item.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: RADIUS.md,
                          backgroundColor: isMine
                            ? (isDark ? "rgba(34,197,94,0.08)" : "rgba(34,197,94,0.05)")
                            : (isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)"),
                        }}
                      >
                        <Check size={14} color={STATUS.going.fg} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, color: colors.text }}>{item.label}</Text>
                          <Text style={{ fontSize: 11, color: isMine ? STATUS.going.fg : colors.textTertiary, marginTop: 1 }}>
                            {isMine ? "You're bringing this" : `${item.claimedByName ?? "Someone"}`}
                          </Text>
                        </View>
                        {isMine && (
                          <Pressable
                            onPress={() => onUnclaimItem(item.id)}
                            disabled={isBringListClaimPending}
                            hitSlop={8}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.textTertiary }}>Unclaim</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </Animated.View>
        );
      })()}
    </>
  );
}
