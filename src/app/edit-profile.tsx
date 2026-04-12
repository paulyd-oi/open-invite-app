/**
 * Edit Profile — Dedicated full-screen profile editor.
 *
 * Live themed background preview, profile fields, card color,
 * and a bottom dock with "Theme" tab that opens the profile theme picker.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Keyboard,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  Camera,
  ImagePlus,
  Trash2,
  Palette,
  X,
} from "@/ui/icons";

import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { useTheme } from "@/lib/ThemeContext";
import { usePremiumStatusContract, trackAnalytics } from "@/lib/entitlements";
import { getProfileDisplay, getProfileInitial } from "@/lib/profileDisplay";
import { getImageSource } from "@/lib/imageSource";
import { updateProfileAndSync } from "@/lib/profileSync";
import { invalidateProfileMedia } from "@/lib/mediaInvalidation";
import { normalizeHandle, validateHandle } from "@/lib/handleUtils";
import { uploadImage, uploadBannerPhoto } from "@/lib/imageUpload";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { safeToast } from "@/lib/safeToast";
import { toUserMessage, logError } from "@/lib/errors";
import { devLog } from "@/lib/devLog";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Button } from "@/ui/Button";
import { ProfileThemeBackground } from "@/components/ProfileThemeBackground";
import { ThemePicker } from "@/components/customization/ThemePicker";
import { PremiumUpsellSheet } from "@/components/paywall/PremiumUpsellSheet";
import {
  getThemesForSurface,
  isValidThemeId,
  type ThemeId,
} from "@/lib/eventThemes";
import { type UpdateProfileResponse, type GetProfileResponse } from "@/shared/contracts";

const PROFILE_THEME_IDS = getThemesForSurface("profile");

// ─── Component ──────────────────────────────────────────────

export default function EditProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const { themeColor, isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 768;
  const { isPro: userIsPro } = usePremiumStatusContract();

  // ── Profile data ──
  const { data: profileData } = useQuery({
    queryKey: qk.profile(),
    queryFn: () => api.get<GetProfileResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60_000,
  });

  // ── Edit state ──
  const [editName, setEditName] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editBanner, setEditBanner] = useState<string | null>(null);
  const [editCalendarBio, setEditCalendarBio] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── Theme/color state ──
  const [editThemeId, setEditThemeId] = useState<ThemeId | null>(null);
  const [showThemeTray, setShowThemeTray] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [upsell, setUpsell] = useState<{ visible: boolean; themeId: ThemeId | null }>({ visible: false, themeId: null });

  // ── Avatar source ──
  const [avatarSource, setAvatarSource] = useState<any>(null);

  // ── Prefill from profile data ──
  useEffect(() => {
    if (profileData?.profile) {
      const { displayName, avatarUri } = getProfileDisplay({ profileData, session });
      setEditName(displayName);
      setEditImage(avatarUri || "");
      setEditCalendarBio(profileData.profile.calendarBio || "");
      const handle = profileData.profile.handle;
      if (handle && !handle.startsWith("user_")) {
        setEditHandle(handle);
      }
      const rawThemeId = profileData.profile.profileThemeId;
      setEditThemeId(isValidThemeId(rawThemeId) ? rawThemeId as ThemeId : null);
    }
  }, [profileData, session]);

  // Load avatar source with auth headers
  useEffect(() => {
    const loadAvatar = async () => {
      try {
        const { avatarUri } = getProfileDisplay({ profileData, session });
        const source = await getImageSource(typeof avatarUri === "string" ? avatarUri : undefined);
        setAvatarSource(source ?? null);
      } catch {
        setAvatarSource(null);
      }
    };
    loadAvatar();
  }, [profileData, session]);

  // Keyboard tracking
  useEffect(() => {
    const s1 = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const s2 = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  // ── Mutations ──
  const updateProfileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put<UpdateProfileResponse>("/api/profile", data),
    onSuccess: async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateProfileAndSync(queryClient);
      invalidateProfileMedia(queryClient);
      safeToast.success("Saved", "Profile updated");
      router.back();
    },
    onError: (error: unknown) => {
      logError("EditProfile Save", error);
      const errCode = error && typeof error === "object" && "code" in error ? String((error as any).code) : "";
      if (errCode === "HANDLE_TAKEN") {
        setHandleError("That username is already taken");
      } else if (errCode === "USERNAME_COOLDOWN") {
        const errMsg = error && typeof error === "object" && "message" in error ? String((error as any).message) : "Username change on cooldown";
        setHandleError(errMsg);
      } else {
        const { title, message } = toUserMessage(error);
        safeToast.error(title, message);
      }
    },
  });

  // ── Handlers ──
  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        safeToast.error("Permission needed", "Please allow photo access in Settings");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setEditImage(result.assets[0].uri);
      }
    } catch (error) {
      logError("Pick Image", error);
      safeToast.error("Error", "Failed to pick image");
    }
  }, []);

  const handlePickBanner = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        safeToast.error("Permission needed", "Please allow photo access in Settings");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        // iOS ignores `aspect` and forces a square crop. Enforce 3:1 client-side
        // via center-crop so upload always matches the rendered 3:1 surface.
        const picked = result.assets[0];
        const targetRatio = 3;
        const w = picked.width ?? 0;
        const h = picked.height ?? 0;
        let finalUri = picked.uri;
        if (w > 0 && h > 0 && Math.abs(w / h - targetRatio) > 0.02) {
          try {
            let cropW = w;
            let cropH = Math.round(w / targetRatio);
            if (cropH > h) {
              cropH = h;
              cropW = Math.round(h * targetRatio);
            }
            const originX = Math.max(0, Math.round((w - cropW) / 2));
            const originY = Math.max(0, Math.round((h - cropH) / 2));
            const cropped = await ImageManipulator.manipulateAsync(
              picked.uri,
              [{ crop: { originX, originY, width: cropW, height: cropH } }],
              { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
            );
            finalUri = cropped.uri;
          } catch (cropErr) {
            logError("Banner Crop", cropErr);
          }
        }
        setEditBanner(finalUri);
      }
    } catch (error) {
      logError("Pick Banner", error);
      safeToast.error("Error", "Failed to pick image");
    }
  }, []);

  const handleSave = useCallback(async () => {
    // Validate handle
    const normalizedEditHandle = normalizeHandle(editHandle);
    const currentHandle = profileData?.profile?.handle ?? "";
    const currentHandleNormalized = currentHandle.startsWith("user_") ? "" : currentHandle;

    if (normalizedEditHandle && normalizedEditHandle !== currentHandleNormalized) {
      const validation = validateHandle(normalizedEditHandle);
      if (!validation.valid) {
        setHandleError(validation.error ?? "Invalid username");
        return;
      }
    }

    setHandleError(null);
    setIsUploading(true);

    try {
      const updates: Record<string, unknown> = {};
      const currentDisplayName = session?.user?.displayName ?? session?.user?.name;

      if (editName.trim() && editName !== currentDisplayName) {
        updates.name = editName.trim();
      }

      // Upload avatar if local file
      if (editImage && editImage !== session?.user?.image) {
        if (editImage.startsWith("file://")) {
          try {
            const uploadResponse = await uploadImage(editImage, true);
            updates.avatarUrl = uploadResponse.url;
          } catch (uploadError) {
            setIsUploading(false);
            logError("Profile Photo Upload", uploadError);
            safeToast.error("Upload Failed", "Failed to upload profile photo");
            return;
          }
        } else {
          updates.avatarUrl = editImage;
        }
      }

      // Upload banner if local file
      if (editBanner !== null) {
        if (editBanner === "") {
          updates.bannerPhotoUrl = null;
        } else if (editBanner.startsWith("file://")) {
          try {
            const bannerResponse = await uploadBannerPhoto(editBanner);
            updates.bannerPhotoUrl = bannerResponse.url;
          } catch (bannerError) {
            setIsUploading(false);
            logError("Banner Upload", bannerError);
            safeToast.error("Upload Failed", "Failed to upload banner photo");
            return;
          }
        } else {
          updates.bannerPhotoUrl = editBanner;
        }
      }

      // Calendar bio
      const currentCalendarBio = profileData?.profile?.calendarBio ?? "";
      if (editCalendarBio !== currentCalendarBio) {
        updates.calendarBio = editCalendarBio;
      }

      // Handle
      if (normalizedEditHandle !== currentHandleNormalized) {
        updates.handle = normalizedEditHandle;
      }

      // Theme — always include
      updates.profileThemeId = editThemeId;

      if (Object.keys(updates).length > 0) {
        setIsUploading(false);
        updateProfileMutation.mutate(updates);
        if (editThemeId) {
          trackAnalytics("profile_theme_saved", { themeId: editThemeId, userId: session?.user?.id });
        }
      } else {
        setIsUploading(false);
        router.back();
      }
    } catch (error) {
      setIsUploading(false);
      logError("EditProfile Save", error);
      safeToast.error("Error", "Failed to save profile");
    }
  }, [editName, editImage, editBanner, editCalendarBio, editHandle, editThemeId, profileData, session, updateProfileMutation, router]);

  const handleThemeSelect = useCallback((themeId: ThemeId | null) => {
    Haptics.selectionAsync();
    setEditThemeId(themeId);
    if (themeId) {
      trackAnalytics("profile_theme_selected_free", { themeId, userId: session?.user?.id });
    }
  }, [session]);

  const handlePremiumUpsell = useCallback((themeId: ThemeId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackAnalytics("profile_theme_previewed_premium", { themeId, userId: session?.user?.id });
    setUpsell({ visible: true, themeId });
  }, [session]);

  const isSaving = updateProfileMutation.isPending || isUploading;
  const bannerPhotoUrl = (profileData?.profile as any)?.bannerPhotoUrl ?? null;
  const displayBanner = editBanner !== null
    ? (editBanner === "" ? null : editBanner)
    : bannerPhotoUrl;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={[]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Live theme background */}
      {editThemeId && (
        <ProfileThemeBackground themeId={editThemeId} />
      )}

      {/* Header */}
      {/* ── Header bar with glass blur for legibility over themes ── */}
      <View style={{ zIndex: 10 }}>
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: insets.top + 4,
            paddingHorizontal: 16,
            paddingBottom: 8,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16, textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>Cancel</Text>
          </Pressable>
          <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>
            Edit Profile
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            hitSlop={12}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 12,
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>Save</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={{
            paddingBottom: 160,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ═══ Profile Card (mirrors live profile card structure) ═══ */}
          <View
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: 1,
              marginHorizontal: 20,
              marginTop: 8,
            }}
          >
            {/* ── Banner (3:1) with edit overlay ── */}
            <Pressable onPress={handlePickBanner}>
              <View
                style={{
                  aspectRatio: 3,
                  width: "100%",
                  backgroundColor: isDark ? colors.surfaceElevated : "#F3F4F6",
                }}
              >
                {displayBanner ? (
                  <ExpoImage
                    source={{
                      uri: displayBanner.startsWith("file://")
                        ? displayBanner
                        : toCloudinaryTransformedUrl(displayBanner, CLOUDINARY_PRESETS.HERO_BANNER),
                    }}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ImagePlus size={24} color={colors.textTertiary} />
                    <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>
                      Tap to add banner
                    </Text>
                  </View>
                )}
                {/* Subtle tint */}
                {displayBanner && (
                  <View style={{
                    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: isDark ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.18)",
                  }} />
                )}
                {/* Bottom legibility gradient */}
                {displayBanner && (
                  <View pointerEvents="none" style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: 60,
                    backgroundColor: isDark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.25)",
                  }} />
                )}
                {/* Banner action icons */}
                <View style={{ position: "absolute", top: 8, right: 8, flexDirection: "row", gap: 6 }}>
                  <View style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: "rgba(0,0,0,0.5)",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <ImagePlus size={14} color="#FFF" />
                  </View>
                  {displayBanner && (
                    <Pressable
                      onPress={() => {
                        setEditBanner("");
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Trash2 size={14} color="#FFF" />
                    </Pressable>
                  )}
                </View>
              </View>
            </Pressable>

            {/* ── Avatar overlapping banner bottom (centered) ── */}
            <View style={{ alignItems: "center", marginTop: -44, zIndex: 2 }}>
              <Pressable onPress={handlePickImage}>
                <View style={{ shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
                  <EntityAvatar
                    imageSource={editImage.startsWith("file://") ? { uri: editImage } : avatarSource}
                    initials={getProfileInitial({ profileData, session })}
                    size={80}
                    backgroundColor={isDark ? colors.surfaceElevated : `${themeColor}15`}
                    foregroundColor={themeColor}
                    fallbackIcon="person"
                  />
                </View>
                <View
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: themeColor,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: colors.surface,
                  }}
                >
                  <Camera size={12} color="#FFF" />
                </View>
              </Pressable>
            </View>

            {/* ── Fields card (glass panel matching live profile) ── */}
            <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 12 }}>
              {/* Display Name */}
              <View>
                <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: "500", marginBottom: 4, marginLeft: 4 }}>
                  Display Name
                </Text>
                <View style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  paddingHorizontal: 12,
                }}>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Your name"
                    placeholderTextColor={colors.textTertiary}
                    textAlign="center"
                    style={{
                      color: colors.text,
                      fontSize: 20,
                      fontWeight: "700",
                      paddingVertical: 10,
                      letterSpacing: -0.3,
                    }}
                  />
                </View>
              </View>

              {/* Username */}
              <View>
                <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: "500", marginBottom: 4, marginLeft: 4 }}>
                  Username
                </Text>
                <View style={{
                  flexDirection: "row",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  paddingHorizontal: 12,
                  justifyContent: "center",
                }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>@</Text>
                  <TextInput
                    value={editHandle}
                    onChangeText={(text) => {
                      setEditHandle(text.replace(/^@+/, "").toLowerCase());
                      setHandleError(null);
                    }}
                    placeholder="username"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign="center"
                    style={{
                      color: colors.textSecondary,
                      fontSize: 14,
                      paddingVertical: 10,
                    }}
                  />
                </View>
                {handleError && (
                  <Text style={{ color: "#FF3B30", fontSize: 12, marginTop: 4, textAlign: "center" }}>{handleError}</Text>
                )}
              </View>

              {/* Calendar Bio */}
              <View>
                <Text style={{ color: colors.textTertiary, fontSize: 12, fontWeight: "500", marginBottom: 4, marginLeft: 4 }}>
                  My calendar looks like...
                </Text>
                <View style={{
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  paddingHorizontal: 12,
                }}>
                  <TextInput
                    value={editCalendarBio}
                    onChangeText={(text) => setEditCalendarBio(text.slice(0, 300))}
                    placeholder="Busy weeks, chill weekends"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    maxLength={300}
                    textAlign="center"
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      paddingVertical: 10,
                      minHeight: 40,
                    }}
                  />
                </View>
                <Text style={{ color: colors.textTertiary, fontSize: 11, textAlign: "right", marginTop: 4 }}>
                  {editCalendarBio.length}/300
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Bottom Dock — Theme tab ── */}
      {!keyboardVisible && (
        <View
          style={{
            position: "absolute",
            ...(isWide
              ? { left: Math.max(40, (screenWidth - 400) / 2), right: Math.max(40, (screenWidth - 400) / 2) }
              : { left: 0, right: 0, paddingHorizontal: 40 }),
            bottom: insets.bottom + 8,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: isDark ? "rgba(28,28,30,0.92)" : "rgba(255,255,255,0.92)",
              borderRadius: 28,
              paddingVertical: 6,
              paddingHorizontal: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.35 : 0.12,
              shadowRadius: 16,
              elevation: 16,
              borderWidth: 0.5,
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowThemeTray(!showThemeTray);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 20,
                borderRadius: 20,
                backgroundColor: showThemeTray
                  ? (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)")
                  : "transparent",
              }}
            >
              <Palette
                size={18}
                color={showThemeTray ? themeColor : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)")}
              />
              <Text
                style={{
                  marginLeft: 6,
                  fontSize: 13,
                  fontWeight: "600",
                  color: showThemeTray ? themeColor : (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)"),
                }}
              >
                Theme
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Theme Tray (above dock) ── */}
      {showThemeTray && !keyboardVisible && (
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: insets.bottom + 64,
            zIndex: 50,
          }}
        >
          <BlurView
            intensity={isDark ? 60 : 50}
            tint={isDark ? "dark" : "light"}
            style={{
              borderRadius: 22,
              overflow: "hidden",
              borderWidth: 0.5,
              borderColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.18,
              shadowRadius: 20,
              elevation: 20,
            }}
          >
            <View
              style={{
                backgroundColor: isDark ? "rgba(28,28,30,0.72)" : "rgba(255,255,255,0.78)",
                padding: 14,
                paddingTop: 16,
              }}
            >
              {/* Handle bar */}
              <View style={{ alignItems: "center", marginBottom: 10 }}>
                <View
                  style={{
                    width: 32,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.12)",
                  }}
                />
              </View>

              <ThemePicker
                themeIds={PROFILE_THEME_IDS}
                selectedThemeId={editThemeId}
                userIsPro={userIsPro}
                themeColor={themeColor}
                isDark={isDark}
                onThemeSelect={handleThemeSelect}
                onPremiumUpsell={handlePremiumUpsell}
                layout="horizontal"
              />
            </View>
          </BlurView>
        </View>
      )}

      {/* Premium upsell */}
      <PremiumUpsellSheet
        visible={upsell.visible}
        title="Premium Profile Theme"
        subtitle="Unlock premium themes to personalize your profile"
        analyticsShowEvent="profile_theme_upsell_shown"
        analyticsUpgradeEvent="profile_theme_upsell_tapped"
        analyticsProps={{ themeId: upsell.themeId, userId: session?.user?.id }}
        onDismiss={() => setUpsell({ visible: false, themeId: null })}
      />
    </SafeAreaView>
  );
}
