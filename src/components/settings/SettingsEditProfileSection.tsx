import React from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Image as ExpoImage } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Camera, ImagePlus, Trash2 } from "@/ui/icons";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/ui/Button";

interface SettingsEditProfileSectionProps {
  editName: string;
  editImage: string;
  editBanner: string | null;
  editCalendarBio: string;
  editHandle: string;
  handleError: string | null;
  isUploading: boolean;
  isSaving: boolean;
  userEmail: string | null;
  bannerPhotoUrl: string | null;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary: string;
    surface: string;
    border: string;
  };
  isDark: boolean;
  themeColor: string;
  onPickImage: () => void;
  onPickBanner: () => void;
  onRemoveBanner: () => void;
  onSave: () => void;
  onCancel: () => void;
  onEditNameChange: (name: string) => void;
  onEditHandleChange: (text: string) => void;
  onEditCalendarBioChange: (text: string) => void;
  onUsernameFocus: () => void;
}

export function SettingsEditProfileSection({
  editName,
  editImage,
  editBanner,
  editCalendarBio,
  editHandle,
  handleError,
  isUploading,
  isSaving,
  userEmail,
  bannerPhotoUrl,
  colors,
  isDark,
  themeColor,
  onPickImage,
  onPickBanner,
  onRemoveBanner,
  onSave,
  onCancel,
  onEditNameChange,
  onEditHandleChange,
  onEditCalendarBioChange,
  onUsernameFocus,
}: SettingsEditProfileSectionProps) {
  return (
    <Animated.View entering={FadeInDown.springify()} className="mx-4 mt-4">
      <View
        className="rounded-2xl p-5"
        style={{
          backgroundColor: colors.surface,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.05,
          shadowRadius: 8,
        }}
      >
        <Text style={{ color: colors.text }} className="text-lg font-semibold mb-4">Edit Profile</Text>

        {/* Profile Picture */}
        <View className="items-center mb-4">
          <Pressable onPress={onPickImage} disabled={isUploading} className="relative" style={{ opacity: isUploading ? 0.6 : 1 }}>
            <EntityAvatar
              photoUrl={editImage || undefined}
              initials={editName?.[0] ?? userEmail?.[0]?.toUpperCase() ?? "?"}
              size={96}
              borderRadius={48}
              backgroundColor={editImage ? (isDark ? "#2C2C2E" : "#E5E7EB") : `${themeColor}20`}
              foregroundColor={themeColor}
              fallbackIcon="person-outline"
            />
            {isUploading ? (
              <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 48 }}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            ) : (
              <View
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center border-2"
                style={{ backgroundColor: themeColor, borderColor: colors.surface }}
              >
                <Camera size={16} color="#fff" />
              </View>
            )}
          </Pressable>
          <Text style={{ color: colors.textSecondary }} className="text-sm mt-2">{isUploading ? "Uploading..." : "Tap to change photo"}</Text>
        </View>

        {/* Profile Banner */}
        <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Profile Banner</Text>
        {(() => {
          const currentBannerUrl = bannerPhotoUrl;
          const showBanner = editBanner !== null ? (editBanner !== "") : !!currentBannerUrl;
          const bannerSource = editBanner !== null
            ? (editBanner !== "" ? editBanner : null)
            : (currentBannerUrl || null);
          return (
            <View className="mb-4">
              <Pressable
                onPress={onPickBanner}
                disabled={isUploading}
                className="rounded-xl overflow-hidden"
                style={{
                  height: 80,
                  backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderStyle: showBanner ? "solid" : "dashed",
                  opacity: isUploading ? 0.6 : 1,
                }}
              >
                {showBanner && bannerSource ? (
                  <View>
                    {/* INVARIANT_ALLOW_RAW_IMAGE_CONTENT — banner preview thumbnail, Cloudinary-transformed when applicable */}
                    <ExpoImage
                      source={{ uri: toCloudinaryTransformedUrl(bannerSource, CLOUDINARY_PRESETS.THUMBNAIL_SQUARE) }}
                      style={{ width: "100%", height: 80 }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                      priority="normal"
                    />
                    {isUploading && (
                      <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                    )}
                  </View>
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <ImagePlus size={20} color={colors.textTertiary} />
                    <Text style={{ color: colors.textTertiary }} className="text-xs mt-1">Add banner</Text>
                  </View>
                )}
              </Pressable>
              {showBanner && (
                <View className="flex-row mt-2" style={{ gap: 8, opacity: isUploading ? 0.5 : 1 }}>
                  <Pressable
                    onPress={onPickBanner}
                    disabled={isUploading}
                    className="flex-1 py-2 rounded-lg items-center"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text style={{ color: themeColor }} className="text-sm font-medium">Change Banner</Text>
                  </Pressable>
                  <Pressable
                    onPress={onRemoveBanner}
                    disabled={isUploading}
                    className="flex-1 py-2 rounded-lg items-center flex-row justify-center"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Trash2 size={14} color="#EF4444" />
                    <Text style={{ color: "#EF4444" }} className="text-sm font-medium ml-1">Remove</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })()}

        {/* Name Input */}
        <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Display Name</Text>
        <TextInput
          value={editName}
          onChangeText={onEditNameChange}
          placeholder="Enter your name"
          placeholderTextColor={colors.textTertiary}
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
          className="rounded-xl px-4 py-3 mb-4"
        />

        {/* Username Input */}
        <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Username</Text>
        <View className="relative mb-1">
          <View className="absolute left-4 top-0 bottom-0 justify-center z-10">
            <Text style={{ color: colors.textTertiary }} className="text-base">@</Text>
          </View>
          <TextInput
            value={editHandle}
            onChangeText={onEditHandleChange}
            onFocus={onUsernameFocus}
            placeholder="username"
            placeholderTextColor={colors.textTertiary}
            style={{
              backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
              color: colors.text,
              paddingLeft: 32,
            }}
            className="rounded-xl px-4 py-3"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {handleError ? (
          <Text className="text-red-500 text-xs mb-2">{handleError}</Text>
        ) : (
          <Text style={{ color: colors.textTertiary }} className="text-xs mb-4">
            This is how people can find you
          </Text>
        )}

        {/* Calendar Bio Input */}
        <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">My calendar looks like...</Text>
        <TextInput
          value={editCalendarBio}
          onChangeText={onEditCalendarBioChange}
          placeholder="Describe your calendar vibe (e.g., busy weekdays, free weekends...)"
          placeholderTextColor={colors.textTertiary}
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
          className="rounded-xl px-4 py-3 mb-1"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
        <Text style={{ color: colors.textTertiary }} className="text-xs text-right mb-4">
          {editCalendarBio.length}/300
        </Text>

        {/* Action Buttons */}
        <View className="flex-row">
          <Button
            variant="secondary"
            label="Cancel"
            onPress={onCancel}
            style={{ flex: 1, borderRadius: 12, marginRight: 8 }}
          />
          <Button
            variant="primary"
            label={isUploading ? "Uploading..." : isSaving ? "Saving..." : "Save"}
            onPress={onSave}
            disabled={isUploading || isSaving}
            loading={isUploading || isSaving}
            style={{ flex: 1, borderRadius: 12 }}
          />
        </View>
      </View>
    </Animated.View>
  );
}
