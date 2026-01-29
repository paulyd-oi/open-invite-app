/**
 * Image Upload Utility (Cloudinary Direct Upload)
 *
 * Provides functionality for compressing and uploading images directly to Cloudinary,
 * then returning the hosted URL for your backend to store.
 *
 * This module handles:
 * - Image compression using expo-image-manipulator
 * - File size validation (5MB)
 * - Unsigned Cloudinary upload via multipart FormData
 * - Defensive error handling with readable messages
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";

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
 * Cloudinary configuration
 *
 * REQUIRED:
 * - EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME
 * - EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET
 *
 * OPTIONAL:
 * - EXPO_PUBLIC_CLOUDINARY_FOLDER (default: "profile_photos")
 */
const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const CLOUDINARY_FOLDER = process.env.EXPO_PUBLIC_CLOUDINARY_FOLDER || "profile_photos";

function assertCloudinaryConfigured() {
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.length === 0) {
    throw new Error("Cloudinary cloud name not configured (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME).");
  }
  if (!CLOUDINARY_UPLOAD_PRESET || CLOUDINARY_UPLOAD_PRESET.length === 0) {
    throw new Error("Cloudinary upload preset not configured (EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET).");
  }
}

/**
 * Compresses an image to reduce file size
 *
 * @param uri - Local URI of the image to compress
 * @param options - Compression options
 * @returns Compressed image URI
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
      console.error("[imageUpload] Compression error:", error);
    }
    return uri;
  }
}

/**
 * Uploads an image directly to Cloudinary (unsigned preset).
 *
 * @param uri - Local URI of the image to upload
 * @param compress - Whether to compress the image before uploading (default: true)
 * @returns Upload response with the Cloudinary URL
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

    if (__DEV__ && typeof fileSize === "number") {
      const fileSizeKB = (fileSize / 1024).toFixed(2);
      console.log(`[imageUpload] Uploading to Cloudinary: ${fileSizeKB} KB`);
    }

    const formData = new FormData();

    formData.append("file", {
      uri: imageUri,
      type: "image/jpeg",
      name: "upload.jpg",
    } as any);

    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET as string);
    formData.append("folder", CLOUDINARY_FOLDER);

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
        console.error("[imageUpload] Cloudinary upload failed:", res.status, cloudinaryMsg);
        if (json) console.log("[imageUpload] Cloudinary error payload:", json);
      }

      throw new Error(cloudinaryMsg);
    }

    const secureUrl = json?.secure_url as string | undefined;
    const publicId = json?.public_id as string | undefined;

    if (!secureUrl || secureUrl.length === 0) {
      if (__DEV__) {
        console.error("[imageUpload] Cloudinary response missing secure_url:", json);
      }
      throw new Error("Upload succeeded but no URL was returned.");
    }

    if (__DEV__) {
      console.log("[imageUpload] Cloudinary upload successful:", secureUrl);
    }

    return {
      success: true,
      url: secureUrl,
      filename: publicId,
    };
  } catch (error: any) {
    if (__DEV__) {
      console.error("[imageUpload] Upload error:", error);
    }
    throw new Error(error?.message || "Failed to upload image");
  }
}

/**
 * Picks and uploads an image with compression
 * Utility function that combines image picking and uploading
 *
 * @param imagePickerResult - Result from ImagePicker
 * @returns Cloudinary URL of the uploaded image, or null if cancelled
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
