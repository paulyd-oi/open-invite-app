import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  Share,
  FlatList,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Calendar,
  Users,
  Clock,
  Sparkles,
  Gift,
  Share2,
  Shield,
  Lock,
  UsersRound,
  CalendarPlus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Heart,
  Settings,
  Cake,
  Briefcase,
  CalendarSync,
  Contact,
  Check,
  Phone,
  Mail,
  Send,
} from "@/ui/icons";
import Animated, {
  FadeInUp,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  FadeIn,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Contacts from "expo-contacts";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTheme, LIGHT_COLORS, DARK_COLORS } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { safeToast } from "@/lib/safeToast";
import { requestBootstrapRefreshOnce, useBootAuthority } from "@/hooks/useBootAuthority";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Animated pointer component
const AnimatedPointer = ({ x, y, color }: { x: number; y: number; color: string }) => {
  const pulseAnim = useSharedValue(0);
  const bounceAnim = useSharedValue(0);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    bounceAnim.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 400 }),
        withTiming(0, { duration: 400 })
      ),
      -1,
      false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulseAnim.value, [0, 1], [0.6, 0]),
    transform: [{ scale: interpolate(pulseAnim.value, [0, 1], [1, 2]) }],
  }));

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceAnim.value }],
  }));

  return (
    <View style={{ position: 'absolute', left: x - 24, top: y - 24, zIndex: 100 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: color,
          },
          pulseStyle,
        ]}
      />
      <Animated.View style={bounceStyle}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Text style={{ fontSize: 24 }}>👆</Text>
        </View>
      </Animated.View>
    </View>
  );
};

// Mock calendar component - matches in-app calendar style
const MockCalendar = ({
  themeColor,
  highlightDate,
  onDateTap,
  isDark,
  colors,
}: {
  themeColor: string;
  highlightDate?: number;
  onDateTap?: (date: number) => void;
  isDark: boolean;
  colors: typeof LIGHT_COLORS;
}) => {
  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  // Much fuller calendar with events on most days - matching the reference design
  const eventDays: Record<number, string[]> = {
    1: ['#E74C3C'],
    2: ['#4ECDC4'],
    4: ['#F59E0B'],
    5: ['#4ECDC4', '#E74C3C'],
    7: ['#3B82F6'],
    8: ['#9B59B6'],
    9: ['#F59E0B'],
    10: ['#4ECDC4'],
    11: [themeColor, '#4ECDC4'],
    12: ['#4ECDC4', '#F59E0B'],
    13: ['#E74C3C'],
    14: ['#F59E0B', '#9B59B6'],
    15: ['#3B82F6', '#4ECDC4'],
    16: ['#9B59B6', '#F59E0B'],
    17: ['#3B82F6'],
    18: ['#3B82F6'],
    19: ['#4ECDC4', '#E74C3C'],
    20: ['#E74C3C'],
    21: ['#F59E0B'],
    23: ['#3B82F6'],
    24: ['#9B59B6'],
    25: ['#E74C3C'],
    26: ['#4ECDC4', '#E74C3C'],
    27: ['#4ECDC4'],
    28: ['#F59E0B', '#9B59B6'],
    29: ['#3B82F6'],
    30: ['#E74C3C'],
  };
  const today = 11; // Simulated "today"

  return (
    <View className="mx-4 mt-4">
      {/* Calendar Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Calendar size={18} color={themeColor} />
          <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
            January 2026
          </Text>
        </View>
        <View className="flex-row items-center">
          <View
            className="w-8 h-8 rounded-full items-center justify-center"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
          >
            <ChevronLeft size={18} color={themeColor} />
          </View>
          <View
            className="w-8 h-8 rounded-full items-center justify-center ml-2"
            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
          >
            <ChevronRight size={18} color={themeColor} />
          </View>
        </View>
      </View>

      {/* Calendar Grid */}
      <View
        className="rounded-2xl p-3"
        style={{
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
        }}
      >
        {/* Day Labels */}
        <View className="flex-row mb-2">
          {days.map((day, idx) => (
            <View key={idx} className="flex-1 items-center">
              <Text
                className="text-xs font-medium"
                style={{ color: idx === 0 || idx === 6 ? colors.textTertiary : colors.textSecondary }}
              >
                {day}
              </Text>
            </View>
          ))}
        </View>

        {/* Calendar Days */}
        <View>
          {/* First row with offset */}
          <View className="flex-row">
            {[0, 1, 2, 3].map((_, i) => (
              <View key={`empty-${i}`} style={{ width: '14.28%', height: 44 }} />
            ))}
            {[1, 2, 3].map((date) => {
              const isHighlighted = highlightDate === date;
              const isToday = date === today;
              const hasEvents = eventDays[date];
              const dayOfWeek = (date + 3) % 7;
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

              return (
                <Pressable
                  key={date}
                  onPress={() => onDateTap?.(date)}
                  style={{ width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    className="rounded-full items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      backgroundColor: isToday ? themeColor : isHighlighted ? `${themeColor}40` : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: isWeekend ? '400' : '600',
                        color: isToday ? '#fff' : isWeekend ? colors.textTertiary : colors.text,
                      }}
                    >
                      {date}
                    </Text>
                  </View>
                  {hasEvents && !isToday && (
                    <View className="absolute bottom-1 w-full px-1">
                      {hasEvents.slice(0, 2).map((color, idx) => (
                        <View
                          key={idx}
                          style={{
                            width: '100%',
                            height: 3,
                            borderRadius: 1.5,
                            marginTop: idx > 0 ? 1 : 0,
                            backgroundColor: color,
                          }}
                        />
                      ))}
                    </View>
                  )}
                  {hasEvents && isToday && (
                    <View className="absolute bottom-1 w-full px-1">
                      {hasEvents.slice(0, 2).map((color, idx) => (
                        <View
                          key={idx}
                          style={{
                            width: '100%',
                            height: 3,
                            borderRadius: 1.5,
                            marginTop: idx > 0 ? 1 : 0,
                            backgroundColor: '#fff',
                          }}
                        />
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          {/* Remaining rows */}
          {[0, 1, 2, 3].map((weekIndex) => (
            <View key={weekIndex} className="flex-row">
              {Array.from({ length: 7 }, (_, dayIndex) => {
                const date = 4 + weekIndex * 7 + dayIndex;
                if (date > 31) return <View key={dayIndex} style={{ width: '14.28%', height: 44 }} />;

                const isHighlighted = highlightDate === date;
                const isToday = date === today;
                const hasEvents = eventDays[date];
                const isWeekend = dayIndex === 0 || dayIndex === 6;

                return (
                  <Pressable
                    key={date}
                    onPress={() => onDateTap?.(date)}
                    style={{ width: '14.28%', height: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View
                      className="rounded-full items-center justify-center"
                      style={{
                        width: 32,
                        height: 32,
                        backgroundColor: isToday ? themeColor : isHighlighted ? `${themeColor}40` : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isWeekend ? '400' : '600',
                          color: isToday ? '#fff' : isWeekend ? colors.textTertiary : colors.text,
                        }}
                      >
                        {date}
                      </Text>
                    </View>
                    {hasEvents && !isToday && (
                      <View className="absolute bottom-1 w-full px-1">
                        {hasEvents.slice(0, 2).map((color, idx) => (
                          <View
                            key={idx}
                            style={{
                              width: '100%',
                              height: 3,
                              borderRadius: 1.5,
                              marginTop: idx > 0 ? 1 : 0,
                              backgroundColor: color,
                            }}
                          />
                        ))}
                      </View>
                    )}
                    {hasEvents && isToday && (
                      <View className="absolute bottom-1 w-full px-1">
                        {hasEvents.slice(0, 2).map((color, idx) => (
                          <View
                            key={idx}
                            style={{
                              width: '100%',
                              height: 3,
                              borderRadius: 1.5,
                              marginTop: idx > 0 ? 1 : 0,
                              backgroundColor: '#fff',
                            }}
                          />
                        ))}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {/* Legend */}
        <View
          className="flex-row items-center justify-center mt-2 pt-2"
          style={{ borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
        >
          <Text className="text-xs" style={{ color: colors.textTertiary }}>
            Tap a date to see events
          </Text>
        </View>
      </View>
    </View>
  );
};

// Mock event card
const MockEventCard = ({
  title,
  time,
  color,
  withLock,
  groupName,
  isDark,
  colors,
}: {
  title: string;
  time: string;
  color: string;
  withLock?: boolean;
  groupName?: string;
  isDark: boolean;
  colors: typeof LIGHT_COLORS;
}) => (
  <View
    className="rounded-xl p-3 mx-4 mb-2"
    style={{
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      borderLeftWidth: 4,
      borderLeftColor: color,
    }}
  >
    <View className="flex-row justify-between items-start">
      <View className="flex-1">
        <Text className="font-semibold text-base" style={{ color: colors.text }}>{title}</Text>
        <View className="flex-row items-center mt-1.5">
          <Clock size={12} color={colors.textTertiary} />
          <Text className="text-xs ml-1.5" style={{ color: colors.textTertiary }}>{time}</Text>
        </View>
      </View>
      {withLock && (
        <View
          className="px-2.5 py-1.5 rounded-full flex-row items-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)' }}
        >
          <Lock size={11} color={colors.textSecondary} />
          <Text className="text-xs ml-1.5 font-medium" style={{ color: colors.textSecondary }}>{groupName || "Private"}</Text>
        </View>
      )}
    </View>
  </View>
);

// Mock friends available section
const MockFriendsAvailable = ({ date, isDark, colors }: { date: number; isDark: boolean; colors: typeof LIGHT_COLORS }) => (
  <View
    className="mx-4 mt-4 rounded-xl p-4"
    style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
  >
    <Text className="text-sm mb-3" style={{ color: colors.textTertiary }}>Available on Jan {date}</Text>
    <View className="flex-row">
      {['Sarah', 'Mike', 'Alex', 'Emma'].map((name, i) => (
        <View key={i} className="items-center mr-4">
          <View
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: ['#4ECDC4', '#F59E0B', '#9B59B6', '#E74C3C'][i] + '40' }}
          >
            <Text className="font-bold text-lg" style={{ color: colors.text }}>{name[0]}</Text>
          </View>
          <Text className="text-xs mt-1.5" style={{ color: colors.textTertiary }}>{name}</Text>
        </View>
      ))}
      <View className="items-center">
        <View
          className="w-12 h-12 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
        >
          <Text className="text-sm font-medium" style={{ color: colors.textTertiary }}>+5</Text>
        </View>
        <Text className="text-xs mt-1.5" style={{ color: colors.textTertiary }}>more</Text>
      </View>
    </View>
  </View>
);

// Mock groups
const MockFriendGroups = ({ themeColor, isDark, colors }: { themeColor: string; isDark: boolean; colors: typeof LIGHT_COLORS }) => (
  <View className="mx-4 mt-4">
    <Text className="text-sm mb-3" style={{ color: colors.textTertiary }}>Your Groups</Text>
    <View className="gap-2">
      <View className="flex-row gap-2">
        <View
          className="flex-1 rounded-xl p-3 border-2"
          style={{ backgroundColor: `${themeColor}20`, borderColor: themeColor }}
        >
          <View className="flex-row items-center">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: `${themeColor}40` }}
            >
              <Heart size={18} color={themeColor} />
            </View>
            <View>
              <Text className="font-semibold" style={{ color: colors.text }}>Close Friends</Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>8 members</Text>
            </View>
          </View>
        </View>
        <View
          className="flex-1 rounded-xl p-3 border-2 border-transparent"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
        >
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-full bg-blue-500/30 items-center justify-center mr-3">
              <Users size={18} color="#3B82F6" />
            </View>
            <View>
              <Text className="font-semibold" style={{ color: colors.text }}>Work Crew</Text>
              <Text className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>5 members</Text>
            </View>
          </View>
        </View>
      </View>
      <View
        className="rounded-xl p-3"
        style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
      >
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-green-500/30 items-center justify-center mr-3">
            <UsersRound size={18} color="#10B981" />
          </View>
          <View>
            <Text className="font-semibold" style={{ color: colors.text }}>Family</Text>
            <Text className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>12 members</Text>
          </View>
        </View>
      </View>
    </View>
  </View>
);

// Mock visibility selector
const MockVisibilitySelector = ({ themeColor, isDark, colors }: { themeColor: string; isDark: boolean; colors: typeof LIGHT_COLORS }) => (
  <View className="mx-4 mt-4">
    <Text className="text-sm mb-3" style={{ color: colors.textTertiary }}>Who can see this event?</Text>
    <View className="flex-row gap-2">
      <View
        className="flex-1 rounded-xl p-3 border-2"
        style={{
          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
          borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
        }}
      >
        <View className="flex-row items-center justify-center">
          <Users size={18} color={colors.textTertiary} />
          <Text className="text-sm ml-2" style={{ color: colors.textTertiary }}>All Friends</Text>
        </View>
      </View>
      <View
        className="flex-1 rounded-xl p-3 border-2"
        style={{ backgroundColor: `${themeColor}20`, borderColor: themeColor }}
      >
        <View className="flex-row items-center justify-center">
          <Lock size={18} color={themeColor} />
          <Text className="text-sm ml-2" style={{ color: themeColor }}>Select Groups</Text>
        </View>
      </View>
    </View>
  </View>
);

// Mock invite/share card
const MockInviteCard = ({ themeColor, referralCode, isDark, colors }: { themeColor: string; referralCode: string; isDark: boolean; colors: typeof LIGHT_COLORS }) => (
  <View className="mx-4 mt-4">
    <View
      className="rounded-2xl p-4"
      style={{
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
      }}
    >
      <View className="flex-row items-center mb-4">
        <View
          className="w-14 h-14 rounded-xl items-center justify-center mr-4"
          style={{ backgroundColor: `${themeColor}30` }}
        >
          <Gift size={28} color={themeColor} />
        </View>
        <View className="flex-1">
          <Text className="font-bold text-lg" style={{ color: colors.text }}>Earn Rewards!</Text>
          <Text className="text-sm" style={{ color: colors.textTertiary }}>Invite friends to unlock premium</Text>
        </View>
      </View>

      <View
        className="rounded-xl p-3 mb-4"
        style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)' }}
      >
        <Text className="text-xs text-center mb-1" style={{ color: colors.textTertiary }}>Your Invite Code</Text>
        <Text className="font-bold text-xl text-center tracking-widest" style={{ color: colors.text }}>{referralCode}</Text>
      </View>

      <View className="flex-row justify-between">
        {[
          { count: '3', reward: '1 Month' },
          { count: '10', reward: '1 Year' },
          { count: '20', reward: 'Lifetime' },
        ].map((tier, i) => (
          <View key={i} className="items-center flex-1">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mb-1"
              style={{ backgroundColor: `${themeColor}${i === 0 ? '60' : '30'}` }}
            >
              <Text className="font-bold" style={{ color: colors.text }}>{tier.count}</Text>
            </View>
            <Text className="text-xs" style={{ color: colors.textTertiary }}>{tier.reward}</Text>
            <Text className="text-xs" style={{ color: colors.textTertiary }}>FREE</Text>
          </View>
        ))}
      </View>
    </View>
  </View>
);

// Floating action button
const FloatingAddButton = ({
  themeColor,
  onPress,
  position
}: {
  themeColor: string;
  onPress?: () => void;
  position: { bottom: number; right: number };
}) => (
  <Pressable
    onPress={onPress}
    style={{
      position: 'absolute',
      bottom: position.bottom,
      right: position.right,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: themeColor,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: themeColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 8,
    }}
  >
    <Plus size={28} color="#fff" />
  </Pressable>
);

export default function OnboardingScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const queryClient = useQueryClient();
  const { status: bootStatus } = useBootAuthority();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pendingCalendarRoute, setPendingCalendarRoute] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [showFriendsAvailable, setShowFriendsAvailable] = useState(false);
  const [demoReferralCode] = useState("bdia_t8js");

  // Contact sync state
  const [contactsLoading, setContactsLoading] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contacts.Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [contactsSynced, setContactsSynced] = useState(false);
  const [sendingInvites, setSendingInvites] = useState(false);

  // Send friend request mutation
  const sendRequestMutation = useMutation({
    mutationFn: (data: { email?: string; phone?: string }) =>
      api.post("/api/friends/request", data),
    onError: (error) => {
      console.error("Failed to send friend request:", error);
    },
  });

  const loadContacts = async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning(
          "Permission Required",
          "Please allow access to contacts to find friends who are using Open Invite."
        );
        setContactsLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Image,
        ],
        sort: Contacts.SortTypes.FirstName,
      });

      // Filter contacts that have either email or phone
      const validContacts = data.filter(
        (c) => (c.emails && c.emails.length > 0) || (c.phoneNumbers && c.phoneNumbers.length > 0)
      );
      setPhoneContacts(validContacts.slice(0, 50)); // Limit to 50 contacts for performance
      setContactsSynced(true);
    } catch (error) {
      console.error("Error loading contacts:", error);
      safeToast.error("Error", "Failed to load contacts");
    }
    setContactsLoading(false);
  };

  const toggleContactSelection = (contactId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedContacts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };

  const sendSelectedInvites = async () => {
    if (selectedContacts.size === 0) return;

    setSendingInvites(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const selectedContactsArray = phoneContacts.filter((c) => c.id && selectedContacts.has(c.id));
    let sentCount = 0;

    for (const contact of selectedContactsArray) {
      const email = contact.emails?.[0]?.email;
      const phone = contact.phoneNumbers?.[0]?.number;

      try {
        if (email) {
          await sendRequestMutation.mutateAsync({ email });
          sentCount++;
        } else if (phone) {
          await sendRequestMutation.mutateAsync({ phone });
          sentCount++;
        }
      } catch (error) {
        // Continue sending to other contacts
        console.error(`Failed to send invite to ${contact.name}:`, error);
      }
    }

    setSendingInvites(false);
    queryClient.invalidateQueries({ queryKey: ["friendRequests"] });

    if (sentCount > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success(
        "Invites Sent!",
        `Friend requests sent to ${sentCount} contact${sentCount !== 1 ? "s" : ""}. They'll see your invite when they join Open Invite!`
      );
    }

    // Move to next step
    goToNext();
  };

  const handleShare = async () => {
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const data = await api.get<{ referralCode: string; shareLink: string }>("/api/referral/code");
      const message = `Join me on Open Invite! See what your friends are up to and make plans together.\n\nUse my invite code: ${data.referralCode}\n\nDownload: ${data.shareLink}`;
      await Share.share({ message, title: "Join Open Invite!" });
    } catch (error) {
      console.error("Share error:", error);
      await Share.share({
        message: "Join me on Open Invite! See what your friends are up to and make plans together.\n\nDownload: https://apps.apple.com/app/open-invite/id123456789",
        title: "Join Open Invite!",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const steps = [
    {
      id: "welcome",
      title: "Your Social Calendar",
      subtitle: "Welcome to Open Invite",
      description: "See what your friends are up to and share your plans. No more endless group texts!",
      icon: <Calendar size={36} color="#fff" />,
      iconBg: themeColor,
      tip: "Tap any date to see who's free that day",
    },
    {
      id: "contacts",
      title: "Find Your Friends",
      subtitle: "Sync Contacts",
      description: "Find friends who are already using Open Invite, or invite contacts to join you!",
      icon: <Contact size={36} color="#fff" />,
      iconBg: "#3B82F6",
      showContactsSync: true,
    },
    {
      id: "settings",
      title: "Personalize Your Experience",
      subtitle: "Settings to Explore",
      description: "Set up your profile in Settings to get the most out of Open Invite:",
      icon: <Sparkles size={36} color="#fff" />,
      iconBg: "#8B5CF6",
      features: [
        { icon: "🎂", title: "Birthday", desc: "Share your birthday with friends" },
        { icon: "💼", title: "Work Hours", desc: "Block out your busy times" },
        { icon: "📅", title: "Import Calendar", desc: "Sync your existing events" },
      ],
    },
    {
      id: "create",
      title: "Create Events",
      subtitle: "Share Your Plans",
      description: "Tap the + button to create an event. Your friends will see it on their calendar!",
      icon: <CalendarPlus size={36} color="#fff" />,
      iconBg: "#4ECDC4",
      hasPointer: true,
      pointerTarget: "fab",
    },
    {
      id: "privacy",
      title: "Private Events & Groups",
      subtitle: "Control Who Sees What",
      description: "Create groups to share events with specific people. Perfect for surprise parties, close friend hangouts, or work events!",
      icon: <Shield size={36} color="#fff" />,
      iconBg: "#9B59B6",
      tip: "Only friends you accept can see your calendar",
    },
    {
      id: "circles",
      title: "Circles",
      subtitle: "Schedule Together",
      description: "Create Circles with your closest friends. See everyone's calendars stacked together and find the perfect time to hang out!",
      icon: <UsersRound size={36} color="#fff" />,
      iconBg: "#F59E0B",
      tip: "Plan events when everyone is free",
    },
    {
      id: "invite",
      title: "Invite Friends",
      subtitle: "Earn Rewards",
      description: "Open Invite is better with friends! Share the app and earn premium rewards.",
      icon: <Gift size={36} color="#fff" />,
      iconBg: "#10B981",
      tip: "3 friends = 1 month FREE | 10 friends = 1 year FREE | 20 friends = LIFETIME!",
      showShareButton: true,
    },
    {
      id: "ready",
      title: "You're Ready!",
      subtitle: "Let's Get Started",
      description: "Create your first event, add friends, and start making plans together!",
      icon: <Sparkles size={36} color="#fff" />,
      iconBg: themeColor,
    },
  ];

  const currentStep = steps[currentIndex];
  const isLastStep = currentIndex === steps.length - 1;

  // Reset demo state when step changes
  useEffect(() => {
    setSelectedDate(null);
    setShowFriendsAvailable(false);
  }, [currentIndex]);

  const handleDateTap = (date: number) => {
    if (currentStep.id === "available") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDate(date);
      setShowFriendsAvailable(true);
    }
  };

  const handleFabPress = () => {
    if (currentStep.id === "create") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Visual feedback - move to next step
      goToNext();
    }
  };

  const goToNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLastStep) {
      completeOnboarding();
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const completeOnboarding = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await api.post("/api/onboarding/complete", {});
      // Invalidate session + onboarding status so calendar/bootstrap refetches fresh state
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    }
    // Request bootstrap refresh and wait for it to complete before routing
    requestBootstrapRefreshOnce();
    setPendingCalendarRoute(true);
  };

  const skipOnboarding = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    completeOnboarding();
  };

  // Wait for bootstrap refresh to complete before routing to calendar
  useEffect(() => {
    if (!pendingCalendarRoute) return;

    if (bootStatus === 'authed') {
      console.log('[Onboarding] Bootstrap refresh complete (authed) - routing to calendar');
      setPendingCalendarRoute(false);
      router.replace('/calendar');
    } else if (bootStatus === 'loggedOut' || bootStatus === 'error') {
      console.log('[Onboarding] Bootstrap refresh failed (' + bootStatus + ') - routing to login');
      setPendingCalendarRoute(false);
      router.replace('/login');
    }
  }, [pendingCalendarRoute, bootStatus, router]);

  // Render mock UI for each step
  const renderMockUI = () => {
    switch (currentStep.id) {
      case "welcome":
        return (
          <View className="flex-1">
            <MockCalendar themeColor={themeColor} isDark={isDark} colors={colors} />
            <View className="mt-3">
              <MockEventCard title="Coffee with Sarah" time="10:00 AM" color="#4ECDC4" isDark={isDark} colors={colors} />
              <MockEventCard title="Team Lunch" time="12:30 PM" color="#F59E0B" isDark={isDark} colors={colors} />
              <MockEventCard title="Movie Night" time="7:00 PM" color="#9B59B6" isDark={isDark} colors={colors} />
            </View>
          </View>
        );

      case "contacts":
        return (
          <View className="flex-1 mx-4 mt-4">
            {!contactsSynced ? (
              // Show sync contacts prompt
              <View
                className="rounded-2xl p-6 items-center"
                style={{
                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                }}
              >
                <View
                  className="w-20 h-20 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: "#3B82F620" }}
                >
                  <Contact size={40} color="#3B82F6" />
                </View>
                <Text className="font-bold text-xl text-center mb-2" style={{ color: colors.text }}>
                  Find Friends Faster
                </Text>
                <Text className="text-center mb-6" style={{ color: colors.textSecondary }}>
                  We'll check if any of your contacts are already on Open Invite
                </Text>
                <Pressable
                  onPress={loadContacts}
                  disabled={contactsLoading}
                  className="rounded-xl py-4 px-8 w-full items-center"
                  style={{ backgroundColor: "#3B82F6" }}
                >
                  {contactsLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <View className="flex-row items-center">
                      <Contact size={20} color="#fff" />
                      <Text className="text-white font-semibold text-base ml-2">
                        Sync Contacts
                      </Text>
                    </View>
                  )}
                </Pressable>
                <Pressable onPress={goToNext} className="mt-4">
                  <Text className="text-sm" style={{ color: colors.textTertiary }}>Skip for now</Text>
                </Pressable>
              </View>
            ) : (
              // Show contacts list
              <View className="flex-1">
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="font-semibold" style={{ color: colors.text }}>
                    {selectedContacts.size > 0
                      ? `${selectedContacts.size} selected`
                      : "Select contacts to invite"}
                  </Text>
                  {selectedContacts.size > 0 && (
                    <Pressable
                      onPress={() => setSelectedContacts(new Set())}
                    >
                      <Text className="text-blue-400 text-sm">Clear all</Text>
                    </Pressable>
                  )}
                </View>
                <FlatList
                  data={phoneContacts}
                  keyExtractor={(item) => item.id ?? item.name ?? "unknown"}
                  style={{ maxHeight: 300 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item, index }) => {
                    const isSelected = item.id ? selectedContacts.has(item.id) : false;
                    const email = item.emails?.[0]?.email;
                    const phone = item.phoneNumbers?.[0]?.number;

                    return (
                      <Animated.View entering={FadeIn.delay(index * 30)}>
                        <Pressable
                          onPress={() => item.id && toggleContactSelection(item.id)}
                          className="flex-row items-center py-3 px-3 rounded-xl mb-2"
                          style={{
                            backgroundColor: isSelected ? "#3B82F630" : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)"),
                            borderWidth: isSelected ? 1 : 0,
                            borderColor: "#3B82F6",
                          }}
                        >
                          <View
                            className="w-10 h-10 rounded-full items-center justify-center mr-3"
                            style={{ backgroundColor: isSelected ? "#3B82F640" : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)") }}
                          >
                            {item.imageAvailable && item.image?.uri ? (
                              <Image
                                source={{ uri: item.image.uri }}
                                className="w-full h-full rounded-full"
                              />
                            ) : (
                              <Text className="font-semibold" style={{ color: colors.text }}>
                                {item.name?.[0]?.toUpperCase() ?? "?"}
                              </Text>
                            )}
                          </View>
                          <View className="flex-1">
                            <Text className="font-medium" style={{ color: colors.text }}>
                              {item.name ?? "Unknown"}
                            </Text>
                            <View className="flex-row items-center mt-0.5">
                              {email ? (
                                <>
                                  <Mail size={10} color={colors.textTertiary} />
                                  <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>{email}</Text>
                                </>
                              ) : phone ? (
                                <>
                                  <Phone size={10} color={colors.textTertiary} />
                                  <Text className="text-xs ml-1" style={{ color: colors.textTertiary }}>{phone}</Text>
                                </>
                              ) : null}
                            </View>
                          </View>
                          <View
                            className="w-6 h-6 rounded-full items-center justify-center"
                            style={{
                              backgroundColor: isSelected ? "#3B82F6" : "transparent",
                              borderWidth: isSelected ? 0 : 2,
                              borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
                            }}
                          >
                            {isSelected && <Check size={14} color="#fff" />}
                          </View>
                        </Pressable>
                      </Animated.View>
                    );
                  }}
                />
                {phoneContacts.length === 0 && (
                  <View className="items-center py-8">
                    <Text style={{ color: colors.textTertiary }}>No contacts with email or phone found</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        );

      case "settings":
        return (
          <View className="flex-1 mx-4 mt-4">
            <View
              className="rounded-2xl p-4"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              }}
            >
              <View className="flex-row items-center mb-4">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: `${currentStep.iconBg}40` }}
                >
                  <Settings size={20} color={currentStep.iconBg} />
                </View>
                <Text className="font-semibold text-lg" style={{ color: colors.text }}>Settings</Text>
              </View>
              {(currentStep as any).features?.map((feature: { icon: string; title: string; desc: string }, idx: number) => (
                <View
                  key={idx}
                  className="flex-row items-center py-3"
                  style={{ borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}
                >
                  <Text className="text-2xl mr-3">{feature.icon}</Text>
                  <View className="flex-1">
                    <Text className="font-medium" style={{ color: colors.text }}>{feature.title}</Text>
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>{feature.desc}</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textTertiary} />
                </View>
              ))}
            </View>
          </View>
        );

      case "create":
        return (
          <View className="flex-1">
            <MockCalendar themeColor={themeColor} highlightDate={15} isDark={isDark} colors={colors} />
            <View className="mt-3">
              <MockEventCard title="Coffee with Sarah" time="10:00 AM" color="#4ECDC4" isDark={isDark} colors={colors} />
              <MockEventCard title="Team Lunch" time="12:30 PM" color="#F59E0B" isDark={isDark} colors={colors} />
            </View>
            <FloatingAddButton
              themeColor={themeColor}
              onPress={handleFabPress}
              position={{ bottom: 200, right: 24 }}
            />
            {currentStep.hasPointer && (
              <AnimatedPointer
                x={SCREEN_WIDTH - 52}
                y={SCREEN_HEIGHT - 340}
                color="#4ECDC4"
              />
            )}
          </View>
        );

      case "privacy":
        return (
          <View className="flex-1">
            <MockFriendGroups themeColor={themeColor} isDark={isDark} colors={colors} />
            <MockVisibilitySelector themeColor={themeColor} isDark={isDark} colors={colors} />
            <View className="mt-3">
              <MockEventCard
                title="Surprise Birthday Party 🎂"
                time="7:00 PM"
                color="#E74C3C"
                withLock
                groupName="Close Friends"
                isDark={isDark}
                colors={colors}
              />
              <MockEventCard
                title="Game Night"
                time="8:00 PM"
                color="#9B59B6"
                withLock
                groupName="Work Crew"
                isDark={isDark}
                colors={colors}
              />
            </View>
          </View>
        );

      case "circles":
        return (
          <View className="flex-1 mx-4 mt-4">
            {/* Circle Header - matches actual circle/[id].tsx */}
            <View
              className="rounded-2xl p-4 mb-3"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              }}
            >
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center">
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: '#EC489940' }}
                  >
                    <Text className="text-lg">🌺</Text>
                  </View>
                  <View>
                    <Text className="font-bold text-base" style={{ color: colors.text }}>Hawaii Trip!!</Text>
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>6 members</Text>
                  </View>
                </View>
                {/* Member avatars */}
                <View className="flex-row items-center">
                  {['C', 'M', 'A'].map((initial, i) => (
                    <View
                      key={i}
                      className="w-7 h-7 rounded-full items-center justify-center border-2"
                      style={{
                        backgroundColor: ['#4ECDC440', '#F59E0B40', '#9B59B640'][i],
                        borderColor: colors.surface,
                        marginLeft: i > 0 ? -8 : 0,
                        zIndex: 3 - i,
                      }}
                    >
                      <Text className="text-xs font-bold" style={{ color: colors.text }}>{initial}</Text>
                    </View>
                  ))}
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center border-2"
                    style={{
                      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      borderColor: colors.surface,
                      marginLeft: -8,
                    }}
                  >
                    <Text className="text-xs" style={{ color: colors.textTertiary }}>+3</Text>
                  </View>
                </View>
              </View>

              {/* Calendar Mini - matches actual circle calendar */}
              <View
                className="rounded-xl p-3"
                style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }}
              >
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <Calendar size={14} color="#EC4899" />
                    <Text className="text-sm font-semibold ml-2" style={{ color: colors.text }}>January 2026</Text>
                  </View>
                </View>

                {/* Calendar Grid Mini */}
                <View className="flex-row mb-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                    <View key={idx} className="flex-1 items-center">
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>{day}</Text>
                    </View>
                  ))}
                </View>
                {/* Calendar week with event dots */}
                <View className="flex-row">
                  {[12, 13, 14, 15, 16, 17, 18].map((date, idx) => {
                    const isSelected = date === 14;
                    const hasEvents = [15, 16, 17, 18, 19].includes(date);
                    return (
                      <View key={date} className="flex-1 items-center py-1">
                        <View
                          className="w-7 h-7 rounded-full items-center justify-center"
                          style={{ backgroundColor: isSelected ? '#EC4899' : 'transparent' }}
                        >
                          <Text
                            className="text-xs font-medium"
                            style={{ color: isSelected ? '#fff' : colors.text }}
                          >
                            {date}
                          </Text>
                        </View>
                        {hasEvents && !isSelected && (
                          <View className="flex-row mt-0.5">
                            <View className="w-1 h-1 rounded-full mx-0.5" style={{ backgroundColor: '#EC4899' }} />
                            <View className="w-1 h-1 rounded-full mx-0.5" style={{ backgroundColor: '#4ECDC4' }} />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Everyone is free section */}
                <View className="mt-3 pt-2" style={{ borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }}>
                  <Text className="text-xs mb-2" style={{ color: colors.textTertiary }}>Everyone is free:</Text>
                  <View className="flex-row flex-wrap gap-1">
                    {['Wed 9am (12h)', 'Thu 12pm (9h)', 'Fri 9am (2h)', 'Fri 1pm (8h)'].map((slot, i) => (
                      <View
                        key={i}
                        className="flex-row items-center px-2 py-1 rounded-full"
                        style={{ backgroundColor: '#EC489920' }}
                      >
                        <Clock size={10} color="#EC4899" />
                        <Text className="text-xs ml-1" style={{ color: '#EC4899' }}>{slot}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Member legend */}
                <View className="flex-row items-center mt-2 flex-wrap">
                  {[
                    { name: 'Chris', color: '#E74C3C' },
                    { name: 'Marcus', color: '#4ECDC4' },
                    { name: 'Alex', color: '#9B59B6' },
                    { name: 'Emma', color: '#F59E0B' },
                  ].map((member, i) => (
                    <View key={i} className="flex-row items-center mr-3">
                      <View className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: member.color }} />
                      <Text className="text-xs" style={{ color: colors.textTertiary }}>{member.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Chat Message */}
            <View className="items-end mb-3">
              <View
                className="rounded-2xl px-4 py-3 max-w-[85%]"
                style={{ backgroundColor: '#EC4899' }}
              >
                <Text className="text-white text-sm">This group is for Hawaii 2026!!! Lets start planning out the trip!</Text>
              </View>
              <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>5:45 PM</Text>
            </View>

            {/* Message Input */}
            <View
              className="flex-row items-center rounded-2xl px-4 py-3"
              style={{ backgroundColor: isDark ? '#2C2C2E' : '#F3F4F6' }}
            >
              <Text className="flex-1 text-sm" style={{ color: colors.textTertiary }}>Message...</Text>
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: isDark ? '#3C3C3E' : '#E5E7EB' }}
              >
                <Send size={14} color={colors.textTertiary} />
              </View>
            </View>
          </View>
        );

      case "invite":
        return (
          <View className="flex-1">
            <MockInviteCard themeColor={themeColor} referralCode={demoReferralCode} isDark={isDark} colors={colors} />
          </View>
        );

      case "ready":
        return (
          <View className="flex-1">
            <MockCalendar themeColor={themeColor} highlightDate={new Date().getDate()} isDark={isDark} colors={colors} />
            <View className="mt-3">
              <MockEventCard title="Your First Event?" time="Add one!" color={themeColor} isDark={isDark} colors={colors} />
            </View>
            <View className="mx-4 mt-4 items-center">
              <View
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
              >
                <Text className="text-sm" style={{ color: colors.textSecondary }}>✨ You're all set! ✨</Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  // Show "Finishing setup..." screen while waiting for bootstrap refresh
  if (pendingCalendarRoute) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <LinearGradient
          colors={isDark
            ? [`${themeColor}50`, `${themeColor}20`, colors.background, colors.background]
            : [`${themeColor}30`, `${themeColor}10`, colors.background, colors.background]
          }
          locations={[0, 0.2, 0.5, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SafeAreaView className="flex-1 items-center justify-center px-8">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: `${themeColor}40` }}
          >
            <Sparkles size={40} color={themeColor} />
          </View>
          <Text className="text-2xl font-bold text-center mb-2" style={{ color: colors.text }}>
            Finishing setup...
          </Text>
          <Text className="text-base text-center" style={{ color: colors.textSecondary }}>
            Getting everything ready for you
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <LinearGradient
        colors={isDark
          ? [`${currentStep.iconBg}50`, `${currentStep.iconBg}20`, colors.background, colors.background]
          : [`${currentStep.iconBg}30`, `${currentStep.iconBg}10`, colors.background, colors.background]
        }
        locations={[0, 0.2, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="flex-row justify-between items-center px-6 pt-2 pb-4">
          <View className="flex-row gap-1.5">
            {steps.map((_, index) => (
              <View
                key={index}
                className="h-1 rounded-full"
                style={{
                  width: index === currentIndex ? 24 : 8,
                  backgroundColor: index === currentIndex ? currentStep.iconBg : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'),
                }}
              />
            ))}
          </View>
          <Pressable onPress={skipOnboarding} hitSlop={20}>
            <Text style={{ color: colors.textTertiary }} className="text-sm font-medium">Skip</Text>
          </Pressable>
        </View>

        {/* Mock UI Area */}
        <Animated.View
          key={currentStep.id}
          entering={SlideInRight.duration(300)}
          className="flex-1"
        >
          <View className="flex-1 relative">
            {renderMockUI()}
          </View>
        </Animated.View>

        {/* Bottom Card */}
        <View className="px-4 pb-4">
          <Animated.View
            entering={FadeInUp.delay(100)}
            className="backdrop-blur-xl rounded-3xl p-5"
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            }}
          >
            {/* Icon & Title */}
            <View className="flex-row items-center mb-3">
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: currentStep.iconBg }}
              >
                {currentStep.icon}
              </View>
              <View className="flex-1">
                <Text
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: currentStep.iconBg }}
                >
                  {currentStep.subtitle}
                </Text>
                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                  {currentStep.title}
                </Text>
              </View>
            </View>

            {/* Description */}
            <Text className="text-base leading-6 mb-3" style={{ color: colors.textSecondary }}>
              {currentStep.description}
            </Text>

            {/* Tip */}
            {currentStep.tip && (
              <View
                className="rounded-xl p-3 mb-3"
                style={{ backgroundColor: `${currentStep.iconBg}20` }}
              >
                <Text className="text-sm text-center" style={{ color: currentStep.iconBg }}>
                  {currentStep.tip}
                </Text>
              </View>
            )}

            {/* Share Button */}
            {currentStep.showShareButton && (
              <Pressable
                onPress={handleShare}
                disabled={isSharing}
                className="flex-row items-center justify-center py-3 rounded-xl mb-3"
                style={{ backgroundColor: currentStep.iconBg }}
              >
                <Share2 size={18} color="#fff" />
                <Text className="text-white text-base font-semibold ml-2">
                  {isSharing ? "Sharing..." : "Share with Friends"}
                </Text>
              </Pressable>
            )}

            {/* Navigation */}
            <View className="flex-row gap-3">
              {currentIndex > 0 && (
                <Pressable
                  onPress={goToPrev}
                  className="flex-1 py-3 rounded-xl items-center"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }}
                >
                  <Text className="font-semibold" style={{ color: colors.text }}>Back</Text>
                </Pressable>
              )}
              {/* Special handling for contacts step with selected contacts */}
              {currentStep.id === "contacts" && contactsSynced && selectedContacts.size > 0 ? (
                <Pressable
                  onPress={sendSelectedInvites}
                  disabled={sendingInvites}
                  className="py-3 rounded-xl items-center"
                  style={{
                    backgroundColor: currentStep.iconBg,
                    flex: currentIndex === 0 ? 1 : 2,
                  }}
                >
                  {sendingInvites ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-white font-semibold">
                      Send {selectedContacts.size} Invite{selectedContacts.size !== 1 ? "s" : ""}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  onPress={goToNext}
                  className="py-3 rounded-xl items-center"
                  style={{
                    backgroundColor: currentStep.iconBg,
                    flex: currentIndex === 0 ? 1 : 2,
                  }}
                >
                  <Text className="text-white font-semibold">
                    {isLastStep ? "Get Started" : "Continue"}
                  </Text>
                </Pressable>
              )}
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
