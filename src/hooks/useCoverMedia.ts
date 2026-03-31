import { useState, useCallback } from "react";
import { devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";
import { uploadByKind } from "@/lib/imageUpload";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import type { CoverMediaItem } from "@/components/create/coverMedia.types";

export function useCoverMedia() {
  const [bannerLocalUri, setBannerLocalUri] = useState<string | null>(null);
  const [bannerUpload, setBannerUpload] = useState<{ url: string; publicId: string } | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [selectedCoverItem, setSelectedCoverItem] = useState<CoverMediaItem | null>(null);
  // Session-scoped user uploads for the My Uploads tab
  const [coverUploads, setCoverUploads] = useState<CoverMediaItem[]>([]);

  const handlePickBanner = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning("Permission Required", "Please allow access to your photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      // Build a CoverMediaItem for the My Uploads grid
      const uploadItem: CoverMediaItem = {
        id: `upload-${Date.now()}`,
        type: "image",
        url: uri,
        thumbnailUrl: uri,
        source: "upload",
      };
      setCoverUploads((prev) => [uploadItem, ...prev]);
      setSelectedCoverItem(uploadItem);
      setBannerLocalUri(uri);
      setBannerUpload(null);
      setUploadingBanner(true);
      try {
        const upload = await uploadByKind(uri, "event_cover");
        setBannerUpload({ url: upload.url, publicId: upload.publicId ?? "" });
        // Update the upload item's URL to the Cloudinary URL
        const cloudinaryItem: CoverMediaItem = {
          ...uploadItem,
          url: upload.url,
          thumbnailUrl: uri, // keep local URI for fast thumbnail
        };
        setCoverUploads((prev) =>
          prev.map((item) => (item.id === uploadItem.id ? cloudinaryItem : item)),
        );
        setSelectedCoverItem(cloudinaryItem);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e: any) {
        if (__DEV__) devError("[CREATE_BANNER_UPLOAD]", e);
        safeToast.error("Upload failed", "Please try again.");
        setBannerLocalUri(null);
        // Remove from uploads on failure
        setCoverUploads((prev) => prev.filter((item) => item.id !== uploadItem.id));
        setSelectedCoverItem(null);
      } finally {
        setUploadingBanner(false);
      }
    } catch (e: any) {
      if (__DEV__) devError("[CREATE_BANNER_PICK]", e);
    }
  }, []);

  const handleRemoveBanner = useCallback(() => {
    setBannerLocalUri(null);
    setBannerUpload(null);
    setSelectedCoverItem(null);
  }, []);

  /** Handle cover selection from the media picker sheet. */
  const handleCoverSelect = useCallback((item: CoverMediaItem) => {
    setSelectedCoverItem(item);
    // Use the full-res URL as the banner — no upload needed for featured/gif items
    setBannerLocalUri(item.url);
    setBannerUpload({ url: item.url, publicId: "" });
    setUploadingBanner(false);
  }, []);

  /** Pre-fill with an existing event cover URL (no upload needed). */
  const prefillCover = useCallback((url: string) => {
    const item: CoverMediaItem = {
      id: "existing-cover",
      type: "image",
      url,
      thumbnailUrl: url,
      source: "upload",
    };
    setSelectedCoverItem(item);
    setBannerLocalUri(url);
    setBannerUpload({ url, publicId: "" });
    setUploadingBanner(false);
  }, []);

  return {
    bannerLocalUri,
    bannerUpload,
    uploadingBanner,
    showCoverPicker,
    setShowCoverPicker,
    selectedCoverItem,
    coverUploads,
    handlePickBanner,
    handleRemoveBanner,
    handleCoverSelect,
    prefillCover,
  };
}
