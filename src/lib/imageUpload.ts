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
import { devError } from "./devLog";
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
  | "event_cover"
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
  cloudName: string;
  /** Full Cloudinary upload URL — use verbatim, never construct from cloudName. */
  uploadUrl: string;
  /**
   * Cloudinary-ready key/value pairs — append verbatim to FormData.
   * Values may arrive as string | number | boolean from JSON.parse;
   * the upload loop coerces every value via String() before appending.
   */
  signedParams: Record<string, string | number | boolean>;
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
  avatar: { maxWidth: 1200, maxHeight: 1200, quality: 0.7, maxBytes: 1_000_000, filename: "upload.jpg" },
  banner: { maxWidth: 1200, maxHeight: 400, quality: 0.75, maxBytes: 1_000_000, filename: "banner_photo.jpg" },
  event_photo: { maxWidth: 1280, maxHeight: 960, quality: 0.75, maxBytes: 1_000_000, filename: "event_photo.jpg" },
  event_cover: { maxWidth: 1280, maxHeight: 960, quality: 0.75, maxBytes: 1_000_000, filename: "event_cover.jpg" },
  circle_photo: { maxWidth: 512, maxHeight: 512, quality: 0.75, maxBytes: 1_000_000, filename: "circle_photo.jpg" },
  event_memory_photo: { maxWidth: 1280, maxHeight: 960, quality: 0.75, maxBytes: 1_000_000, filename: "memory_photo.jpg" },
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
  if (__DEV__) console.log("[ONBOARD_AVATAR] A1. uploadByKind called", { uri: uri?.slice(0, 80), kind });
  try {
    const profile = COMPRESSION_PROFILES[kind];
    const entityId = opts?.eventId ?? opts?.circleId ?? null;

    // --- A. Compress -------------------------------------------------------
    const origInfo = await FileSystem.getInfoAsync(uri);
    const originalBytes = (origInfo as any).size ?? 0;
    const origExists = (origInfo as any).exists ?? false;

    if (__DEV__) console.log("[ONBOARD_AVATAR] A2. file exists check", { exists: origExists, bytes: originalBytes, uriPrefix: uri?.slice(0, 80) });

    if (!origExists) {
      throw new Error(`Source image does not exist at URI: ${uri?.slice(0, 80)}`);
    }

    if (__DEV__) console.log("[ONBOARD_AVATAR] A3. compress start", { maxWidth: profile.maxWidth, maxHeight: profile.maxHeight, quality: profile.quality });
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

    if (__DEV__) console.log("[ONBOARD_AVATAR] A4. compress result", { compressedUri: compressedUri?.slice(0, 80), finalBytes, quality });

    if (typeof finalBytes === "number" && finalBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`${kind} photo is too large after compression (max 5 MB).`);
    }

    // --- B. Request signed params from backend -----------------------------
    // Strict SSOT: only known kinds are valid. entityId only when non-empty string.
    const VALID_UPLOAD_KINDS: readonly UploadKind[] = [
      "avatar",
      "banner",
      "event_photo",
      "event_cover",
      "circle_photo",
      "event_memory_photo",
    ] as const;

    if (!(VALID_UPLOAD_KINDS as readonly string[]).includes(kind)) {
      throw new Error(
        `[imageUpload] invariant: invalid signBody — kind=${String(kind)} eventId=${String(opts?.eventId ?? null)} circleId=${String(opts?.circleId ?? null)}`,
      );
    }

    const signBody: Record<string, string> = { kind };
    const _rawEventId = opts?.eventId;
    const _rawCircleId = opts?.circleId;
    // Only append entity IDs when they are non-empty strings.
    // Explicitly guard against null, undefined, and empty string.
    if (typeof _rawEventId === "string" && _rawEventId.length > 0) {
      signBody.eventId = _rawEventId;
    }
    if (typeof _rawCircleId === "string" && _rawCircleId.length > 0) {
      signBody.circleId = _rawCircleId;
    }

    if (__DEV__) console.log("[ONBOARD_AVATAR] B1. sign request start", { endpoint: API_ROUTES.uploads.sign, signBody });
    let signed: SignedUploadParams | null = null;
    try {
      signed = await api.post<SignedUploadParams>(
        API_ROUTES.uploads.sign,
        signBody,
      );
      if (__DEV__) console.log("[ONBOARD_AVATAR] B2. sign request response", {
        hasUploadUrl: !!signed?.uploadUrl,
        hasSignedParams: !!signed?.signedParams,
        uploadUrl: signed?.uploadUrl?.slice(0, 60),
        paramKeys: signed?.signedParams ? Object.keys(signed.signedParams) : [],
      });
    } catch (signErr: any) {
      if (__DEV__) console.log("[ONBOARD_AVATAR] B3. sign request error", {
        message: signErr?.message,
        name: signErr?.name,
        status: signErr?.status,
        data: signErr?.data ? JSON.stringify(signErr.data).slice(0, 300) : "none",
        isNetworkAuthGated: signErr?.isNetworkAuthGated,
        stack: signErr?.stack?.slice(0, 300),
        raw: JSON.stringify(signErr, Object.getOwnPropertyNames(signErr)).slice(0, 500),
      });
      throw new Error(`Upload sign failed (${signErr?.status || 'network'}): ${signErr?.message || 'unknown'}`);
    }

    if (!signed?.uploadUrl || !signed?.signedParams) {
      throw new Error(`Backend sign response missing required fields (uploadUrl=${!!signed?.uploadUrl}, signedParams=${!!signed?.signedParams}).`);
    }

    // --- C. Upload to Cloudinary (signed) ----------------------------------
    const formData = new FormData();
    // CRITICAL: String() every value — JSON.parse may return numbers/booleans
    // which React Native FormData does not reliably coerce on iOS.
    for (const [key, value] of Object.entries(signed.signedParams)) {
      formData.append(key, String(value));
    }
    formData.append("file", {
      uri: compressedUri,
      type: "image/jpeg",
      name: profile.filename,
    } as any);

    // SSOT: use backend-provided uploadUrl verbatim
    const endpoint = signed.uploadUrl;
    if (__DEV__) console.log("[ONBOARD_AVATAR] C1. cloudinary upload start", { endpoint: endpoint?.slice(0, 60) });
    let res: Response;
    try {
      res = await fetch(endpoint, { method: "POST", body: formData });
    } catch (fetchErr: any) {
      if (__DEV__) console.log("[ONBOARD_AVATAR] C2. cloudinary upload error", {
        message: fetchErr?.message,
        name: fetchErr?.name,
        stack: fetchErr?.stack?.slice(0, 300),
        raw: JSON.stringify(fetchErr, Object.getOwnPropertyNames(fetchErr)).slice(0, 500),
      });
      throw new Error(`Cloudinary network error: ${fetchErr?.message || 'fetch failed'}`);
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }

    if (__DEV__) console.log("[ONBOARD_AVATAR] C3. cloudinary upload response", {
      status: res.status,
      ok: res.ok,
      hasSecureUrl: !!json?.secure_url,
      bodyPreview: text?.slice(0, 200),
    });

    if (!res.ok) {
      const msg =
        (json && (json.error?.message || json.error)) ||
        text?.substring(0, 200) ||
        "Upload failed";
      throw new Error(`Cloudinary upload failed (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }

    const secureUrl = json?.secure_url as string | undefined;
    const publicId = json?.public_id as string | undefined;
    if (!secureUrl || secureUrl.length === 0) {
      throw new Error("Upload succeeded but no URL was returned.");
    }

    // --- D. Notify backend complete ----------------------------------------
    const completeBody: UploadCompleteBody = {
      kind,
      secureUrl,
      publicId: publicId ?? String(signed.signedParams.public_id ?? ''),
    };
    if (opts?.eventId) completeBody.eventId = opts.eventId;
    if (opts?.circleId) completeBody.circleId = opts.circleId;

    if (__DEV__) console.log("[ONBOARD_AVATAR] D1. complete request start", { kind, urlPrefix: secureUrl?.slice(0, 60) });
    try {
      await api.post(API_ROUTES.uploads.complete, completeBody);
      if (__DEV__) console.log("[ONBOARD_AVATAR] D2. complete request response OK");
    } catch (completeErr: any) {
      if (__DEV__) console.log("[ONBOARD_AVATAR] D3. complete request error", {
        message: completeErr?.message,
        name: completeErr?.name,
        status: completeErr?.status,
        data: completeErr?.data ? JSON.stringify(completeErr.data).slice(0, 300) : "none",
        stack: completeErr?.stack?.slice(0, 300),
        raw: JSON.stringify(completeErr, Object.getOwnPropertyNames(completeErr)).slice(0, 500),
      });
      throw new Error(`Upload complete failed (${completeErr?.status || 'network'}): ${completeErr?.message || 'unknown'}`);
    }

    if (__DEV__) console.log("[ONBOARD_AVATAR] D4. uploadByKind SUCCESS", { secureUrl: secureUrl?.slice(0, 60), publicId });
    return { success: true, url: secureUrl, publicId };
  } catch (error: any) {
    if (__DEV__) console.log("[ONBOARD_AVATAR] E1. uploadByKind outer catch", {
      message: error?.message,
      name: error?.name,
      status: error?.status,
      data: error?.data ? JSON.stringify(error.data).slice(0, 300) : "none",
      stack: error?.stack?.slice(0, 300),
      raw: JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 500),
    });
    // Preserve status/data on re-thrown error so callers can inspect HTTP details
    const wrapped: any = new Error(error?.message || "Failed to upload image");
    if (error?.status != null) wrapped.status = error.status;
    if (error?.data != null) wrapped.data = error.data;
    throw wrapped;
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
export async function uploadCirclePhoto(uri: string, circleId?: string): Promise<UploadResponse> {
  return uploadByKind(uri, "circle_photo", circleId ? { circleId } : undefined);
}

/** Event cover photo wrapper. Delegates to uploadByKind("event_photo"). */
export async function uploadEventPhoto(uri: string, eventId?: string): Promise<UploadResponse> {
  return uploadByKind(uri, "event_photo", eventId ? { eventId } : undefined);
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
