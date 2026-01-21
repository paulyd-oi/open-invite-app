import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  LayoutAnimation,
  UIManager,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronDown,
  Bell,
  BellOff,
  Calendar,
  Users,
  MessageCircle,
  Heart,
  Clock,
  Sparkles,
  Moon,
  Mail,
  UserPlus,
  Camera,
  Gift,
  CheckCircle,
  AlertCircle,
  Zap,
  TrendingUp,
  RotateCcw,
  StickyNote,
  Volume2,
  VolumeX,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";

// Enable LayoutAnimation for Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Type for notification preferences
interface NotificationPreferences {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  pushEnabled: boolean;
  newFriendEvents: boolean;
  eventReminders: boolean;
  eventUpdates: boolean;
  eventCancellations: boolean;
  eventStartingSoon: boolean;
  newAttendee: boolean;
  attendeeDeclined: boolean;
  someoneInterested: boolean;
  rsvpReminders: boolean;
  eventRequestInvites: boolean;
  eventRequestResponses: boolean;
  eventRequestConfirmed: boolean;
  eventRequestNudges: boolean;
  eventComments: boolean;
  eventPhotos: boolean;
  commentReplies: boolean;
  friendRequests: boolean;
  friendRequestAccepted: boolean;
  friendBirthdays: boolean;
  circleMessages: boolean;
  circleEvents: boolean;
  circleInvites: boolean;
  fomoFriendJoined: boolean;
  fomoPopularEvents: boolean;
  weeklySummary: boolean;
  reconnectSuggestions: boolean;
  businessEvents: boolean;
  dailyDigest: boolean;
  dailyDigestTime: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  eventReflectionPrompts: boolean;
}

// Response types
interface GetNotificationPreferencesResponse {
  preferences: NotificationPreferences;
}

interface UpdateNotificationPreferencesResponse {
  preferences: NotificationPreferences;
}

interface ToggleItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  isDark: boolean;
  colors: {
    text: string;
    textSecondary: string;
    surface: string;
  };
}

function ToggleItem({
  icon,
  title,
  description,
  value,
  onValueChange,
  disabled,
  isDark,
  colors,
}: ToggleItemProps) {
  return (
    <View className="flex-row items-center py-3 px-4">
      <View className="mr-3">{icon}</View>
      <View className="flex-1 mr-3">
        <Text
          style={{ color: disabled ? colors.textSecondary : colors.text }}
          className="text-base font-medium"
        >
          {title}
        </Text>
        <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={(newValue) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onValueChange(newValue);
        }}
        disabled={disabled}
        trackColor={{ false: "#767577", true: "#4ECDC4" }}
        thumbColor={value ? "#fff" : "#f4f3f4"}
        ios_backgroundColor="#3e3e3e"
      />
    </View>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  isDark: boolean;
  colors: {
    text: string;
    textSecondary: string;
    surface: string;
    separator: string;
  };
}

function Section({
  title,
  icon,
  iconColor,
  children,
  expanded,
  onToggle,
  isDark,
  colors,
}: SectionProps) {
  return (
    <View
      className="mx-4 mt-4 rounded-2xl overflow-hidden"
      style={{ backgroundColor: colors.surface }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
        }}
        className="flex-row items-center p-4"
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: `${iconColor}15` }}
        >
          {icon}
        </View>
        <Text style={{ color: colors.text }} className="flex-1 text-base font-semibold">
          {title}
        </Text>
        <ChevronDown
          size={20}
          color={colors.textSecondary}
          style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      {expanded && (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
          {children}
        </View>
      )}
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();

  const [expandedSections, setExpandedSections] = useState<string[]>(["master"]);

  // Fetch preferences
  const { data, isLoading, error } = useQuery<GetNotificationPreferencesResponse>({
    queryKey: ["notificationPreferences"],
    queryFn: async () => {
      return api.get<GetNotificationPreferencesResponse>("/api/notifications/preferences");
    },
  });

  // Update mutation
  const updateMutation = useMutation<
    UpdateNotificationPreferencesResponse,
    Error,
    Partial<NotificationPreferences>
  >({
    mutationFn: async (updates) => {
      return api.put<UpdateNotificationPreferencesResponse>("/api/notifications/preferences", updates);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["notificationPreferences"], data);
    },
  });

  const preferences = data?.preferences;
  const masterEnabled = preferences?.pushEnabled ?? true;

  const toggleSection = (sectionId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | string) => {
    updateMutation.mutate({ [key]: value });
  };

  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      >
        <ActivityIndicator size="large" color={themeColor} />
        <Text style={{ color: colors.textSecondary }} className="mt-4">
          Loading preferences...
        </Text>
      </SafeAreaView>
    );
  }

  if (error || !preferences) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      >
        <AlertCircle size={48} color="#FF6B6B" />
        <Text style={{ color: colors.text }} className="text-lg font-semibold mt-4 text-center">
          Unable to load preferences
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 rounded-xl"
          style={{ backgroundColor: themeColor }}
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3"
        style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{
            backgroundColor: colors.surface,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0 : 0.1,
            shadowRadius: 2,
          }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text style={{ color: colors.text }} className="text-xl font-bold">
            Notifications
          </Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm">
            Customize what you get notified about
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Master Toggle */}
        <Animated.View entering={FadeInDown.delay(0).springify()} className="mx-4 mt-4">
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface }}
          >
            <View className="flex-row items-center p-4">
              <View
                className="w-12 h-12 rounded-full items-center justify-center mr-4"
                style={{ backgroundColor: masterEnabled ? `${themeColor}15` : "#FF6B6B15" }}
              >
                {masterEnabled ? (
                  <Bell size={24} color={themeColor} />
                ) : (
                  <BellOff size={24} color="#FF6B6B" />
                )}
              </View>
              <View className="flex-1 mr-3">
                <Text style={{ color: colors.text }} className="text-lg font-semibold">
                  Push Notifications
                </Text>
                <Text style={{ color: colors.textSecondary }} className="text-sm">
                  {masterEnabled
                    ? "You'll receive notifications based on your preferences below"
                    : "All notifications are currently disabled"}
                </Text>
              </View>
              <Switch
                value={masterEnabled}
                onValueChange={(value) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  updatePreference("pushEnabled", value);
                }}
                trackColor={{ false: "#767577", true: themeColor }}
                thumbColor="#fff"
                ios_backgroundColor="#3e3e3e"
              />
            </View>
          </View>
        </Animated.View>

        {/* Events Section */}
        <Animated.View entering={FadeInDown.delay(50).springify()}>
          <Section
            title="Events"
            icon={<Calendar size={20} color="#4ECDC4" />}
            iconColor="#4ECDC4"
            expanded={expandedSections.includes("events")}
            onToggle={() => toggleSection("events")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<Calendar size={18} color="#4ECDC4" />}
              title="New Friend Events"
              description="When friends create new events"
              value={preferences.newFriendEvents}
              onValueChange={(v) => updatePreference("newFriendEvents", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Clock size={18} color="#45B7D1" />}
              title="Event Reminders"
              description="Reminders before events you're attending"
              value={preferences.eventReminders}
              onValueChange={(v) => updatePreference("eventReminders", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<AlertCircle size={18} color="#F39C12" />}
              title="Event Updates"
              description="When events you're attending are modified"
              value={preferences.eventUpdates}
              onValueChange={(v) => updatePreference("eventUpdates", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<AlertCircle size={18} color="#FF6B6B" />}
              title="Event Cancellations"
              description="When events are cancelled"
              value={preferences.eventCancellations}
              onValueChange={(v) => updatePreference("eventCancellations", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Zap size={18} color="#9B59B6" />}
              title="Starting Soon"
              description="30 minutes before an event starts"
              value={preferences.eventStartingSoon}
              onValueChange={(v) => updatePreference("eventStartingSoon", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* RSVP & Attendance Section */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Section
            title="RSVPs & Attendance"
            icon={<CheckCircle size={20} color="#27AE60" />}
            iconColor="#27AE60"
            expanded={expandedSections.includes("rsvp")}
            onToggle={() => toggleSection("rsvp")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<UserPlus size={18} color="#27AE60" />}
              title="New Attendee"
              description="When someone joins your event"
              value={preferences.newAttendee}
              onValueChange={(v) => updatePreference("newAttendee", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Users size={18} color="#E74C3C" />}
              title="Attendee Declined"
              description="When someone declines your event"
              value={preferences.attendeeDeclined}
              onValueChange={(v) => updatePreference("attendeeDeclined", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Heart size={18} color="#E91E63" />}
              title="Someone Interested"
              description="When someone marks interest in your event"
              value={preferences.someoneInterested}
              onValueChange={(v) => updatePreference("someoneInterested", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Bell size={18} color="#F39C12" />}
              title="RSVP Reminders"
              description="Reminders to respond to event invites"
              value={preferences.rsvpReminders}
              onValueChange={(v) => updatePreference("rsvpReminders", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* Proposed Events Section */}
        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <Section
            title="Proposed Events"
            icon={<MessageCircle size={20} color="#9B59B6" />}
            iconColor="#9B59B6"
            expanded={expandedSections.includes("requests")}
            onToggle={() => toggleSection("requests")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<MessageCircle size={18} color="#9B59B6" />}
              title="New Invitations"
              description="When invited to proposed events"
              value={preferences.eventRequestInvites}
              onValueChange={(v) => updatePreference("eventRequestInvites", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<CheckCircle size={18} color="#27AE60" />}
              title="Member Responses"
              description="When members respond to your proposals"
              value={preferences.eventRequestResponses}
              onValueChange={(v) => updatePreference("eventRequestResponses", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Sparkles size={18} color="#FFD700" />}
              title="Event Confirmed"
              description="When a proposed event is confirmed"
              value={preferences.eventRequestConfirmed}
              onValueChange={(v) => updatePreference("eventRequestConfirmed", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Bell size={18} color="#F39C12" />}
              title="Nudge Reminders"
              description="When someone nudges you to respond"
              value={preferences.eventRequestNudges}
              onValueChange={(v) => updatePreference("eventRequestNudges", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* Comments & Photos Section */}
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Section
            title="Comments & Photos"
            icon={<MessageCircle size={20} color="#3498DB" />}
            iconColor="#3498DB"
            expanded={expandedSections.includes("comments")}
            onToggle={() => toggleSection("comments")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<MessageCircle size={18} color="#3498DB" />}
              title="Event Comments"
              description="Comments on your events"
              value={preferences.eventComments}
              onValueChange={(v) => updatePreference("eventComments", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Camera size={18} color="#8E44AD" />}
              title="Event Photos"
              description="Photos added to events you're part of"
              value={preferences.eventPhotos}
              onValueChange={(v) => updatePreference("eventPhotos", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<MessageCircle size={18} color="#1ABC9C" />}
              title="Comment Replies"
              description="Replies to your comments"
              value={preferences.commentReplies}
              onValueChange={(v) => updatePreference("commentReplies", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* Friends & Social Section */}
        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <Section
            title="Friends & Social"
            icon={<Users size={20} color="#FF6B6B" />}
            iconColor="#FF6B6B"
            expanded={expandedSections.includes("friends")}
            onToggle={() => toggleSection("friends")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<UserPlus size={18} color="#FF6B6B" />}
              title="Friend Requests"
              description="New friend requests"
              value={preferences.friendRequests}
              onValueChange={(v) => updatePreference("friendRequests", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<CheckCircle size={18} color="#27AE60" />}
              title="Request Accepted"
              description="When your friend request is accepted"
              value={preferences.friendRequestAccepted}
              onValueChange={(v) => updatePreference("friendRequestAccepted", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Gift size={18} color="#E91E63" />}
              title="Friend Birthdays"
              description="Birthday reminders for friends"
              value={preferences.friendBirthdays}
              onValueChange={(v) => updatePreference("friendBirthdays", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* Circles Section */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Section
            title="Circles"
            icon={<StickyNote size={20} color="#F39C12" />}
            iconColor="#F39C12"
            expanded={expandedSections.includes("circles")}
            onToggle={() => toggleSection("circles")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<MessageCircle size={18} color="#F39C12" />}
              title="Circle Messages"
              description="Messages in your circles"
              value={preferences.circleMessages}
              onValueChange={(v) => updatePreference("circleMessages", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Calendar size={18} color="#E67E22" />}
              title="Circle Events"
              description="New events in your circles"
              value={preferences.circleEvents}
              onValueChange={(v) => updatePreference("circleEvents", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<UserPlus size={18} color="#D35400" />}
              title="Circle Invites"
              description="Invitations to join circles"
              value={preferences.circleInvites}
              onValueChange={(v) => updatePreference("circleInvites", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* Smart / FOMO Section */}
        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <Section
            title="Smart Notifications"
            icon={<Sparkles size={20} color="#E74C3C" />}
            iconColor="#E74C3C"
            expanded={expandedSections.includes("smart")}
            onToggle={() => toggleSection("smart")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<Users size={18} color="#E74C3C" />}
              title="Friend Joined Event"
              description="When friends join events you're interested in"
              value={preferences.fomoFriendJoined}
              onValueChange={(v) => updatePreference("fomoFriendJoined", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<TrendingUp size={18} color="#FF6B4A" />}
              title="Popular Events"
              description="When events become trending"
              value={preferences.fomoPopularEvents}
              onValueChange={(v) => updatePreference("fomoPopularEvents", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<Mail size={18} color="#9B59B6" />}
              title="Weekly Summary"
              description="Weekly activity summary from friends"
              value={preferences.weeklySummary}
              onValueChange={(v) => updatePreference("weeklySummary", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            <ToggleItem
              icon={<RotateCcw size={18} color="#1ABC9C" />}
              title="Reconnect Suggestions"
              description="Suggestions to reconnect with friends"
              value={preferences.reconnectSuggestions}
              onValueChange={(v) => updatePreference("reconnectSuggestions", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* Daily Digest Section */}
        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <Section
            title="Daily Digest"
            icon={<Mail size={20} color="#8E44AD" />}
            iconColor="#8E44AD"
            expanded={expandedSections.includes("digest")}
            onToggle={() => toggleSection("digest")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<Mail size={18} color="#8E44AD" />}
              title="Daily Summary"
              description="A daily summary of what's happening"
              value={preferences.dailyDigest}
              onValueChange={(v) => updatePreference("dailyDigest", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            {preferences.dailyDigest && (
              <View className="px-4 pb-3">
                <Text style={{ color: colors.textSecondary }} className="text-sm mb-2">
                  Delivery time: {preferences.dailyDigestTime}
                </Text>
              </View>
            )}
          </Section>
        </Animated.View>

        {/* Quiet Hours Section */}
        <Animated.View entering={FadeInDown.delay(450).springify()}>
          <Section
            title="Quiet Hours"
            icon={<Moon size={20} color="#34495E" />}
            iconColor="#34495E"
            expanded={expandedSections.includes("quiet")}
            onToggle={() => toggleSection("quiet")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={preferences.quietHoursEnabled ? <VolumeX size={18} color="#34495E" /> : <Volume2 size={18} color="#34495E" />}
              title="Enable Quiet Hours"
              description="Pause notifications during specific hours"
              value={preferences.quietHoursEnabled}
              onValueChange={(v) => updatePreference("quietHoursEnabled", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
            {preferences.quietHoursEnabled && (
              <View className="px-4 pb-3">
                <View className="flex-row justify-between items-center">
                  <Text style={{ color: colors.textSecondary }} className="text-sm">
                    From {preferences.quietHoursStart} to {preferences.quietHoursEnd}
                  </Text>
                </View>
                <Text style={{ color: colors.textSecondary }} className="text-xs mt-1 opacity-70">
                  Notifications will be silenced during these hours
                </Text>
              </View>
            )}
          </Section>
        </Animated.View>

        {/* Event Reflections Section */}
        <Animated.View entering={FadeInDown.delay(500).springify()}>
          <Section
            title="Event Reflections"
            icon={<Sparkles size={20} color="#FFD700" />}
            iconColor="#FFD700"
            expanded={expandedSections.includes("reflections")}
            onToggle={() => toggleSection("reflections")}
            isDark={isDark}
            colors={colors}
          >
            <ToggleItem
              icon={<Sparkles size={18} color="#FFD700" />}
              title="Reflection Prompts"
              description="Reminders to reflect after your events end"
              value={preferences.eventReflectionPrompts}
              onValueChange={(v) => updatePreference("eventReflectionPrompts", v)}
              disabled={!masterEnabled}
              isDark={isDark}
              colors={colors}
            />
          </Section>
        </Animated.View>

        {/* Info Footer */}
        <Animated.View entering={FadeInDown.delay(600).springify()} className="mx-4 mt-6">
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: `${themeColor}10` }}
          >
            <Text style={{ color: colors.textSecondary }} className="text-sm text-center">
              Notifications help you stay connected with friends and never miss important events.
              Customize your preferences to get the notifications that matter most to you.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
