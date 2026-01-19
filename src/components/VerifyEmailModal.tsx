import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Mail, X } from "@/ui/icons";
import Animated, { FadeIn, FadeInUp, SlideInDown } from "react-native-reanimated";
import { useTheme } from "@/lib/ThemeContext";

interface VerifyEmailModalProps {
  visible: boolean;
  onClose: () => void;
  actionDescription?: string;
}

/**
 * Modal shown when a user with deferred email verification
 * tries to perform a social action (create event, invite friend, etc.)
 */
export function VerifyEmailModal({
  visible,
  onClose,
  actionDescription = "connect with friends and send invites",
}: VerifyEmailModalProps) {
  const router = useRouter();
  const { themeColor, isDark, colors } = useTheme();

  const handleVerifyNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    // Navigate to settings or a dedicated verification screen
    router.push("/settings");
  };

  const handleNotNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Animated.View
          entering={SlideInDown.springify()}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 24,
            padding: 24,
            width: "100%",
            maxWidth: 340,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
          }}
        >
          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              padding: 4,
            }}
            hitSlop={12}
          >
            <X size={20} color={colors.textTertiary} />
          </Pressable>

          {/* Icon */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: `${themeColor}20`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Mail size={32} color={themeColor} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Verify Your Email
          </Text>

          {/* Description */}
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 15,
              textAlign: "center",
              lineHeight: 22,
              marginBottom: 24,
            }}
          >
            Verify your email to {actionDescription}.
          </Text>

          {/* Buttons */}
          <Pressable
            onPress={handleVerifyNow}
            style={{
              backgroundColor: themeColor,
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: "center",
              marginBottom: 12,
              shadowColor: themeColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              Verify Now
            </Text>
          </Pressable>

          <Pressable
            onPress={handleNotNow}
            style={{
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: colors.textTertiary,
                fontSize: 15,
              }}
            >
              Not Now
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default VerifyEmailModal;
