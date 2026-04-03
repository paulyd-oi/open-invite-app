import React from "react";
import { Pressable, View, Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Lock, Users, Heart, XCircle, ChevronRight, UserPlus } from "@/ui/icons";
import { STATUS } from "@/ui/tokens";
import { RADIUS } from "@/ui/layout";
import { EntityAvatar } from "@/components/EntityAvatar";

interface AttendeeInfo {
  id: string;
  name: string | null;
  imageUrl?: string | null;
  isHost?: boolean;
}

interface InterestUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface Interest {
  id: string;
  userId: string;
  user: InterestUser;
  status: string;
  createdAt: string;
}

interface WhosComingCardColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
}

interface NotGoingUser {
  id: string;
  name: string | null;
  image: string | null;
}

interface GuestRsvpEntry {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

interface WhosComingCardProps {
  attendeesPrivacyDenied: boolean;
  effectiveGoingCount: number;
  attendeesList: AttendeeInfo[];
  hostId: string | undefined;
  hostUser: { id?: string; name?: string | null; image?: string | null } | null | undefined;
  myRsvpStatus: string | null;
  isMyEvent: boolean;
  interests: Interest[];
  notGoingUsers: NotGoingUser[];
  guestGoingList: GuestRsvpEntry[];
  guestNotGoingList: GuestRsvpEntry[];
  showGuestList: boolean;
  showGuestCount: boolean;
  showInterestedUsers: boolean;
  /** Viewer's friend IDs for friends-first sorting. Falls back to current order when absent. */
  friendIds?: ReadonlySet<string>;
  isDark: boolean;
  themeColor: string;
  colors: WhosComingCardColors;
  onOpenAttendees: () => void;
  onToggleInterestedUsers: () => void;
}

const STACK_MAX = 8;
const AVATAR_SIZE = 40;
const OVERLAP = 14;

/** Stable friends-first sort: friends before non-friends, preserve order within each bucket. */
function sortFriendsFirst(attendees: AttendeeInfo[], friendIds?: ReadonlySet<string>): AttendeeInfo[] {
  if (!friendIds || friendIds.size === 0) return attendees;
  const friends: AttendeeInfo[] = [];
  const others: AttendeeInfo[] = [];
  for (const a of attendees) {
    (friendIds.has(a.id) ? friends : others).push(a);
  }
  return [...friends, ...others];
}

/** Deterministic "who's going" summary from attendee names. */
function formatGoingSummary(names: string[], totalCount: number): string {
  // Deduplicate and filter empty
  const clean = [...new Set(names.filter(Boolean))];
  if (clean.length === 0) return `${totalCount} going`;
  if (clean.length === 1) return `${clean[0]} is going`;
  if (clean.length === 2) return `${clean[0]} and ${clean[1]} are going`;
  if (totalCount <= 3) return `${clean[0]}, ${clean[1]}, and ${clean[2]}`;
  const overflow = totalCount - 3;
  return `${clean[0]}, ${clean[1]}, ${clean[2]} +${overflow}`;
}

export function WhosComingCard({
  attendeesPrivacyDenied,
  effectiveGoingCount,
  attendeesList,
  hostId,
  hostUser,
  myRsvpStatus,
  isMyEvent,
  interests,
  notGoingUsers,
  guestGoingList,
  guestNotGoingList,
  showGuestList,
  showGuestCount,
  showInterestedUsers,
  friendIds,
  isDark,
  themeColor,
  colors,
  onOpenAttendees,
  onToggleInterestedUsers,
}: WhosComingCardProps) {
  // Combine app user not-going with guest not-going for unified section
  const allNotGoing = [
    ...notGoingUsers.map((u) => ({ id: u.id, name: u.name ?? "Unknown", isGuest: false })),
    ...guestNotGoingList.map((g) => ({ id: g.id, name: g.name, isGuest: true })),
  ];
  return (
    <>
      {/* ═══ Who's Coming / Social Proof ═══ */}
      {(() => {
        // 403 privacy denied: show privacy message
        if (attendeesPrivacyDenied) {
          return (
            <Animated.View entering={FadeInDown.delay(95).springify()}>
              <View style={{ paddingVertical: 14, marginBottom: 10, borderTopWidth: 0.5, borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Lock size={16} color="#9CA3AF" />
                  <Text style={{ fontSize: 14, fontWeight: "600", marginLeft: 8, color: colors.text }}>
                    Who's Coming
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 6 }}>
                  Attendees visible to invited or going members
                </Text>
              </View>
            </Animated.View>
          );
        }

        // Has attendees: show compact roster preview (1-row avatar stack)
        if (effectiveGoingCount > 0 || attendeesList.length > 0) {
          const hostInList = attendeesList.find(a => a.id === hostId);
          const nonHostAttendees = sortFriendsFirst(attendeesList.filter(a => a.id !== hostId), friendIds);
          const orderedForStack: AttendeeInfo[] = [
            ...(hostInList ? [hostInList] : []),
            ...nonHostAttendees,
          ];
          const hostAttendee: AttendeeInfo | null = (!hostInList && hostUser) ? {
            id: hostUser.id ?? 'host',
            name: hostUser.name ?? 'Host',
            imageUrl: hostUser.image ?? null,
            isHost: true,
          } : null;
          const stackSource = hostAttendee ? [hostAttendee, ...orderedForStack] : orderedForStack;
          const visibleAvatars = stackSource.slice(0, STACK_MAX);
          const overflowCount = Math.max(0, effectiveGoingCount - visibleAvatars.length);
          const stackWidth = visibleAvatars.length * (AVATAR_SIZE - OVERLAP) + OVERLAP + (overflowCount > 0 ? AVATAR_SIZE - OVERLAP + OVERLAP : 0);

          return (
            <Animated.View entering={FadeInDown.delay(100).springify()} style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>
                Who's Coming
              </Text>
              <Pressable
                testID="event-detail-whos-coming-open"
                onPress={onOpenAttendees}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderRadius: RADIUS.lg,
                  backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.015)",
                  borderWidth: 0.5,
                  borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                }}
              >
                {/* Avatar stack */}
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <View style={{ width: stackWidth, height: AVATAR_SIZE, flexDirection: "row" }}>
                    {visibleAvatars.map((attendee, idx) => {
                      const isHostAvatar = attendee.id === hostId || attendee.isHost;
                      return (
                        <View
                          key={attendee.id}
                          style={{
                            position: "absolute",
                            left: idx * (AVATAR_SIZE - OVERLAP),
                            width: AVATAR_SIZE,
                            height: AVATAR_SIZE,
                            borderRadius: AVATAR_SIZE / 2,
                            backgroundColor: isHostAvatar ? (isDark ? "#3C2A1A" : "#FFF7ED") : "#DCFCE7",
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 2,
                            borderColor: isHostAvatar ? (isDark ? "#92400E" : "#FDBA74") : "#BBF7D0",
                            zIndex: visibleAvatars.length - idx,
                          }}
                        >
                          <EntityAvatar
                            photoUrl={attendee.imageUrl}
                            initials={attendee.name?.[0] ?? "?"}
                            size={AVATAR_SIZE - 4}
                            backgroundColor={isHostAvatar ? (isDark ? "#3C2A1A" : "#FFF7ED") : "#DCFCE7"}
                            foregroundColor={isHostAvatar ? "#92400E" : "#166534"}
                          />
                        </View>
                      );
                    })}
                    {overflowCount > 0 && (
                      <View
                        style={{
                          position: "absolute",
                          left: visibleAvatars.length * (AVATAR_SIZE - OVERLAP),
                          width: AVATAR_SIZE,
                          height: AVATAR_SIZE,
                          borderRadius: AVATAR_SIZE / 2,
                          backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 2,
                          borderColor: isDark ? "#3C3C3E" : "#E5E7EB",
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textSecondary }}>
                          +{overflowCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ marginLeft: 10, fontSize: 13, fontWeight: "500", color: colors.textSecondary }} numberOfLines={1}>
                    {formatGoingSummary(
                      stackSource.map(a => a.name).filter(Boolean) as string[],
                      effectiveGoingCount,
                    )}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: `${themeColor}12` }}>
                  <Text style={{ color: themeColor, fontSize: 13, fontWeight: "600" }}>View all</Text>
                  <ChevronRight size={14} color={themeColor} style={{ marginLeft: 2 }} />
                </View>
              </Pressable>
            </Animated.View>
          );
        }

        // No one coming yet - warm, inviting placeholder
        return (
          <Animated.View entering={FadeInDown.delay(95).springify()}>
            <View style={{ paddingVertical: 14, marginBottom: 10, borderTopWidth: 0.5, borderTopColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: STATUS.going.bgSoft,
                }}>
                  <Users size={14} color={STATUS.going.fg} />
                </View>
                <Text style={{ fontSize: 13, marginLeft: 8, color: colors.textSecondary }}>
                  {isMyEvent ? "No one\u2019s joined yet \u2014 share to get the word out" : "Be the first to join this event"}
                </Text>
              </View>
            </View>
          </Animated.View>
        );
      })()}

      {/* Interested Users Section */}
      {interests.length > 0 && (
        <Animated.View entering={FadeInDown.delay(110).springify()} className="mb-3">
          <Pressable
            onPress={onToggleInterestedUsers}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center">
              <Heart size={16} color="#EC4899" />
              <Text className="font-semibold ml-2" style={{ color: colors.text }}>
                {interests.length} Interested
              </Text>
            </View>
            <ChevronRight
              size={18}
              color={colors.textTertiary}
              style={{ transform: [{ rotate: showInterestedUsers ? "90deg" : "0deg" }] }}
            />
          </Pressable>
          {showInterestedUsers && (
            <View className="mt-3 flex-row flex-wrap">
              {interests.map((interest) => (
                <View
                  key={interest.id}
                  className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
                >
                  <EntityAvatar
                    photoUrl={interest.user.image}
                    initials={interest.user.name?.[0] ?? "?"}
                    size={24}
                    backgroundColor="#EC489930"
                    foregroundColor="#EC4899"
                    style={{ marginRight: 8 }}
                  />
                  <Text className="text-sm" style={{ color: colors.text }}>
                    {interest.user.name ?? "Unknown"}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      )}

      {/* Interested Count for Event Owners */}
      {isMyEvent && interests.length > 0 && (
        <Animated.View entering={FadeInDown.delay(115).springify()} className="mb-3">
          <View
            className="rounded-xl p-4 flex-row items-center"
            style={{ backgroundColor: "#EC489910", borderWidth: 1, borderColor: "#EC489930" }}
          >
            <Heart size={20} color="#EC4899" />
            <View className="ml-3 flex-1">
              <Text className="font-semibold" style={{ color: colors.text }}>
                {interests.length} people interested
              </Text>
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                They might attend if the timing works
              </Text>
            </View>
          </View>
        </Animated.View>
      )}

      {/* Not Going Section (app users + guest declines) */}
      {allNotGoing.length > 0 && (
        <Animated.View entering={FadeInDown.delay(120).springify()} className="mb-3">
          <View className="flex-row items-center mb-2">
            <XCircle size={16} color="#9CA3AF" />
            <Text className="font-semibold ml-2" style={{ color: colors.textTertiary }}>
              {allNotGoing.length} Can't go
            </Text>
          </View>
          <View className="flex-row flex-wrap">
            {allNotGoing.map((entry) => (
              <View
                key={entry.id}
                className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", opacity: 0.6 }}
              >
                <EntityAvatar
                  photoUrl={null}
                  initials={entry.name[0] ?? "?"}
                  size={24}
                  backgroundColor={isDark ? "#3C3C3E" : "#E5E7EB"}
                  foregroundColor="#9CA3AF"
                  style={{ marginRight: 8 }}
                />
                <Text className="text-sm" style={{ color: colors.textTertiary }}>
                  {entry.name}
                </Text>
                {entry.isGuest && (
                  <View style={{ marginLeft: 6, backgroundColor: isDark ? "#3C3C3E" : "#E5E7EB", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: colors.textTertiary }}>Guest</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/* Guests Section (web RSVPs with status "going") */}
      {/* Privacy: hide when guest list is restricted and count is too low to be useful */}
      {guestGoingList.length > 0 && (showGuestList || guestGoingList.length >= 2) && (
        <Animated.View entering={FadeInDown.delay(125).springify()} className="mb-3">
          <View className="flex-row items-center mb-2">
            <UserPlus size={16} color="#6B7280" />
            <Text className="font-semibold ml-2" style={{ color: colors.textTertiary }}>
              {showGuestCount ? `${guestGoingList.length} ` : ""}Guests
            </Text>
          </View>
          <View className="flex-row flex-wrap">
            {guestGoingList.map((guest) => (
              <View
                key={guest.id}
                className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
              >
                <EntityAvatar
                  photoUrl={null}
                  initials={guest.name[0] ?? "?"}
                  size={24}
                  backgroundColor={isDark ? "#3A3A5C" : "#EEF2FF"}
                  foregroundColor="#6366F1"
                  style={{ marginRight: 8 }}
                />
                <Text className="text-sm" style={{ color: colors.text }}>
                  {guest.name}
                </Text>
                <View style={{ marginLeft: 6, backgroundColor: isDark ? "#3A3A5C" : "#EEF2FF", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: "#6366F1" }}>Guest</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      )}
    </>
  );
}
