import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  LayoutAnimation,
  UIManager,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronDown,
  Calendar,
  Users,
  Bell,
  Sparkles,
  UserPlus,
  Clock,
  Shield,
  Settings,
  Cake,
  Layers,
  BookOpen,
  Gift,
} from "@/ui/icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";

import { useTheme } from "@/lib/ThemeContext";
import { openSupportEmail } from "@/lib/support";

// Enable LayoutAnimation for Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface FeatureSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  features: Feature[];
}

interface Feature {
  title: string;
  description: string;
  howItWorks: string[];
  tips?: string[];
}

export default function HelpFAQScreen() {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [expandedFeatures, setExpandedFeatures] = useState<string[]>([]);

  const toggleSection = (sectionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const toggleFeature = (featureId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedFeatures((prev) =>
      prev.includes(featureId)
        ? prev.filter((id) => id !== featureId)
        : [...prev, featureId]
    );
  };

  const featureSections: FeatureSection[] = [
    {
      id: "events",
      title: "Events & Calendar",
      icon: <Calendar size={22} color="#4ECDC4" />,
      iconColor: "#4ECDC4",
      features: [
        {
          title: "Create Events",
          description: "Share your plans with friends by creating events they can see and join.",
          howItWorks: [
            "Tap the '+' button on the home screen or calendar",
            "Enter event details: title, emoji, date, time, and location",
            "Choose a category (Food, Sports, Entertainment, etc.)",
            "Select visibility: share with all friends or specific groups",
            "Add an optional description for more context",
            "Tap 'Create Event' to publish",
          ],
          tips: [
            "Use emojis to make your events stand out in the feed",
            "Set reminders so friends don't forget",
            "Edit events anytime if plans change",
          ],
        },
        {
          title: "Calendar View",
          description: "See all your events and friends' events in a beautiful calendar interface.",
          howItWorks: [
            "Open the Calendar tab to see your monthly view",
            "Days with events show colored dots",
            "Tap a day to see all events scheduled",
            "Pinch to zoom for different calendar views: compact, stacked, or detailed",
            "Swipe left/right to navigate between months",
            "Toggle between 'My Events', 'Attending', and 'Friends' events",
          ],
          tips: [
            "Enable birthday display to never miss a friend's birthday",
            "Import your device calendar to see all events in one place",
          ],
        },
        {
          title: "Event Feed",
          description: "Discover what your friends are planning with the chronological event feed.",
          howItWorks: [
            "Open the Home tab to see the event feed",
            "Events are grouped: Today, Tomorrow, This Week, Upcoming",
            "Tap an event card to see full details",
            "RSVP directly from the card: Going, Interested, or Not Going",
            "Pull down to refresh and see new events",
          ],
        },
        {
          title: "Event Details & RSVP",
          description: "View complete event information and let friends know you're coming.",
          howItWorks: [
            "Tap any event to open its detail page",
            "See who's attending, interested, or hosting",
            "View the event location on a map preview",
            "Read and add comments to discuss plans",
            "Browse event photos shared by attendees",
            "Tap RSVP buttons to indicate your attendance",
          ],
        },
        {
          title: "Event Photos",
          description: "Capture and share memories from events with photo uploads.",
          howItWorks: [
            "Open an event you attended",
            "Scroll to the Photos section",
            "Tap '+' to add photos from your camera or gallery",
            "Photos are visible to all event attendees",
            "Comment on photos to share reactions",
          ],
        },
        {
          title: "Event Categories",
          description: "Organize events by type with predefined categories.",
          howItWorks: [
            "When creating an event, select a category",
            "Available categories: Food & Drinks, Sports, Entertainment, Social, Travel, Work, and more",
            "Categories help friends quickly understand event types",
            "Event cards display the category for easy identification",
          ],
        },
        {
          title: "Recurring Events",
          description: "Recurring events are planned as a Pro feature in a future update. For now, recurring events are available to everyone.",
          howItWorks: [
            "When creating an event, enable 'Repeat'",
            "Choose frequency: Weekly or Monthly",
            "Select which days to repeat",
            "All occurrences are created automatically",
          ],
        },
        {
          title: "Event Reminders",
          description: "Never miss an event with customizable notifications.",
          howItWorks: [
            "When viewing an event, set a reminder",
            "Choose when to be notified: 15 min, 1 hour, 1 day before",
            "Receive push notifications at your chosen time",
            "Reminders work for events you're attending",
          ],
        },
      ],
    },
    {
      id: "friends",
      title: "Friends & Social",
      icon: <Users size={22} color="#FF6B6B" />,
      iconColor: "#FF6B6B",
      features: [
        {
          title: "Friends List",
          description: "View and manage all your friends in one place.",
          howItWorks: [
            "Open the Friends tab to see your friend list",
            "Friends are displayed with profile photos and bios",
            "See recent activity and last hangout date",
            "Use filters: All Friends, Recently Active, or by Groups",
            "Switch between List and Details view modes",
            "Tap a friend to view their full profile",
          ],
        },
        {
          title: "Friend Requests",
          description: "Connect with new friends by sending and accepting requests.",
          howItWorks: [
            "Go to Friends tab and look for the Requests section",
            "See pending requests you've received",
            "Accept or decline incoming requests",
            "Search for friends by name, email, or phone number",
            "Tap 'Add Friend' to send a request",
            "Check outgoing requests to see pending invites",
          ],
        },
        {
          title: "Friend Profiles",
          description: "Learn more about your friends with detailed profile pages.",
          howItWorks: [
            "Tap any friend's name or photo to open their profile",
            "See their bio, profile picture, and social links",
            "View hangout statistics: times hung out, streak days",
            "See shared events you've both attended",
            "View mutual friends you have in common",
            "Add personal notes about this friend (only you can see)",
          ],
        },
        {
          title: "Friend Notes",
          description: "Keep private notes about your friends for personal reference.",
          howItWorks: [
            "Open a friend's profile",
            "Scroll to the Notes section",
            "Tap to add or edit your private note",
            "Notes are only visible to you",
            "Use notes to remember preferences, inside jokes, or important details",
          ],
          tips: [
            "Great for remembering dietary restrictions or gift ideas",
          ],
        },
        {
          title: "Groups",
          description: "Organize friends into custom groups for easier event sharing.",
          howItWorks: [
            "Go to Friends tab and find the Groups section",
            "Tap '+' to create a new group",
            "Name your group and choose a color/icon",
            "Add friends to the group",
            "When creating events, select which groups can see it",
            "Share events with 'Work Friends', 'College Crew', etc.",
          ],
          tips: [
            "A friend can belong to multiple groups",
            "Use groups to filter your event visibility",
          ],
        },
        {
          title: "Hangout Streaks",
          description: "Track consecutive hangouts with friends to build stronger connections.",
          howItWorks: [
            "Streaks are tracked automatically when you attend events together",
            "See your current streak on friend profiles",
            "Streaks increase when you hang out weekly",
            "Don't break the streak! Hang out again to keep it going",
          ],
        },
        {
          title: "Blocked Contacts",
          description: "Control who can interact with you by blocking users.",
          howItWorks: [
            "Go to Settings > Privacy & Security > Blocked Contacts",
            "See all currently blocked users",
            "Block by email, phone number, or user profile",
            "Blocked users cannot see your events or send requests",
            "Unblock anytime to restore connection",
          ],
        },
      ],
    },
    {
      id: "requests",
      title: "Proposed Events",
      icon: <UserPlus size={22} color="#9B59B6" />,
      iconColor: "#9B59B6",
      features: [
        {
          title: "Propose Events",
          description: "Suggest hangout ideas and let friends respond before confirming.",
          howItWorks: [
            "Go to Calendar and tap 'Propose' to suggest an event",
            "Describe the event idea (dinner, movie night, etc.)",
            "Select friends you want to invite",
            "Optionally suggest dates/times",
            "Wait for responses before the event is confirmed",
          ],
        },
        {
          title: "Respond to Proposals",
          description: "Accept or decline proposed events from friends.",
          howItWorks: [
            "Open the Proposed Events section in your calendar",
            "Review the proposed event details",
            "Tap 'Accept' if you want to join",
            "Tap 'Decline' if you can't make it",
            "Once all members respond, the event is confirmed",
          ],
        },
        {
          title: "Proposal Status",
          description: "Monitor who has responded to your event proposals.",
          howItWorks: [
            "Open a proposed event you created",
            "See each invited friend's response status",
            "Pending, Accepted, or Declined",
            "Send reminders to friends who haven't responded",
            "Event confirms when enough people accept",
          ],
        },
      ],
    },
    {
      id: "availability",
      title: "Availability & Scheduling",
      icon: <Clock size={22} color="#45B7D1" />,
      iconColor: "#45B7D1",
      features: [
        {
          title: "Who's Free",
          description: "Find out which friends are available on specific dates.",
          howItWorks: [
            "Open the calendar and tap 'Who's Free'",
            "Select a date you're considering for an event",
            "See a list of friends who have no conflicting events",
            "Check friends' availability before creating events",
            "Great for planning group activities",
          ],
        },
        {
          title: "Weekly Availability View",
          description: "See friend availability across an entire week at a glance.",
          howItWorks: [
            "Access from the calendar or suggestions screen",
            "View a week grid showing when friends are free",
            "Busy times are marked based on their events and work schedule",
            "Find the best time when most friends can join",
          ],
        },
        {
          title: "Work Schedule",
          description: "Set your regular work hours so friends know when you're busy.",
          howItWorks: [
            "Go to Settings > Work Schedule",
            "Toggle work days on/off (Monday-Friday)",
            "Set start and end times for each day",
            "Work hours appear on your calendar as 'Busy'",
            "Friends see you as unavailable during work hours",
            "Toggle 'Show on Calendar' to display work blocks",
          ],
          tips: [
            "Update when your schedule changes",
            "Helps friends plan events outside your work hours",
          ],
        },
        {
          title: "Calendar Integration",
          description: "Import events from your device calendar for complete availability view.",
          howItWorks: [
            "Go to Settings > Calendar > Import from Device Calendar",
            "Grant calendar access permission",
            "Select which calendars to import (Personal, Work, etc.)",
            "Imported events show on your Open Invite calendar",
            "Conflicts are detected automatically",
          ],
        },
      ],
    },
    {
      id: "circles",
      title: "Groups",
      icon: <Layers size={22} color="#F39C12" />,
      iconColor: "#F39C12",
      features: [
        {
          title: "Create Groups",
          description: "Form groups for private event sharing and messaging.",
          howItWorks: [
            "Go to Friends tab and tap 'Create a Group'",
            "Name your group (e.g., 'Weekend Crew', 'Book Club')",
            "Add members from your friends list",
            "Set a group photo or icon",
            "Groups are perfect for planning with specific friends",
          ],
        },
        {
          title: "Group Events",
          description: "Create events visible only to group members.",
          howItWorks: [
            "Open a group you're part of",
            "Tap '+' to create a group-only event",
            "Only group members can see and RSVP",
            "Perfect for recurring group activities",
          ],
        },
        {
          title: "Group Messages",
          description: "Chat with your group members in a group conversation.",
          howItWorks: [
            "Open a group to access the chat",
            "Send text messages to all members",
            "Discuss plans, share updates, or just chat",
            "All group members receive notifications",
          ],
        },
        {
          title: "Group Members",
          description: "Manage who's in your group.",
          howItWorks: [
            "Open group settings to see all members",
            "Add new members from your friends",
            "Remove members if needed",
            "Pin important members for quick access",
            "Leave a group if you no longer want to be part of it",
          ],
        },
      ],
    },
    {
      id: "suggestions",
      title: "Smart Suggestions",
      icon: <Sparkles size={22} color="#E74C3C" />,
      iconColor: "#E74C3C",
      features: [
        {
          title: "Friend Suggestions",
          description: "Get smart recommendations on who to hang out with.",
          howItWorks: [
            "Open the Suggestions screen from the home tab",
            "See friends you haven't hung out with recently",
            "View suggestions based on past hangout patterns",
            "Consider streak-at-risk friends to maintain streaks",
            "Tap a suggestion to start planning an event",
          ],
        },
        {
          title: "Suggested Times",
          description: "Find optimal times when you and friends are all free.",
          howItWorks: [
            "When creating an event, check suggested times",
            "Algorithm considers invited friends' calendars",
            "Avoids work hours and existing events",
            "Shows the best available slots",
          ],
        },
        {
          title: "Popular Events",
          description: "Discover events with multiple attendees.",
          howItWorks: [
            "Open the Discover tab to see popular events",
            "Events with 2+ attendees appear here",
            "Sorted by attendance count",
            "Great way to find group activities",
          ],
        },
        {
          title: "Place Search",
          description: "Find venues and locations for your events.",
          howItWorks: [
            "When creating an event, tap the location field",
            "Search for restaurants, bars, parks, etc.",
            "Select a place to add it to your event",
            "Location is added to your event automatically",
            "Attendees can get directions from the event",
          ],
        },
      ],
    },
    {
      id: "notifications",
      title: "Notifications",
      icon: <Bell size={22} color="#3498DB" />,
      iconColor: "#3498DB",
      features: [
        {
          title: "Push Notifications",
          description: "Stay informed about important updates.",
          howItWorks: [
            "Enable notifications in Settings > Notifications",
            "Receive alerts for: new events, friend requests, RSVPs",
            "Get reminders before events you're attending",
            "See activity from friends in real-time",
          ],
        },
        {
          title: "Activity Feed",
          description: "See what's happening in your friend network.",
          howItWorks: [
            "Tap the bell icon to open Activity",
            "See recent actions: events created, RSVPs, new friends",
            "Track who joined your events",
            "Stay updated on friend activity",
          ],
        },
        {
          title: "Smart Notifications",
          description: "Intelligent notification timing and grouping.",
          howItWorks: [
            "Similar notifications are grouped together",
            "Notifications timed to avoid disruption",
            "Priority notifications for events happening soon",
            "Mute specific event notifications if needed",
          ],
        },
      ],
    },
    {
      id: "profile",
      title: "Profile & Settings",
      icon: <Settings size={22} color="#7F8C8D" />,
      iconColor: "#7F8C8D",
      features: [
        {
          title: "Edit Profile",
          description: "Customize how others see you on Open Invite.",
          howItWorks: [
            "Go to Settings and tap your profile",
            "Change your display name",
            "Upload a new profile photo",
            "Write a calendar bio (e.g., 'Busy weekdays, free weekends')",
            "Add social media links",
          ],
        },
        {
          title: "Theme Customization",
          description: "Personalize the app's look and feel.",
          howItWorks: [
            "Go to Settings > Appearance",
            "Choose theme mode: Light, Dark, or Auto (follows system)",
            "Select your accent color from 8 beautiful options",
            "Colors affect buttons, highlights, and UI elements",
          ],
        },
        {
          title: "Birthday Settings",
          description: "Control how your birthday appears to friends.",
          howItWorks: [
            "Go to Settings > Birthdays",
            "Set your birthday date",
            "Toggle 'Show to Friends' to display on their calendars",
            "Enable 'Hide Age/Year' to only show month and day",
            "Toggle 'Hide Birthdays' to not see others' birthdays",
          ],
        },
        {
          title: "Phone Number",
          description: "Help friends find you by phone number.",
          howItWorks: [
            "Go to Settings > Phone Number",
            "Enter your phone number",
            "Friends can search by phone to find you",
            "Your number is never shared publicly",
            "Remove anytime if you prefer",
          ],
        },
        {
          title: "Profile Statistics",
          description: "See your social activity at a glance.",
          howItWorks: [
            "View stats on your profile page",
            "See total events hosted",
            "Track events attended",
            "View your longest streak",
            "Compare with friends",
          ],
        },
      ],
    },
    {
      id: "referrals",
      title: "Referrals & Rewards",
      icon: <Gift size={22} color="#E91E63" />,
      iconColor: "#E91E63",
      features: [
        {
          title: "Referral Program",
          description: "Invite friends and earn rewards.",
          howItWorks: [
            "Go to Settings > Invite Friends",
            "Get your unique referral code or link",
            "Share with friends via text, email, or social media",
            "When they sign up, you both benefit",
            "Track your successful referrals",
          ],
        },
        {
          title: "Referral Rewards",
          description: "Earn free premium time for successful referrals.",
          howItWorks: [
            "Each friend who joins counts as a successful referral",
            "Invite 10 friends to earn 1 year FREE premium",
            "Track progress in Settings > Invite Friends",
            "Rewards applied automatically when milestone reached",
          ],
        },
        {
          title: "Share the App",
          description: "Multiple ways to invite friends to Open Invite.",
          howItWorks: [
            "Tap 'Invite Friends' in Settings",
            "Share via Messages, WhatsApp, or other apps",
            "Copy your referral link to paste anywhere",
            "Share your referral code for manual entry",
          ],
        },
      ],
    },
    {
      id: "privacy",
      title: "Privacy & Security",
      icon: <Shield size={22} color="#1ABC9C" />,
      iconColor: "#1ABC9C",
      features: [
        {
          title: "Event Visibility Controls",
          description: "Choose who can see your events.",
          howItWorks: [
            "When creating events, set visibility",
            "All Friends: Everyone in your friend list sees it",
            "Select Groups: Only chosen groups see it",
            "Private: Only you and invited attendees",
          ],
        },
        {
          title: "Block Users",
          description: "Prevent unwanted interactions.",
          howItWorks: [
            "Go to Settings > Blocked Contacts",
            "Add users to block by email or phone",
            "Blocked users cannot send requests or see your events",
            "They won't know they're blocked",
            "Unblock anytime to restore connection",
          ],
        },
        {
          title: "Data & Account",
          description: "Manage your account and data.",
          howItWorks: [
            "Go to Settings > Privacy Settings",
            "Export your data as a JSON file",
            "Delete your account if needed (permanent)",
          ],
        },
      ],
    },
  ];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }} edges={["top"]}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: isDark ? "#000000" : "#F5F5F7" }}>
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
          <Text style={{ color: colors.text }} className="text-xl font-sora-bold">Help & FAQ</Text>
          <Text style={{ color: colors.textSecondary }} className="text-sm">Complete feature guide</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Introduction */}
        <Animated.View entering={FadeInDown.delay(0).springify()} className="mx-4 mt-4">
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: `${themeColor}15` }}
          >
            <View className="flex-row items-center mb-2">
              <BookOpen size={20} color={themeColor} />
              <Text style={{ color: themeColor }} className="text-base font-semibold ml-2">
                Welcome to Open Invite
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary }} className="text-sm leading-5">
              Open Invite helps you share your plans with friends and see what everyone is up to.
              Below you'll find detailed explanations of every feature in the app. Tap any section to expand it.
            </Text>
          </View>
        </Animated.View>

        {/* Feature Sections */}
        {featureSections.map((section, sectionIndex) => {
          const isSectionExpanded = expandedSections.includes(section.id);

          return (
            <Animated.View
              key={section.id}
              entering={FadeInDown.delay((sectionIndex + 1) * 50).springify()}
              className="mx-4 mt-4"
            >
              {/* Section Header */}
              <Pressable
                onPress={() => toggleSection(section.id)}
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: colors.surface }}
              >
                <View className="flex-row items-center p-4">
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: `${section.iconColor}15` }}
                  >
                    {section.icon}
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="text-base font-semibold">
                      {section.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm">
                      {section.features.length} features
                    </Text>
                  </View>
                  <ChevronDown
                    size={20}
                    color={colors.textTertiary}
                    style={{ transform: [{ rotate: isSectionExpanded ? "180deg" : "0deg" }] }}
                  />
                </View>

                {/* Expanded Features */}
                {isSectionExpanded && (
                  <View className="px-4 pb-4">
                    {section.features.map((feature, featureIndex) => {
                      const featureId = `${section.id}-${featureIndex}`;
                      const isFeatureExpanded = expandedFeatures.includes(featureId);

                      return (
                        <View
                          key={featureId}
                          style={{
                            borderTopWidth: featureIndex > 0 ? 1 : 0,
                            borderTopColor: colors.separator,
                          }}
                        >
                          <Pressable
                            onPress={() => toggleFeature(featureId)}
                            className="py-3"
                          >
                            <View className="flex-row items-center">
                              <View
                                className="w-2 h-2 rounded-full mr-3"
                                style={{ backgroundColor: section.iconColor }}
                              />
                              <Text style={{ color: colors.text }} className="flex-1 font-medium">
                                {feature.title}
                              </Text>
                              <ChevronDown
                                size={16}
                                color={colors.textTertiary}
                                style={{ transform: [{ rotate: isFeatureExpanded ? "180deg" : "0deg" }] }}
                              />
                            </View>
                            <Text style={{ color: colors.textSecondary }} className="text-sm mt-1 ml-5">
                              {feature.description}
                            </Text>
                          </Pressable>

                          {/* Feature Details */}
                          {isFeatureExpanded && (
                            <View
                              className="ml-5 mb-3 p-3 rounded-xl"
                              style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
                            >
                              <Text style={{ color: colors.text }} className="text-sm font-semibold mb-2">
                                How it works:
                              </Text>
                              {feature.howItWorks.map((step, stepIndex) => (
                                <View key={stepIndex} className="flex-row mb-1.5">
                                  <Text style={{ color: section.iconColor }} className="text-sm font-medium mr-2">
                                    {stepIndex + 1}.
                                  </Text>
                                  <Text style={{ color: colors.textSecondary }} className="text-sm flex-1 leading-5">
                                    {step}
                                  </Text>
                                </View>
                              ))}

                              {feature.tips && feature.tips.length > 0 && (
                                <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
                                  <Text style={{ color: colors.text }} className="text-sm font-semibold mb-2">
                                    Pro tips:
                                  </Text>
                                  {feature.tips.map((tip, tipIndex) => (
                                    <View key={tipIndex} className="flex-row mb-1">
                                      <Text style={{ color: "#FFD700" }} className="text-sm mr-2">★</Text>
                                      <Text style={{ color: colors.textSecondary }} className="text-sm flex-1 leading-5">
                                        {tip}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Footer */}
        <Animated.View entering={FadeInDown.delay(700).springify()} className="mx-4 mt-6">
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: colors.surface }}
          >
            <Text style={{ color: colors.text }} className="text-base font-semibold mb-2">
              Still have questions?
            </Text>
            <Text style={{ color: colors.textSecondary }} className="text-sm mb-3">
              We're here to help! Reach out to our support team for personalized assistance. We typically respond within 24–48 hours.
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                openSupportEmail();
              }}
              className="py-3 rounded-xl items-center"
              style={{ backgroundColor: themeColor }}
            >
              <Text className="text-white font-semibold">Contact Support</Text>
            </Pressable>
          </View>
        </Animated.View>

        <Text style={{ color: colors.textTertiary }} className="text-center text-sm mt-6">
          Open Invite v{Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
