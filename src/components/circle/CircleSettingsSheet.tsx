import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
} from "react-native";
import BottomSheet from "@/components/BottomSheet";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
import {
  Users,
  X,
  ChevronRight,
  ChevronLeft,
  Camera,
  BellOff,
  Bell,
} from "@/ui/icons";

interface CircleSettingsSheetProps {
  visible: boolean;
  circleName: string | undefined;
  circleEmoji: string | undefined;
  circlePhotoUrl: string | null | undefined;
  circleDescription: string | null | undefined;
  isMuted: boolean;
  memberCount: number;
  settingsView: "settings" | "photo";
  isHost: boolean;
  editingDescription: boolean;
  descriptionText: string;
  uploadingPhoto: boolean;
  isMutePending: boolean;
  isSaveDescriptionPending: boolean;
  notifyLevel: string;
  colors: { text: string; textSecondary: string; textTertiary: string; border: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
  onSetView: (v: "settings" | "photo") => void;
  onEditDescription: () => void;
  onCancelEditDescription: () => void;
  onDescriptionChange: (text: string) => void;
  onSaveDescription: () => void;
  onMuteToggle: (val: boolean) => void;
  onShareGroup: () => void;
  onOpenMembers: () => void;
  onOpenNotifyLevel: () => void;
  onLeaveGroup: () => void;
  onUploadPhoto: () => void;
  onRemovePhoto: () => void;
}

export function CircleSettingsSheet({
  visible,
  circleName,
  circleEmoji,
  circlePhotoUrl,
  circleDescription,
  isMuted,
  memberCount,
  settingsView,
  isHost,
  editingDescription,
  descriptionText,
  uploadingPhoto,
  isMutePending,
  isSaveDescriptionPending,
  notifyLevel,
  colors,
  isDark,
  themeColor,
  onClose,
  onSetView,
  onEditDescription,
  onCancelEditDescription,
  onDescriptionChange,
  onSaveDescription,
  onMuteToggle,
  onShareGroup,
  onOpenMembers,
  onOpenNotifyLevel,
  onLeaveGroup,
  onUploadPhoto,
  onRemovePhoto,
}: CircleSettingsSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      maxHeightPct={0.85}
      backdropOpacity={0.5}
      keyboardMode="padding"
    >
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" }}>
          Circle Settings
        </Text>
      </View>

      {/* Scrollable content for keyboard accessibility */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {settingsView === "settings" && (<>
          {/* Circle Info */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                backgroundColor: `${themeColor}20`,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 16,
                overflow: "hidden",
              }}
            >
              <CirclePhotoEmoji photoUrl={circlePhotoUrl} emoji={circleEmoji ?? "👥"} emojiStyle={{ fontSize: 28 }} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text }}>
                {circleName}
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                {memberCount} member{memberCount !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {/* Description Section */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary }}>Description</Text>
              {isHost && !editingDescription && (
                <Pressable onPress={onEditDescription}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: themeColor }}>Edit</Text>
                </Pressable>
              )}
            </View>
            {editingDescription && isHost ? (
              <View>
                <TextInput
                  value={descriptionText}
                  onChangeText={(text) => onDescriptionChange(text.slice(0, 160))}
                  placeholder="Add a circle description..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={160}
                  style={{
                    backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                    borderRadius: 12,
                    padding: 12,
                    color: colors.text,
                    fontSize: 15,
                    minHeight: 60,
                    textAlignVertical: "top",
                  }}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>{descriptionText.length}/160</Text>
                  <View style={{ flexDirection: "row" }}>
                    <Pressable
                      onPress={onCancelEditDescription}
                      style={{ paddingHorizontal: 16, paddingVertical: 8, marginRight: 8 }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSecondary }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={onSaveDescription}
                      disabled={isSaveDescriptionPending}
                      style={{
                        backgroundColor: themeColor,
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 8,
                        opacity: isSaveDescriptionPending ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>
                        {isSaveDescriptionPending ? "Saving..." : "Save"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 15, color: circleDescription ? colors.text : colors.textTertiary, fontStyle: circleDescription ? "normal" : "italic" }}>
                {circleDescription ?? (isHost ? "Tap Edit to add a description" : "No description")}
              </Text>
            )}
          </View>

          {/* Settings Options */}
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            {/* Circle Photo (host only) */}
            {isHost && (
              <Pressable
                onPress={() => onSetView("photo")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Camera size={22} color={themeColor} />
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Circle Photo</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    {circlePhotoUrl ? "Change or remove photo" : "Add a circle photo"}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textTertiary} />
              </Pressable>
            )}

            {/* Members List */}
            <Pressable
              onPress={onOpenMembers}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Users size={22} color={colors.text} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Members</Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </Pressable>

            {/* Share Group */}
            <Pressable
              onPress={onShareGroup}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Users size={22} color={themeColor} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Share Group</Text>
              </View>
              <ChevronRight size={20} color={colors.textTertiary} />
            </Pressable>

            {/* Mute Messages Toggle */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <BellOff size={22} color={colors.textSecondary} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Mute Messages</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {isMuted ? "Notifications silenced" : "Get notified of new messages"}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                  Mutes message notifications only. Event alerts still send.
                </Text>
              </View>
              <Switch
                value={isMuted}
                onValueChange={onMuteToggle}
                trackColor={{ false: isDark ? "#3A3A3C" : "#E5E7EB", true: themeColor + "80" }}
                thumbColor={isMuted ? themeColor : isDark ? "#FFFFFF" : "#FFFFFF"}
                ios_backgroundColor={isDark ? "#3A3A3C" : "#E5E7EB"}
              />
            </View>

            {/* Notification Level Row */}
            <Pressable
              onPress={onOpenNotifyLevel}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Bell size={22} color={colors.textSecondary} />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text }}>Notification Level</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  {notifyLevel === "all" ? "All activity" : notifyLevel === "decisions" ? "Decisions only" : notifyLevel === "mentions" ? "Mentions only" : "Muted"}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textTertiary} />
            </Pressable>

            {/* Leave Group */}
            <Pressable
              onPress={onLeaveGroup}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 16,
              }}
            >
              <X size={22} color="#FF3B30" />
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: "500", color: "#FF3B30" }}>Leave Group</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>Remove yourself from this group</Text>
              </View>
            </Pressable>
          </View>
        </>)}

        {/* Photo actions view (inside same sheet) */}
        {settingsView === "photo" && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text, textAlign: "center" }}>Circle Photo</Text>
            </View>
            <Pressable
              onPress={onUploadPhoto}
              disabled={uploadingPhoto}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: uploadingPhoto ? 0.5 : 1,
              }}
            >
              <Camera size={22} color={themeColor} />
              <Text style={{ fontSize: 16, fontWeight: "500", color: colors.text, marginLeft: 16, flex: 1 }}>
                {uploadingPhoto ? "Uploading..." : "Upload Photo"}
              </Text>
            </Pressable>

            {circlePhotoUrl && (
              <Pressable
                onPress={onRemovePhoto}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <X size={22} color="#FF3B30" />
                <Text style={{ fontSize: 16, fontWeight: "500", color: "#FF3B30", marginLeft: 16, flex: 1 }}>
                  Remove Photo
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => onSetView("settings")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 16,
              }}
            >
              <ChevronLeft size={20} color={colors.textSecondary} />
              <Text style={{ fontSize: 16, fontWeight: "500", color: colors.textSecondary, marginLeft: 8 }}>
                Back
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
