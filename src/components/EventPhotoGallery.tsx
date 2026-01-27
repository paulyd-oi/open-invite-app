import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { safeToast } from "@/lib/safeToast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Camera, ImagePlus, X, Trash2, ChevronLeft, ChevronRight, Download } from "@/ui/icons";
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { api } from "@/lib/api";
import { uploadImage } from "@/lib/imageUpload";
import { requestCameraPermission } from "@/lib/permissions";

// Define types locally to avoid import issues
interface EventPhoto {
  id: string;
  eventId: string;
  userId: string;
  imageUrl: string;
  caption: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface GetEventPhotosResponse {
  photos: EventPhoto[];
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Robust uploaderId resolver to handle various photo object shapes
// Normalizes all IDs to strings for truthful comparison
function getUploaderId(photo: EventPhoto): string | null {
  const candidate = photo.userId ?? (photo as any).uploaderId ?? (photo as any).createdById ?? (photo as any).actorId ?? (photo as any).ownerId ?? null;
  return candidate != null ? String(candidate) : null;
}

interface EventPhotoGalleryProps {
  eventId: string;
  eventTitle: string;
  eventTime: Date;
  isOwner: boolean;
  hostId: string;
}

export function EventPhotoGallery({
  eventId,
  eventTitle,
  eventTime,
  isOwner,
  hostId,
}: EventPhotoGalleryProps) {
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const queryClient = useQueryClient();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDeletePhotoConfirm, setShowDeletePhotoConfirm] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedGroupPhotoId, setSelectedGroupPhotoId] = useState<string | null>(null);
  const [showGroupPhotoPrompt, setShowGroupPhotoPrompt] = useState(false);
  const [pendingPhotoForGroup, setPendingPhotoForGroup] = useState<string | null>(null);
  const [isUploadingGroupPhoto, setIsUploadingGroupPhoto] = useState(false);

  // Check if event is in the past (can add photos)
  const isPastEvent = eventTime < new Date();

  // Photo upload limits
  const MAX_PHOTOS_PER_USER = 5;
  const MAX_PHOTOS_FOR_HOST = 10;
  const MAX_PHOTOS_TOTAL = 20;
  const userPhotoLimit = isOwner ? MAX_PHOTOS_FOR_HOST : MAX_PHOTOS_PER_USER;

  // Fetch event photos
  const { data: photosData, isLoading } = useQuery({
    queryKey: ["events", eventId, "photos"],
    queryFn: () => api.get<GetEventPhotosResponse>(`/api/events/${eventId}/photos`),
    enabled: bootStatus === "authed" && !!eventId,
  });

  const photos = photosData?.photos ?? [];

  // Calculate user's upload count and remaining slots using robust uploaderId resolver
  const currentUserId = session?.user?.id;
  const userPhotosCount = currentUserId ? photos.filter((p) => getUploaderId(p) === currentUserId).length : 0;
  const userUploadsRemaining = Math.max(0, userPhotoLimit - userPhotosCount);
  const eventSlotsRemaining = Math.max(0, MAX_PHOTOS_TOTAL - photos.length);
  const canUpload = userUploadsRemaining > 0 && eventSlotsRemaining > 0 && cooldownSeconds === 0;

  // Phase 3B: Quality over quantity microcopy threshold
  const shouldShowQualityMicrocopy = userPhotosCount >= 3 || userUploadsRemaining <= 2;

  // Group photo logic
  const isHost = currentUserId === hostId;
  
  // Pure computation: find selected photo by ID (no side effects)
  const selectedPhoto = selectedGroupPhotoId ? photos.find((p) => p.id === selectedGroupPhotoId) : undefined;

  // Determine group photo: use stored selection if valid, else heuristic (first host-uploaded photo)
  const groupPhoto = selectedPhoto ?? photos.find((p) => getUploaderId(p) === String(hostId)) ?? null;

  const hasGroupPhoto = !!groupPhoto;

  // Load selected group photo from local storage
  useEffect(() => {
    const loadGroupPhoto = async () => {
      try {
        const stored = await SecureStore.getItemAsync(`oi_group_photo:${eventId}`);
        if (stored) {
          setSelectedGroupPhotoId(stored);
        }
      } catch (error) {
        if (__DEV__) console.log("[GroupPhoto] Failed to load selection:", error);
      }
    };
    loadGroupPhoto();
  }, [eventId]);

  // Cleanup invalid selectedGroupPhotoId (photo was deleted/not in list)
  useEffect(() => {
    if (selectedGroupPhotoId && !selectedPhoto) {
      // Selected photo is no longer in the list, clear stored selection
      SecureStore.deleteItemAsync(`oi_group_photo:${eventId}`).catch(() => {});
      setSelectedGroupPhotoId(null);
    }
  }, [selectedGroupPhotoId, selectedPhoto, eventId]);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
      }
    };
  }, []);

  // Start cooldown timer
  const startCooldown = useCallback((seconds: number) => {
    setCooldownSeconds(seconds);
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }
    cooldownTimerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Upload photo mutation
  const uploadPhotoMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      return api.post<{ photo: EventPhoto }>(`/api/events/${eventId}/photos`, {
        imageUrl,
        caption: "",
      });
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "photos"] });
      queryClient.invalidateQueries({ queryKey: ["events", "single", eventId] });
      setShowUploadModal(false);
      
      // Defensive parsing: support multiple response shapes
      const uploaded = (data as any)?.photo ?? (data as any)?.data ?? data;
      const uploadedId = uploaded?.id ?? (data as any)?.photoId ?? null;
      
      // Show "Make this Group Photo?" prompt for hosts if no group photo exists yet
      if (isHost && !hasGroupPhoto && !isUploadingGroupPhoto && uploadedId) {
        setPendingPhotoForGroup(uploadedId);
        setShowGroupPhotoPrompt(true);
      } else {
        safeToast.success("Added!", "Your photo has been uploaded.");
      }
    },
    onError: (error: any) => {
      // Handle specific backend error codes
      const errorCode = error?.data?.code || error?.code;
      const retryAfterSec = error?.data?.retryAfterSec;

      if (errorCode === "EVENT_PHOTO_LIMIT_REACHED") {
        safeToast.error("Limit Reached", "Event photo limit reached.");
        setShowUploadModal(false);
      } else if (errorCode === "USER_EVENT_PHOTO_LIMIT_REACHED") {
        safeToast.error("Limit Reached", "You've reached your upload limit for this event.");
        setShowUploadModal(false);
      } else if (errorCode === "EVENT_PHOTO_COOLDOWN" && retryAfterSec) {
        safeToast.warning("Please Wait", `Please wait ${retryAfterSec}s before uploading again.`);
        setShowUploadModal(false);
        startCooldown(retryAfterSec);
      } else {
        safeToast.error("Error", error?.message ?? "Failed to upload photo");
      }
    },
  });

  // Delete photo mutation
  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) =>
      api.delete(`/api/events/${eventId}/photos/${photoId}`),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["events", eventId, "photos"] });
    },
    onError: () => {
      safeToast.error("Error", "Failed to delete photo");
    },
  });

  // Download photo to device
  const handleDownloadPhoto = async (imageUrl: string) => {
    try {
      setDownloading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Request permission to save to media library
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning(
          "Permission Required",
          "Please allow access to your photo library to save images."
        );
        return;
      }

      // Generate a unique filename
      const filename = `event_photo_${Date.now()}.jpg`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      // Download the image
      const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);

      if (downloadResult.status !== 200) {
        throw new Error("Failed to download image");
      }

      // Save to media library
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);

      // Optionally create an album for the app
      const album = await MediaLibrary.getAlbumAsync("Open Invite");
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await MediaLibrary.createAlbumAsync("Open Invite", asset, false);
      }

      // Clean up temp file
      await FileSystem.deleteAsync(fileUri, { idempotent: true });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Saved!", "Photo has been saved to your photo library.");
    } catch (error) {
      console.error("Download error:", error);
      safeToast.error("Error", "Failed to save photo. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePickImage = async (isGroupPhotoMode = false) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      if (isGroupPhotoMode) {
        setIsUploadingGroupPhoto(true);
      }
      // Check limits before proceeding
      if (!canUpload) {
        if (cooldownSeconds > 0) {
          safeToast.warning("Please Wait", `Please wait ${cooldownSeconds}s before uploading again.`);
        } else if (userUploadsRemaining <= 0) {
          safeToast.error("Limit Reached", "You've reached your upload limit for this event.");
        } else {
          safeToast.error("Limit Reached", "Event photo limit reached.");
        }
        return;
      }
      setUploading(true);
      try {
        // Compress and upload the image to the server
        const uploadResponse = await uploadImage(result.assets[0].uri, true);
        await uploadPhotoMutation.mutateAsync(uploadResponse.url);
      } catch (error: any) {
        // Error handled by mutation onError
        if (!error?.data?.code) {
          safeToast.error("Upload Failed", error?.message ?? "Could not upload image. Please try again.");
        }
      } finally {
        setUploading(false);
        if (isGroupPhotoMode) {
          setIsUploadingGroupPhoto(false);
        }
      }
    }
  };

  const handleTakePhoto = async (isGroupPhotoMode = false) => {
    // Use improved permission request with explanation
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      if (isGroupPhotoMode) {
        setIsUploadingGroupPhoto(true);
      }
      // Check limits before proceeding
      if (!canUpload) {
        if (cooldownSeconds > 0) {
          safeToast.warning("Please Wait", `Please wait ${cooldownSeconds}s before uploading again.`);
        } else if (userUploadsRemaining <= 0) {
          safeToast.error("Limit Reached", "You've reached your upload limit for this event.");
        } else {
          safeToast.error("Limit Reached", "Event photo limit reached.");
        }
        return;
      }
      setUploading(true);
      try {
        // Compress and upload the image to the server
        const uploadResponse = await uploadImage(result.assets[0].uri, true);
        await uploadPhotoMutation.mutateAsync(uploadResponse.url);
      } catch (error: any) {
        // Error handled by mutation onError
        if (!error?.data?.code) {
          safeToast.error("Upload Failed", error?.message ?? "Could not upload image. Please try again.");
        }
      } finally {
        setUploading(false);
        if (isGroupPhotoMode) {
          setIsUploadingGroupPhoto(false);
        }
      }
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setPhotoToDelete(photoId);
    setShowDeletePhotoConfirm(true);
  };

  const confirmDeletePhoto = () => {
    if (photoToDelete) {
      deletePhotoMutation.mutate(photoToDelete);
    }
    setShowDeletePhotoConfirm(false);
    setPhotoToDelete(null);
  };

  const openGallery = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPhotoIndex(index);
    setShowGalleryModal(true);
  };

  // Handler to set group photo
  const handleSetGroupPhoto = async (photoId: string) => {
    try {
      await SecureStore.setItemAsync(`oi_group_photo:${eventId}`, photoId);
      setSelectedGroupPhotoId(photoId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeToast.success("Set as Group Photo", "Everyone will see this first.");
    } catch (error) {
      if (__DEV__) console.error("[GroupPhoto] Failed to save selection:", error);
      safeToast.error("Error", "Failed to save group photo selection.");
    }
  };

  // Handler for Make Group Photo prompt
  const handleConfirmGroupPhoto = async () => {
    if (pendingPhotoForGroup) {
      await handleSetGroupPhoto(pendingPhotoForGroup);
    }
    setShowGroupPhotoPrompt(false);
    setPendingPhotoForGroup(null);
  };

  const handleDeclineGroupPhoto = () => {
    setShowGroupPhotoPrompt(false);
    setPendingPhotoForGroup(null);
    safeToast.success("Added!", "Your photo has been uploaded.");
  };

  // Don't show for future events
  if (!isPastEvent && photos.length === 0) {
    return null;
  }

  return (
    <>
      <View className="mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Camera size={20} color={themeColor} />
            <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
              Memories
            </Text>
            {photos.length > 0 && (
              <View className="px-2 py-1 rounded-full ml-2" style={{ backgroundColor: `${themeColor}20` }}>
                <Text className="text-xs font-semibold" style={{ color: themeColor }}>
                  {photos.length}
                </Text>
              </View>
            )}
          </View>
          {isPastEvent && (
            <Pressable
              onPress={() => {
                if (cooldownSeconds > 0) {
                  safeToast.warning("Please Wait", `Please wait ${cooldownSeconds}s before uploading again.`);
                  return;
                }
                if (!canUpload) {
                  if (userUploadsRemaining <= 0) {
                    safeToast.error("Limit Reached", "You've reached your upload limit for this event.");
                  } else {
                    safeToast.error("Limit Reached", "Event photo limit reached.");
                  }
                  return;
                }
                Haptics.selectionAsync();
                setShowUploadModal(true);
              }}
              className="flex-row items-center px-3 py-1.5 rounded-full"
              style={{ 
                backgroundColor: canUpload ? `${themeColor}20` : (isDark ? "#3C3C3E" : "#E5E7EB"),
                opacity: canUpload ? 1 : 0.6,
              }}
            >
              <ImagePlus size={16} color={canUpload ? themeColor : colors.textTertiary} />
              <Text className="text-sm font-medium ml-1" style={{ color: canUpload ? themeColor : colors.textTertiary }}>
                {uploading 
                  ? "Uploading…" 
                  : cooldownSeconds > 0 
                    ? `Wait ${cooldownSeconds}s` 
                    : userUploadsRemaining === 1 
                      ? "Add last photo"
                      : userPhotosCount >= 3 
                        ? "Add 1 more"
                        : "Add photos"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Phase 3B: Quality over quantity microcopy */}
        {isPastEvent && shouldShowQualityMicrocopy && userUploadsRemaining > 0 && (
          <View className="mb-3 px-2">
            <Text className="text-xs font-medium" style={{ color: colors.text }}>
              Pick your best moments 👌
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
              Quality over quantity—share the highlights.
            </Text>
          </View>
        )}

        {/* Limits helper text */}
        {isPastEvent && (
          <View className="mb-2">
            <Text className="text-xs" style={{ color: colors.textTertiary }}>
              {isOwner ? `${MAX_PHOTOS_FOR_HOST} max for host` : `${MAX_PHOTOS_PER_USER} max per person`} • {MAX_PHOTOS_TOTAL} max total
            </Text>
            {currentUserId && (
              <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                You have {userUploadsRemaining} upload{userUploadsRemaining !== 1 ? "s" : ""} left • Event has {eventSlotsRemaining} slot{eventSlotsRemaining !== 1 ? "s" : ""} left
              </Text>
            )}
          </View>
        )}

        {/* Group Photo Section */}
        {isPastEvent && (
          <View className="mb-4">
            {hasGroupPhoto ? (
              <>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>
                    Group Photo
                  </Text>
                  {isHost && (
                    <Pressable
                      onPress={() => setShowUploadModal(true)}
                      className="px-2 py-1 rounded-full"
                      style={{ backgroundColor: `${themeColor}15` }}
                    >
                      <Text className="text-xs font-medium" style={{ color: themeColor }}>
                        Replace
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Pressable
                  onPress={() => {
                    const index = photos.findIndex((p) => p.id === groupPhoto.id);
                    if (index >= 0) openGallery(index);
                  }}
                >
                  <Image
                    source={{ uri: groupPhoto.imageUrl }}
                    className="w-full rounded-2xl"
                    style={{ aspectRatio: 16 / 9 }}
                    resizeMode="cover"
                  />
                  <View
                    className="absolute bottom-3 left-3 right-3 flex-row items-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, padding: 8 }}
                  >
                    <View className="w-6 h-6 rounded-full overflow-hidden mr-2">
                      {groupPhoto.user?.image ? (
                        <Image source={{ uri: groupPhoto.user.image }} className="w-full h-full" />
                      ) : (
                        <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor }}>
                          <Text className="text-white text-xs font-bold">
                            {groupPhoto.user?.name?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-white text-sm flex-1" numberOfLines={1}>
                      {groupPhoto.user?.name ?? "User"}
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : (
              <>
                {/* Host nudge when no group photo */}
                {isHost ? (
                  <Pressable
                    onPress={() => setShowUploadModal(true)}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: `${themeColor}10`, borderWidth: 1, borderColor: `${themeColor}30` }}
                  >
                    <View className="flex-row items-center mb-2">
                      <Camera size={18} color={themeColor} />
                      <Text className="text-sm font-semibold ml-2" style={{ color: colors.text }}>
                        Host tip: Take one group photo 📸
                      </Text>
                    </View>
                    <Text className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                      It's the one photo everyone wants.
                    </Text>
                    <View className="flex-row items-center">
                      <ImagePlus size={14} color={themeColor} />
                      <Text className="text-xs font-medium ml-1" style={{ color: themeColor }}>
                        Add group photo
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <View className="rounded-2xl p-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                    <View className="flex-row items-center mb-1">
                      <Camera size={16} color={colors.textTertiary} />
                      <Text className="text-sm font-medium ml-2" style={{ color: colors.text }}>
                        Group Photo
                      </Text>
                    </View>
                    <Text className="text-xs" style={{ color: colors.textSecondary }}>
                      Get a group photo before everyone leaves 📸
                    </Text>
                    <Text className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                      Upload one group pic—best memory of the night.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Photo Grid */}
        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="small" color={themeColor} />
          </View>
        ) : photos.length === 0 ? (
          <Pressable
            onPress={() => isPastEvent && setShowUploadModal(true)}
            className="rounded-2xl p-6 items-center"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}
          >
            <Camera size={40} color={colors.textTertiary} />
            <Text className="text-center mt-3 font-medium" style={{ color: colors.text }}>
              No photos yet
            </Text>
            <Text className="text-center mt-1 text-sm" style={{ color: colors.textSecondary }}>
              {isPastEvent
                ? "Share your favorite moments from this event!"
                : "Photos can be added after the event"}
            </Text>
          </Pressable>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 20 }}
            style={{ marginLeft: -20, marginRight: -20, paddingLeft: 20 }}
          >
            {photos.map((photo, index) => (
              <Animated.View
                key={photo.id}
                entering={FadeIn.delay(index * 100)}
              >
                <Pressable
                  onPress={() => openGallery(index)}
                  className="mr-3"
                >
                  <Image
                    source={{ uri: photo.imageUrl }}
                    className="w-32 h-32 rounded-xl"
                    resizeMode="cover"
                  />
                  <View
                    className="absolute bottom-2 left-2 right-2 flex-row items-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, padding: 4 }}
                  >
                    <View className="w-5 h-5 rounded-full overflow-hidden mr-1">
                      {photo.user?.image ? (
                        <Image source={{ uri: photo.user?.image }} className="w-full h-full" />
                      ) : (
                        <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor }}>
                          <Text className="text-white text-xs font-bold">
                            {photo.user?.name?.[0] ?? "?"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-white text-xs flex-1" numberOfLines={1}>
                      {photo.user?.name ?? "User"}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Upload Modal */}
      <Modal
        visible={showUploadModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowUploadModal(false)}
        >
          <Pressable onPress={() => {}} className="mx-4 mb-8">
            <Animated.View
              entering={FadeInDown.springify()}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="px-5 py-4 border-b" style={{ borderColor: colors.border }}>
                <Text className="text-lg font-bold text-center" style={{ color: colors.text }}>
                  Add Photo
                </Text>
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  Share a memory from "{eventTitle}"
                </Text>
              </View>

              {uploading ? (
                <View className="py-12 items-center">
                  <ActivityIndicator size="large" color={themeColor} />
                  <Text className="mt-4" style={{ color: colors.textSecondary }}>
                    Uploading...
                  </Text>
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={handleTakePhoto}
                    className="flex-row items-center px-5 py-4 border-b"
                    style={{ borderColor: colors.border }}
                  >
                    <View
                      className="w-12 h-12 rounded-xl items-center justify-center"
                      style={{ backgroundColor: `${themeColor}20` }}
                    >
                      <Camera size={24} color={themeColor} />
                    </View>
                    <View className="flex-1 ml-4">
                      <Text className="font-semibold" style={{ color: colors.text }}>
                        Take Photo
                      </Text>
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        Use your camera
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={handlePickImage}
                    className="flex-row items-center px-5 py-4"
                  >
                    <View
                      className="w-12 h-12 rounded-xl items-center justify-center"
                      style={{ backgroundColor: "#4ECDC420" }}
                    >
                      <ImagePlus size={24} color="#4ECDC4" />
                    </View>
                    <View className="flex-1 ml-4">
                      <Text className="font-semibold" style={{ color: colors.text }}>
                        Choose from Library
                      </Text>
                      <Text className="text-sm" style={{ color: colors.textSecondary }}>
                        Select an existing photo
                      </Text>
                    </View>
                  </Pressable>
                </>
              )}
            </Animated.View>

            <Pressable
              onPress={() => setShowUploadModal(false)}
              className="rounded-2xl items-center py-4 mt-2"
              style={{ backgroundColor: colors.surface }}
            >
              <Text className="font-semibold" style={{ color: colors.text }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Full-screen Gallery Modal */}
      <Modal
        visible={showGalleryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGalleryModal(false)}
      >
        <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.95)" }}>
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowGalleryModal(false);
              }}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
            >
              <X size={24} color="#fff" />
            </Pressable>
            <Text className="text-white font-semibold">
              {selectedPhotoIndex + 1} / {photos.length}
            </Text>
            <View className="flex-row items-center">
              {/* Download Button */}
              <Pressable
                onPress={() => {
                  const photo = photos[selectedPhotoIndex];
                  if (photo) handleDownloadPhoto(photo.imageUrl);
                }}
                disabled={downloading}
                className="w-10 h-10 rounded-full items-center justify-center mr-2"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Download size={20} color="#4ECDC4" />
                )}
              </Pressable>
              {/* Delete Button (for owner or photo uploader) */}
              {(photos[selectedPhotoIndex]?.userId === session?.user?.id || isOwner) && (
                <Pressable
                  onPress={() => {
                    const photo = photos[selectedPhotoIndex];
                    if (photo) handleDeletePhoto(photo.id);
                  }}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
                >
                  <Trash2 size={20} color="#EF4444" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Photo */}
          <View className="flex-1 justify-center items-center">
            {photos[selectedPhotoIndex] && (
              <Animated.Image
                key={photos[selectedPhotoIndex].id}
                entering={ZoomIn.springify()}
                source={{ uri: photos[selectedPhotoIndex].imageUrl }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}
                resizeMode="contain"
              />
            )}
          </View>

          {/* Navigation */}
          <View className="flex-row items-center justify-between px-4 pb-12">
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedPhotoIndex((prev) => Math.max(0, prev - 1));
              }}
              disabled={selectedPhotoIndex === 0}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                opacity: selectedPhotoIndex === 0 ? 0.3 : 1,
              }}
            >
              <ChevronLeft size={24} color="#fff" />
            </Pressable>

            {/* Photo Info */}
            <View className="items-center">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full overflow-hidden mr-2">
                  {photos[selectedPhotoIndex]?.user?.image ? (
                    <Image
                      source={{ uri: photos[selectedPhotoIndex]?.user?.image ?? undefined }}
                      className="w-full h-full"
                    />
                  ) : (
                    <View className="w-full h-full items-center justify-center" style={{ backgroundColor: themeColor }}>
                      <Text className="text-white font-bold">
                        {photos[selectedPhotoIndex]?.user?.name?.[0] ?? "?"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="text-white font-medium">
                  {photos[selectedPhotoIndex]?.user?.name ?? "User"}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedPhotoIndex((prev) => Math.min(photos.length - 1, prev + 1));
              }}
              disabled={selectedPhotoIndex === photos.length - 1}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                opacity: selectedPhotoIndex === photos.length - 1 ? 0.3 : 1,
              }}
            >
              <ChevronRight size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Delete Photo Confirm Modal */}
      <ConfirmModal
        visible={showDeletePhotoConfirm}
        title="Delete Photo"
        message="Are you sure you want to delete this photo?"
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDeletePhoto}
        onCancel={() => {
          setShowDeletePhotoConfirm(false);
          setPhotoToDelete(null);
        }}
      />

      {/* Make this Group Photo Prompt Modal */}
      <Modal
        visible={showGroupPhotoPrompt}
        transparent
        animationType="fade"
        onRequestClose={handleDeclineGroupPhoto}
      >
        <Pressable
          className="flex-1 justify-center items-center px-6"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={handleDeclineGroupPhoto}
        >
          <Pressable onPress={() => {}} className="w-full">
            <Animated.View
              entering={FadeInUp.springify()}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: colors.surface }}
            >
              <View className="p-6">
                <View className="items-center mb-4">
                  <View
                    className="w-16 h-16 rounded-full items-center justify-center mb-3"
                    style={{ backgroundColor: `${themeColor}20` }}
                  >
                    <Camera size={32} color={themeColor} />
                  </View>
                  <Text className="text-lg font-bold text-center" style={{ color: colors.text }}>
                    Make this the Group Photo?
                  </Text>
                  <Text className="text-sm text-center mt-2" style={{ color: colors.textSecondary }}>
                    Everyone will see it first.
                  </Text>
                </View>

                <Pressable
                  onPress={handleConfirmGroupPhoto}
                  className="rounded-xl py-3 items-center mb-2"
                  style={{ backgroundColor: themeColor }}
                >
                  <Text className="font-semibold text-white">Yes</Text>
                </Pressable>

                <Pressable
                  onPress={handleDeclineGroupPhoto}
                  className="rounded-xl py-3 items-center"
                  style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                >
                  <Text className="font-semibold" style={{ color: colors.text }}>
                    Not now
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
