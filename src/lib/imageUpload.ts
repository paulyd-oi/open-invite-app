/**
 * Image Upload Utility (Cloudinary Direct Upload)
 *
 * Single entry-point: `uploadByKind(uri, kind, opts?)`.
 * Legacy wrappers (`uploadImage`, `uploadCirclePhoto`, etc.) delegate here.
 *
 * Folder routing:
 * - Currently uses _LEGACY_FOLDER_BY_KIND (client-side SSOT).
 * - Once backend /api/uploads/sign is deployed the backend will own folder
 *   assignment and _LEGACY_FOLDER_BY_KIND becomes dead code.
 *
 * Compression is kind-aware via COMPRESSION_PROFILES.
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { devLog, devWarn, devError } from "./devLog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * SSOT upload kind — determines compression profile + Cloudinary folder.
 */
export type UploadKind =
  | "avatar"
  | "banner"
  | "event_photo"
  | "circle_photo"
  | "event_memory_photo";

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
}

export interface UploadResponse {
  success: boolean;
  message?: string;
  url: string;
  filename?: string;
  publicId?: string;
  error?: string;
}

/** Options forwarded alongside `kind` for entity-scoped uploads. */
export interface UploadByKindOptions {
  eventId?: string;
  circleId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size: 5 MB */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function assertCloudinaryConfigured() {
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.length === 0) {
    throw new Error(
      "Cloudinary cloud name not configured (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME)."
    );
  }
  if (!CLOUDINARY_UPLOAD_PRESET || CLOUDINARY_UPLOAD_PRESET.length === 0) {
    throw new Error(
      "Cloudinary upload preset not configured (EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET)."
    );
  }
}

// ---------------------------------------------------------------------------
// Compression profiles (SSOT per kind)
// ---------------------------------------------------------------------------

interface CompressionProfile {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  /** If set, iteratively lower quality until file is under this cap. */
  maxBytes?: number;
  /** Filename used in the FormData part. */
  filename: string;
}

const COMPRESSION_PROFILES: Record<UploadKind, CompressionProfile> = {
  avatar: { maxWidth: 1200, maxHeight: 1200, quality: 0.7, filename: "upload.jpg" },
  banner: { maxWidth: 1200, maxHeight: 400, quality: 0.75, maxBytes: 1_500_000, filename: "banner_photo.jpg" },
  event_photo: { maxWidth: 1280, maxHeight: 960, quality: 0.75, maxBytes: 1_500_000, filename: "event_photo.jpg" },
  circle_photo: { maxWidth: 512, maxHeight: 512, quality: 0.75, maxBytes: 1_000_000, filename: "circle_photo.jpg" },
  event_memory_photo: { maxWidth: 1280, maxHeight: 960, quality: 0.75, maxBytes: 1_500_000, filename: "memory_photo.jpg" },
};

// ---------------------------------------------------------------------------
// Folder routing (legacy — backend sign will replace)
// ---------------------------------------------------------------------------

/**
 * Client-side folder map. Once backend `/api/uploads/sign` is live the
 * backend response will supply the folder and this map becomes dead code.
 */
const _LEGACY_FOLDER_BY_KIND: Partial<Record<UploadKind, string>> = {
  circle_photo: "openinvite/circle_photos",
  event_photo: "openinvite/event_photos",
  banner: "openinvite/banner_photos",
  event_memory_photo: "openinvite/event_photos",
  // avatar: undefined → preset default
};

// ---------------------------------------------------------------------------
// Image compression
// ---------------------------------------------------------------------------

export async function compressImage(
  uri: string,
  options: CompressionOptions = {}
): Promise<string> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.7 } = options;

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth, height: maxHeight } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    if (__DEV__) devError("[imageUpload] Compression error:", error);
    return uri;
  }
}

// ---------------------------------------------------------------------------
// Core upload — uploadByKind
// ---------------------------------------------------------------------------

/**
 * Unified upload entry-point. Compresses per `kind`, uploads to Cloudinary.
 *
 * @param uri   Local file:// URI
 * @param kind  Upload kind (determines compression + folder)
 * @param opts  Optional entity IDs (for future backend sign flow)
 */
export async function uploadByKind(
  uri: string,
  kind: UploadKind,
  opts?: UploadByKindOptions,
): Promise<UploadResponse> {
  try {
    assertCloudinaryConfigured();

    const profile = COMPRESSION_PROFILES[kind];

    // --- 1. Compress -------------------------------------------------------
    const origInfo = await FileSystem.getInfoAsync(uri);
    const originalBytes = (origInfo as any).size ?? 0;

    let quality = profile.quality;
    let compressedUri = await compressImage(uri, {
      maxWidth: profile.maxWidth,
      maxHeight: profile.maxHeight,
      quality,
    });

    // Iterative quality reduction if maxBytes cap exists
    if (profile.maxBytes) {
      let info = await FileSystem.getInfoAsync(compressedUri);
      let bytes = (info as any).size ?? 0;
      while (typeof bytes === "number" && bytes >= profile.maxBytes && quality > 0.3) {
        quality -= 0.1;
        compressedUri = await compressImage(uri, {
          maxWidth: profile.maxWidth,
          maxHeight: profile.maxHeight,
          quality,
        });
        info = await FileSystem.getInfoAsync(compressedUri);
        bytes = (info as any).size ?? 0;
      }
    }

    // --- 2. Size guard -----------------------------------------------------
    const finalInfo = await FileSystem.getInfoAsync(compressedUri);
    if (!finalInfo.exists) throw new Error("Image file does not exist");
    const finalBytes = (finalInfo as any).size ?? 0;

    if (typeof finalBytes === "number" && finalBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`${kind} photo is too large after compression (max 5 MB).`);
    }

    // --- 3. Proof log ------------------------------------------------------
    if (__DEV__) {
      devLog("[P0_MEDIA_ROUTE]", {
        action: "upload_start",
        kind,
        entityId: opts?.eventId ?? opts?.circleId ?? null,
        sizeBefore: originalBytes,
        sizeAfter: finalBytes,
        quality,
      });
    }

    // --- 4. Build FormData -------------------------------------------------
    const folder = _LEGACY_FOLDER_BY_KIND[kind]; // undefined for avatar
    const formData = new FormData();
    formData.append("file", {
      uri: compressedUri,
      type: "image/jpeg",
      name: profile.filename,
    } as any);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET as string);
    if (folder) formData.append("folder", folder);

    // --- 5. POST to Cloudinary ---------------------------------------------
    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const res = await fetch(endpoint, { method: "POST", body: formData });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }

    if (!res.ok) {
      const msg =
        (json && (json.error?.message || json.error)) ||
        text?.substring(0, 200) ||
        "Upload failed";
      if (__DEV__) {
        devError("[imageUpload] Cloudinary upload failed:", res.status, msg);
        if (json) devLog("[imageUpload] Cloudinary error payload:", json);
      }
      throw new Error(msg);
    }

    const secureUrl = json?.secure_url as string | undefined;
    const publicId = json?.public_id as string | undefined;
    if (!secureUrl || secureUrl.length === 0) {
      if (__DEV__) devError("[imageUpload] Missing secure_url:", json);
      throw new Error("Upload succeeded but no URL was returned.");
    }

    if (__DEV__) {
      devLog("[P0_MEDIA_ROUTE]", {
        action: "upload_success",
        kind,
        entityId: opts?.eventId ?? opts?.circleId ?? null,
        hasUrl: true,
      });
    }

    return { success: true, url: secureUrl, publicId };
  } catch (error: any) {
    if (__DEV__) devError("[imageUpload] Upload error:", error);
    throw new Error(error?.message || "Failed to upload image");
  }
}

// ---------------------------------------------------------------------------
// Backward-compat wrappers (prefer uploadByKind for new code)
// ---------------------------------------------------------------------------

/** Avatar / generic upload. Delegates to uploadByKind("avatar"). */
export async function uploadImage(
  uri: string,
  compress: boolean = true,
): Promise<UploadResponse> {
  if (!compress) {
    // Rare path: skip compression entirely, direct upload with no folder
    try {
      assertCloudinaryConfigured();
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) throw new Error("Image file does not exist");
      const fileSize = (fileInfo as any).size;
      if (typeof fileSize === "number" && fileSize > MAX_UPLOAD_BYTES) {
        throw new Error("Image is too large (max 5 MB).");
      }
      const formData = new FormData();
      formData.append("file", { uri, type: "image/jpeg", name: "upload.jpg" } as any);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET as string);
      const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { json = null; }
      if (!res.ok) {
        const msg = (json && (json.error?.message || json.error)) || text?.substring(0, 200) || "Upload failed";
        throw new Error(msg);
      }
      const secureUrl = json?.secure_url as string | undefined;
      if (!secureUrl) throw new Error("Upload succeeded but no URL was returned.");
      return { success: true, url: secureUrl, publicId: json?.public_id };
    } catch (error: any) {
      if (__DEV__) devError("[imageUpload] Upload error:", error);
      throw new Error(error?.message || "Failed to upload image");
    }
  }
  return uploadByKind(uri, "avatar");
}

/** Circle photo wrapper. Delegates to uploadByKind("circle_photo"). */
export async function uploadCirclePhoto(uri: string): Promise<UploadResponse> {
  return uploadByKind(uri, "circle_photo");
}

/** Event cover photo wrapper. Delegates to uploadByKind("event_photo"). */
export async function uploadEventPhoto(uri: string): Promise<UploadResponse> {
  return uploadByKind(uri, "event_photo");
}

/** Banner photo wrapper. Delegates to uploadByKind("banner"). */
export async function uploadBannerPhoto(uri: string): Promise<UploadResponse> {
  return uploadByKind(uri, "banner");
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/** Pick → compress → upload helper. */
export async function uploadImageFromPicker(
  imagePickerResult: { canceled: boolean; assets?: Array<{ uri: string }> } | null,
): Promise<string | null> {
  if (!imagePickerResult || imagePickerResult.canceled || !imagePickerResult.assets?.[0]) {
    return null;
  }
  const localUri = imagePickerResult.assets[0].uri;
  const uploadResponse = await uploadImage(localUri, true);
  return uploadResponse.url;
}
