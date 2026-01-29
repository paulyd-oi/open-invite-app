/**
 * Image Upload Utility
 *
 * Provides functionality for compressing and uploading images to the backend.
 * This module handles:
 * - Image compression using expo-image-manipulator
 * - FormData-based file uploads
 * - Error handling and progress tracking
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { fetch } from "expo/fetch";
import { authClient } from "./authClient";

// Backend URL configuration - fallback to Render production URL for TestFlight
// Check for truthy value (not just undefined) to handle empty string case
const RENDER_BACKEND_URL = "https://open-invite-api.onrender.com";
const vibecodeSandboxUrl = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
const BACKEND_URL = vibecodeSandboxUrl && vibecodeSandboxUrl.length > 0
  ? vibecodeSandboxUrl
  : RENDER_BACKEND_URL;

if (__DEV__) {
  console.log("[imageUpload] Using backend URL:", BACKEND_URL);
}

// Maximum file size: 5MB (matches backend limit)
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Image compression options
 */
interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
}

/**
 * Upload response from the backend
 */
interface UploadResponse {
  success: boolean;
  message?: string;
  url: string;
  filename?: string;
  error?: string;
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
    // Resize and compress the image
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
    // Return original if compression fails
    return uri;
  }
}

/**
 * Uploads an image to the backend server
 *
 * @param uri - Local URI of the image to upload
 * @param compress - Whether to compress the image before uploading (default: true)
 * @returns Upload response with the server URL
 */
export async function uploadImage(
  uri: string,
  compress: boolean = true
): Promise<UploadResponse> {
  if (!BACKEND_URL) {
    throw new Error("Backend URL not configured");
  }

  try {
    // Compress the image if requested
    const imageUri = compress ? await compressImage(uri) : uri;

    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      throw new Error("Image file does not exist");
    }

    // Validate file size (must be under 5MB)
    // Treat size as optional - if undefined, allow upload and let backend enforce limit
    const fileSize = (fileInfo as any).size;
    if (typeof fileSize === "number" && fileSize > MAX_UPLOAD_BYTES) {
      throw new Error("Image is too large (max 5MB). Please choose a smaller photo.");
    }

    // Log file size for debugging (only if size is known)
    if (__DEV__ && typeof fileSize === "number") {
      const fileSizeKB = (fileSize / 1024).toFixed(2);
      console.log(`[imageUpload] Uploading image: ${fileSizeKB} KB`);
    }

    // Get session cookie for authentication (Better Auth cookie-based auth)
    const { getSessionCookie } = await import("./sessionCookie");
    const sessionCookie = await getSessionCookie();

    // Create form data using fetch-blob approach compatible with React Native
    // We need to use FileSystem.uploadAsync for proper multipart/form-data support
    const uploadResult = await FileSystem.uploadAsync(
      `${BACKEND_URL}/api/upload/image`,
      imageUri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "image",
        headers: sessionCookie ? { cookie: sessionCookie } : {},
      }
    );

    if (uploadResult.status !== 200) {
      // Try to parse error, but handle non-JSON gracefully
      let errorMsg = "Upload failed";
      try {
        const errorData = JSON.parse(uploadResult.body || "{}");
        errorMsg = errorData.error || errorMsg;
      } catch {
        if (__DEV__) {
          console.log("[imageUpload] Non-JSON error response:", uploadResult.body?.substring(0, 200));
        }
      }
      
      // Add more specific error context for auth issues
      if (uploadResult.status === 401 || uploadResult.status === 403) {
        if (__DEV__) {
          console.error("[imageUpload] Auth error:", uploadResult.status, sessionCookie ? "Cookie present" : "No cookie");
        }
        throw new Error("Session expired. Please log in again.");
      }
      
      throw new Error(errorMsg);
    }

    // Parse response with defensive error handling
    let responseData: UploadResponse;
    try {
      responseData = JSON.parse(uploadResult.body) as UploadResponse;
    } catch (parseError) {
      if (__DEV__) {
        console.log("[imageUpload] JSON parse error, response body:", uploadResult.body?.substring(0, 500));
      }
      throw new Error("Invalid response from server");
    }

    // Convert relative URL to absolute URL
    if (responseData.url && !responseData.url.startsWith("http")) {
      responseData.url = `${BACKEND_URL}${responseData.url}`;
    }

    if (__DEV__) {
      console.log(`[imageUpload] Upload successful: ${responseData.url}`);
    }
    return responseData;
  } catch (error: any) {
    if (__DEV__) {
      console.error("[imageUpload] Upload error:", error);
    }
    throw new Error(error.message || "Failed to upload image");
  }
}

/**
 * Picks and uploads an image with compression
 * Utility function that combines image picking and uploading
 *
 * @param imagePickerResult - Result from ImagePicker
 * @returns Server URL of the uploaded image, or null if cancelled
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
