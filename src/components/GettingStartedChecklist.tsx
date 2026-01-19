import React, { useState, useEffect, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  User,
  Users,
  Calendar,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Sparkles,
  PartyPopper,
} from "@/ui/icons";
import Animated, { FadeInDown, FadeOut, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { api } from "@/lib/api";
import { useSession } from "@/lib/useSession";

interface ApiChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  route: string;
}

interface ChecklistData {
  checklist: ApiChecklistItem[];
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
}

const DEFAULT_CHECKLIST: ChecklistData = {
  checklist: [],
  completedCount: 0,
  totalCount: 4,
  allCompleted: false,
};

export function GettingStartedChecklist() {
  const router = useRouter();
  const { themeColor, colors } = useTheme();
  const { data: session } = useSession();
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const { data: checklistData } = useQuery<ChecklistData>({
    queryKey: ["onboarding-checklist"],
    queryFn: async (): Promise<ChecklistData> => {
      try {
        return await api.get<ChecklistData>("/api/onboarding/checklist");
      } catch {
        return DEFAULT_CHECKLIST;
      }
    },
    enabled: !!session,
    staleTime: 30000,
  });

  const getItemCompleted = (id: string): boolean => {
    return checklistData?.checklist?.find((item) => item.id === id)?.completed ?? false;
  };

  const profileComplete = getItemCompleted("profile");
  const hasFriends = getItemCompleted("friends");
  const hasEvents = getItemCompleted("event");
  const hasWorkSchedule = getItemCompleted("schedule");

  const items = [
    {
      id: "profile",
      title: "Add your photo",
      description: "Help friends recognize you",
      encouragement: "Friends love seeing a friendly face!",
      icon: <User size={18} color={profileComplete ? "#10B981" : colors.textTertiary} />,
      completed: profileComplete,
      action: () => router.push("/settings"),
    },
    {
      id: "friends",
      title: "Invite a friend",
      description: "The app shines with friends",
      encouragement: "Everything's better together!",
      icon: <Users size={18} color={hasFriends ? "#10B981" : colors.textTertiary} />,
      completed: hasFriends,
      action: () => router.push("/friends"),
    },
    {
      id: "events",
      title: "Plan something",
      description: "Share what you're up to",
      encouragement: "Even coffee counts!",
      icon: <Calendar size={18} color={hasEvents ? "#10B981" : colors.textTertiary} />,
      completed: hasEvents,
      action: () => router.push("/create"),
    },
    {
      id: "work",
      title: "Set your schedule",
      description: "Show when you're free",
      encouragement: "Helps friends know when to reach out",
      icon: <Briefcase size={18} color={hasWorkSchedule ? "#10B981" : colors.textTertiary} />,
      completed: hasWorkSchedule,
      action: () => router.push("/settings"),
    },
  ];

  const completedCount = items.filter((item) => item.completed).length;
  const progress = completedCount / items.length;

  // Get encouraging message based on progress
  const progressMessage = useMemo(() => {
    if (completedCount === 0) return "Let's get you set up!";
    if (completedCount === 1) return "Great start! Keep going...";
    if (completedCount === 2) return "You're halfway there!";
    if (completedCount === 3) return "Almost done!";
    return "All set! You're ready to go.";
  }, [completedCount]);

  // Auto-dismiss when all complete
  useEffect(() => {
    if (checklistData?.allCompleted) {
      setDismissed(true);
    }
  }, [checklistData?.allCompleted]);

  if (dismissed || !session) {
    return null;
  }

  return (
    <Animated.View
      entering={FadeInDown.delay(200)}
      exiting={FadeOut}
      className="mx-4 mb-4 rounded-2xl overflow-hidden"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Header */}
      <Pressable
        onPress={() => {
          setIsExpanded(!isExpanded);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        className="p-4"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center">
              {completedCount === items.length ? (
                <PartyPopper size={18} color="#10B981" />
              ) : (
                <Sparkles size={18} color={themeColor} />
              )}
              <Text style={{ color: colors.text }} className="text-base font-semibold ml-2">
                {completedCount === items.length ? "All Set!" : "Getting Started"}
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary }} className="text-sm mt-0.5">
              {progressMessage}
            </Text>
          </View>

          {/* Progress Circle */}
          <View className="flex-row items-center">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: completedCount === items.length ? "#10B98115" : `${themeColor}15` }}
            >
              {completedCount === items.length ? (
                <Check size={20} color="#10B981" />
              ) : (
                <Text style={{ color: themeColor }} className="text-sm font-bold">
                  {Math.round(progress * 100)}%
                </Text>
              )}
            </View>
            {isExpanded ? (
              <ChevronUp size={20} color={colors.textTertiary} />
            ) : (
              <ChevronDown size={20} color={colors.textTertiary} />
            )}
          </View>
        </View>

        {/* Progress Bar */}
        <View
          className="h-1.5 rounded-full mt-3"
          style={{ backgroundColor: colors.border }}
        >
          <Animated.View
            className="h-1.5 rounded-full"
            style={{
              backgroundColor: completedCount === items.length ? "#10B981" : themeColor,
              width: `${progress * 100}%`,
            }}
          />
        </View>
      </Pressable>

      {/* Checklist Items */}
      {isExpanded && (
        <View className="px-4 pb-4">
          {items.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => {
                if (!item.completed) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  item.action();
                }
              }}
              className="flex-row items-center py-3"
              style={{
                borderTopWidth: index > 0 ? 1 : 0,
                borderTopColor: colors.separator,
                opacity: item.completed ? 0.6 : 1,
              }}
            >
              <View
                className="w-8 h-8 rounded-full items-center justify-center mr-3"
                style={{
                  backgroundColor: item.completed ? "#10B98115" : colors.background,
                  borderWidth: item.completed ? 0 : 1,
                  borderColor: colors.border,
                }}
              >
                {item.completed ? (
                  <Check size={16} color="#10B981" />
                ) : (
                  item.icon
                )}
              </View>
              <View className="flex-1">
                <Text
                  style={{
                    color: item.completed ? colors.textTertiary : colors.text,
                    textDecorationLine: item.completed ? "line-through" : "none",
                  }}
                  className="text-sm font-medium"
                >
                  {item.title}
                </Text>
                <Text style={{ color: colors.textTertiary }} className="text-xs">
                  {item.description}
                </Text>
              </View>
              {!item.completed && (
                <Text style={{ color: themeColor }} className="text-xs font-medium">
                  Go
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </Animated.View>
  );
}
