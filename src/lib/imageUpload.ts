/**
 * Image Upload Utility (Backend-Signed Cloudinary Upload)
 *
 * Single entry-point: `uploadByKind(uri, kind, opts?)`.
 * Legacy wrappers (`uploadImage`, `uploadCirclePhoto`, etc.) delegate here.
 *
 * Upload flow (SSOT):
 *   1. Compress locally per COMPRESSION_PROFILES[kind]
 *   2. POST /api/uploads/sign  → backend returns signed params + folder + publicId
 *   3. POST to Cloudinary with signed params (NO unsigned preset, NO client folder)
 *   4. POST /api/uploads/complete → backend confirms + stores URL
 *
 * The frontend NEVER decides Cloudinary folder or public_id.
 * The backend owns folder assignment, overwrite, and invalidation semantics.
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { devLog, devWarn, devError } from "./devLog";
import { api } from "./api";
import { API_ROUTES } from "./apiRoutes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * SSOT upload kind — determines compression profile.
 * Backend uses this to decide folder + public_id + overwrite semantics.
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

/** Shape returned by POST /api/uploads/sign. */
interface SignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  folder: string;
  publicId: string;
  overwrite: boolean;
  invalidate: boolean;
  cloudName: string;
}

/** Shape sent to POST /api/uploads/complete. */
interface UploadCompleteBody {
  kind: UploadKind;
  secureUrl: string;
  publicId: string;
  eventId?: string;
  circleId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum file size: 5 MB */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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
// Core upload — uploadByKind (backend-signed SSOT)
// ---------------------------------------------------------------------------

/**
 * Unified upload entry-point.
 *
 * Flow:
 *   A. Compress per COMPRESSION_PROFILES[kind]
 *   B. POST /api/uploads/sign → signed params
 *   C. POST to Cloudinary with signed params
 *   D. POST /api/uploads/complete → backend stores URL
 *
 * @param uri   Local file:// URI
 * @param kind  Upload kind (determines compression; backend decides folder)
 * @param opts  Optional entity IDs forwarded to backend sign + complete
 */
export async function uploadByKind(
  uri: string,
  kind: UploadKind,
  opts?: UploadByKindOptions,
): Promise<UploadResponse> {
  try {
    const profile = COMPRESSION_PROFILES[kind];
    const entityId = opts?.eventId ?? opts?.circleId ?? null;

    // --- A. Compress -------------------------------------------------------
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

    // Size guard
    const finalInfo = await FileSystem.getInfoAsync(compressedUri);
    if (!finalInfo.exists) throw new Error("Image file does not exist");
    const finalBytes = (finalInfo as any).size ?? 0;

    if (typeof finalBytes === "number" && finalBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`${kind} photo is too large after compression (max 5 MB).`);
    }

    // --- B. Request signed params from backend -----------------------------
    if (__DEV__) {
      devLog("[P0_MEDIA_ROUTE]", {
        action: "sign_request",
        kind,
        entityId,
      });
    }

    const signBody: Record<string, unknown> = { kind };
    if (opts?.eventId) signBody.eventId = opts.eventId;
    if (opts?.circleId) signBody.circleId = opts.circleId;

    const signed = await api.post<SignedUploadParams>(
      API_ROUTES.uploads.sign,
      signBody,
    );

    if (!signed?.cloudName || !signed?.signature || !signed?.apiKey) {
      throw new Error("Backend sign response missing required fields.");
    }

    // --- C. Upload to Cloudinary (signed) ----------------------------------
    const formData = new FormData();
    formData.append("file", {
      uri: compressedUri,
      type: "image/jpeg",
      name: profile.filename,
    } as any);
    formData.append("api_key", signed.apiKey);
    formData.append("timestamp", String(signed.timestamp));
    formData.append("signature", signed.signature);
    formData.append("folder", signed.folder);
    formData.append("public_id", signed.publicId);
    if (signed.overwrite) formData.append("overwrite", "true");
    if (signed.invalidate) formData.append("invalidate", "true");

    if (__DEV__) {
      devLog("[P0_MEDIA_ROUTE]", {
        action: "upload_cloudinary",
        kind,
        publicId: signed.publicId,
      });
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`;
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

    // --- D. Notify backend complete ----------------------------------------
    if (__DEV__) {
      devLog("[P0_MEDIA_ROUTE]", {
        action: "complete_request",
        kind,
      });
    }

    const completeBody: UploadCompleteBody = {
      kind,
      secureUrl,
      publicId: publicId ?? signed.publicId,
    };
    if (opts?.eventId) completeBody.eventId = opts.eventId;
    if (opts?.circleId) completeBody.circleId = opts.circleId;

    await api.post(API_ROUTES.uploads.complete, completeBody);

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
  _compress: boolean = true,
): Promise<UploadResponse> {
  // compress param is now a no-op; uploadByKind always compresses per profile.
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
