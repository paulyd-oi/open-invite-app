/**
 * Notification Permission Pre-Prompt Modal
 * 
 * Soft pre-permission modal shown at Aha moments (before OS prompt).
 * Respects user choice and 14-day cooldown.
 */

import React from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Bell } from "@/ui/icons";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";

import { useTheme } from "@/lib/ThemeContext";
import { 
  markNotificationPromptAsked, 
  requestNotificationPermission 
} from "@/lib/notificationPrompt";
import { api } from "@/lib/api";

interface NotificationPrePromptModalProps {
  visible: boolean;
  onClose: () => void;
}

export function NotificationPrePromptModal({
  visible,
  onClose,
}: NotificationPrePromptModalProps) {
  const { themeColor, colors, isDark } = useTheme();

  const handleEnable = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Mark as asked (14-day cooldown starts)
    await markNotificationPromptAsked();
    
    // Request OS permission
    const granted = await requestNotificationPermission();
    
    // Update backend
    try {
      await api.post("/api/notifications/status", {
        pushPermissionStatus: granted ? "granted" : "denied",
      });
    } catch {
      // Ignore backend errors
    }
    
    onClose();
  };

  const handleNotNow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Mark as asked (14-day cooldown starts)
    await markNotificationPromptAsked();
    
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleNotNow}
    >
      <View 
        style={{ 
          flex: 1, 
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Pressable 
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={handleNotNow}
        />
        
        <Animated.View
          entering={SlideInUp.springify().damping(15)}
          style={{
            width: "100%",
            maxWidth: 400,
            backgroundColor: colors.surface,
            borderRadius: 24,
            padding: 24,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          {/* Icon */}
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: `${themeColor}20`,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 16,
              alignSelf: "center",
            }}
          >
            <Bell size={30} color={themeColor} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 22,
              fontWeight: "700",
              color: colors.text,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Don't miss invites from friends
          </Text>

          {/* Body */}
          <Text
            style={{
              fontSize: 15,
              color: colors.textSecondary,
              textAlign: "center",
              lineHeight: 22,
              marginBottom: 24,
            }}
          >
            Get notified when friends invite you or update plans.
          </Text>

          {/* Buttons */}
          <View style={{ gap: 12 }}>
            {/* Primary: Enable */}
            <Pressable
              onPress={handleEnable}
              style={{
                backgroundColor: themeColor,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: "#FFFFFF",
                }}
              >
                Enable notifications
              </Text>
            </Pressable>

            {/* Secondary: Not now */}
            <Pressable
              onPress={handleNotNow}
              style={{
                backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: colors.textSecondary,
                }}
              >
                Not now
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
