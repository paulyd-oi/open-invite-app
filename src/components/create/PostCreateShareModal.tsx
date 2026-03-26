import React from "react";
import { View, Text, Pressable, Modal, Share } from "react-native";
import { Share2 } from "@/ui/icons";
import { devError } from "@/lib/devLog";
import { buildEventSharePayload } from "@/lib/shareSSOT";
import { trackInviteShared } from "@/analytics/analyticsEventsSSOT";

interface CreatedEvent {
  id: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  description?: string | null;
}

interface PostCreateShareModalProps {
  visible: boolean;
  createdEvent: CreatedEvent | null;
  onClose: () => void;
  backgroundColor: string;
  borderColor: string;
  glassText: string;
  glassSecondary: string;
  themeColor: string;
}

export function PostCreateShareModal({
  visible,
  createdEvent,
  onClose,
  backgroundColor,
  borderColor,
  glassText,
  glassSecondary,
  themeColor,
}: PostCreateShareModalProps) {
  const handleShare = async () => {
    if (!createdEvent) return;
    try {
      const startDate = new Date(createdEvent.startTime);
      const endDate = createdEvent.endTime ? new Date(createdEvent.endTime) : null;
      const dateStr = startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      const timeStr = endDate
        ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const payload = buildEventSharePayload({
        id: createdEvent.id,
        title: createdEvent.title,
        emoji: createdEvent.emoji,
        dateStr,
        timeStr,
        location: createdEvent.location,
        description: createdEvent.description,
      });
      trackInviteShared({ entity: "event", sourceScreen: "create_success" });
      await Share.share({ message: payload.message, title: createdEvent.title, url: payload.url });
    } catch (err) {
      devError("[GROWTH_V1] share error:", err);
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 40,
          }}
        >
          {/* Handle bar */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: borderColor }} />
          </View>

          {/* Success header */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <Text style={{ fontSize: 28, marginBottom: 4 }}>{createdEvent?.emoji || "🎉"}</Text>
            <Text style={{ fontSize: 20, fontWeight: "700", color: glassText, textAlign: "center" }}>
              Your event is live!
            </Text>
            <Text style={{ fontSize: 14, color: glassSecondary, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
              Share it so friends can join
            </Text>
          </View>

          {/* Share CTA — primary */}
          <Pressable
            onPress={handleShare}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 16,
              borderRadius: 14,
              backgroundColor: themeColor,
            }}
          >
            <Share2 size={20} color="white" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "white", marginLeft: 8 }}>
              Share Event
            </Text>
          </Pressable>

          {/* Skip */}
          <Pressable
            onPress={onClose}
            style={{ alignItems: "center", paddingVertical: 14, marginTop: 4 }}
          >
            <Text style={{ fontSize: 14, fontWeight: "500", color: glassSecondary }}>
              I'll share later
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
