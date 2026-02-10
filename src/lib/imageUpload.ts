/**
 * Image Upload Utility (Cloudinary Direct Upload)
 *
 * Compresses and uploads images directly to Cloudinary, returning a hosted URL
 * for your backend to store.
 *
 * Canonical rules:
 * - Folder is enforced by the Cloudinary Upload Preset (DO NOT send `folder` from client)
 * - Uses UNSIGNED upload preset
 * - 5MB max client-side guard
 * - Defensive parsing + readable errors
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { devLog, devWarn, devError } from "./devLog";

/**
 * Image compression options
 */
interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
}

/**
 * Upload response shape for callers
 */
export interface UploadResponse {
  success: boolean;
  message?: string;
  url: string;
  filename?: string;
  error?: string;
}

/**
 * Maximum file size: 5MB
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Cloudinary configuration (client-safe)
 *
 * REQUIRED:
 * - EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME
 * - EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET
 *
 * NOTE:
 * Folder MUST be configured in the Cloudinary upload preset.
 * Do NOT use EXPO_PUBLIC_CLOUDINARY_FOLDER and do NOT send `folder` from the client.
 */
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

/**
 * Compresses an image to reduce file size
 */
export async function compressImage(
  uri: string,
  options: CompressionOptions = {}
): Promise<string> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.7 } = options;

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          resize: {
            width: maxWidth,
            height: maxHeight,
          },
        },
      ],
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return result.uri;
  } catch (error) {
    if (__DEV__) {
      devError("[imageUpload] Compression error:", error);
    }
    return uri;
  }
}

/**
 * Uploads an image directly to Cloudinary (unsigned preset).
 *
 * IMPORTANT:
 * - Do NOT include `folder` in the request. Folder is set in the preset.
 */
export async function uploadImage(
  uri: string,
  compress: boolean = true
): Promise<UploadResponse> {
  try {
    assertCloudinaryConfigured();

    const imageUri = compress ? await compressImage(uri) : uri;

    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      throw new Error("Image file does not exist");
    }

    const fileSize = (fileInfo as any).size;
    if (typeof fileSize === "number" && fileSize > MAX_UPLOAD_BYTES) {
      throw new Error("Image is too large (max 5MB). Please choose a smaller photo.");
    }

    if (__DEV__) {
      const fileSizeKB =
        typeof fileSize === "number" ? (fileSize / 1024).toFixed(2) : "unknown";
      devLog(`[imageUpload] Uploading to Cloudinary: ${fileSizeKB} KB`);
      devLog("[imageUpload] Cloud:", CLOUDINARY_CLOUD_NAME);
      devLog("[imageUpload] Preset:", CLOUDINARY_UPLOAD_PRESET);
    }

    const formData = new FormData();

    formData.append("file", {
      uri: imageUri,
      type: "image/jpeg",
      name: "upload.jpg",
    } as any);

    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET as string);

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const text = await res.text();

    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) {
      const cloudinaryMsg =
        (json && (json.error?.message || json.error)) ||
        text?.substring(0, 200) ||
        "Upload failed";

      if (__DEV__) {
        devError("[imageUpload] Cloudinary upload failed:", res.status, cloudinaryMsg);
        if (json) devLog("[imageUpload] Cloudinary error payload:", json);
      }

      throw new Error(cloudinaryMsg);
    }

    const secureUrl = json?.secure_url as string | undefined;
    const publicId = json?.public_id as string | undefined;

    if (!secureUrl || secureUrl.length === 0) {
      if (__DEV__) {
        devError("[imageUpload] Cloudinary response missing secure_url:", json);
      }
      throw new Error("Upload succeeded but no URL was returned.");
    }

    if (__DEV__) {
      devLog("[imageUpload] Cloudinary upload successful:", secureUrl);
    }

    return {
      success: true,
      url: secureUrl,
      filename: publicId,
    };
  } catch (error: any) {
    if (__DEV__) {
      devError("[imageUpload] Upload error:", error);
    }
    throw new Error(error?.message || "Failed to upload image");
  }
}

/**
 * SSOT Cloudinary folder for circle photos
 */
const CIRCLE_PHOTO_FOLDER = "openinvite/circle_photos";

/**
 * Uploads a circle photo with aggressive compression (512x512, JPEG 0.75).
 * Hard cap: final file must be < 1.0 MB.
 */
export async function uploadCirclePhoto(uri: string): Promise<UploadResponse> {
  try {
    assertCloudinaryConfigured();

    // Get original size for DEV proof
    const origInfo = await FileSystem.getInfoAsync(uri);
    const originalBytes = (origInfo as any).size ?? 0;

    // Step 1: compress to 512x512 JPEG q=0.75
    let quality = 0.75;
    let compressedUri = await compressImage(uri, { maxWidth: 512, maxHeight: 512, quality });
    let fileInfo = await FileSystem.getInfoAsync(compressedUri);
    let finalBytes = (fileInfo as any).size ?? 0;

    // Step 2: If still >= 1MB, recompress more aggressively
    while (typeof finalBytes === "number" && finalBytes >= 1_000_000 && quality > 0.3) {
      quality -= 0.1;
      compressedUri = await compressImage(uri, { maxWidth: 512, maxHeight: 512, quality });
      fileInfo = await FileSystem.getInfoAsync(compressedUri);
      finalBytes = (fileInfo as any).size ?? 0;
    }

    if (__DEV__) {
      devLog("[CIRCLE_PHOTO_COMPRESS]", {
        originalBytes,
        finalBytes,
        width: 512,
        height: 512,
        quality,
      });
    }

    if (typeof finalBytes === "number" && finalBytes > MAX_UPLOAD_BYTES) {
      throw new Error("Circle photo is too large after compression.");
    }

    // Upload to Cloudinary with folder override
    const formData = new FormData();
    formData.append("file", {
      uri: compressedUri,
      type: "image/jpeg",
      name: "circle_photo.jpg",
    } as any);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET as string);
    formData.append("folder", CIRCLE_PHOTO_FOLDER);

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
    const res = await fetch(endpoint, { method: "POST", body: formData });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }

    if (!res.ok) {
      const msg = (json && (json.error?.message || json.error)) || text?.substring(0, 200) || "Upload failed";
      if (__DEV__) devError("[imageUpload] Circle photo upload failed:", res.status, msg);
      throw new Error(msg);
    }

    const secureUrl = json?.secure_url as string | undefined;
    if (!secureUrl) throw new Error("Upload succeeded but no URL was returned.");
    if (__DEV__) devLog("[imageUpload] Circle photo uploaded:", secureUrl);

    return { success: true, url: secureUrl, filename: json?.public_id };
  } catch (error: any) {
    if (__DEV__) devError("[imageUpload] Circle photo upload error:", error);
    throw new Error(error?.message || "Failed to upload circle photo");
  }
}

/**
 * Picks and uploads an image with compression
 */
export async function uploadImageFromPicker(
  imagePickerResult: { canceled: boolean; assets?: Array<{ uri: string }> } | null
): Promise<string | null> {
  if (!imagePickerResult || imagePickerResult.canceled || !imagePickerResult.assets?.[0]) {
    return null;
  }

  const localUri = imagePickerResult.assets[0].uri;
  const uploadResponse = await uploadImage(localUri, true);
  return uploadResponse.url;
}
