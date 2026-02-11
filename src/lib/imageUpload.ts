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
  try {
    const profile = COMPRESSION_PROFILES[kind];
    const entityId = opts?.eventId ?? opts?.circleId ?? null;

    if (__DEV__) {
      devLog('[P0_UPLOAD_KIND]', 'uploadByKind_entry', {
        kind,
        surface: kind,
        hasEntityId: !!entityId,
      });
    }

    // --- A. Compress -------------------------------------------------------
    const origInfo = await FileSystem.getInfoAsync(uri);
    const originalBytes = (origInfo as any).size ?? 0;
    const origExists = (origInfo as any).exists ?? false;

    if (__DEV__) {
      devLog('[P0_UPLOAD_KIND]', 'original_file', { kind, exists: origExists, bytes: originalBytes });
    }

    if (!origExists) {
      throw new Error(`Source image does not exist at URI: ${uri?.slice(0, 80)}`);
    }

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

    if (__DEV__) {
      devLog('[P0_UPLOAD_KIND]', 'compression_result', { kind, originalBytes, finalBytes, qualityUsed: quality });
    }

    if (typeof finalBytes === "number" && finalBytes > MAX_UPLOAD_BYTES) {
      throw new Error(`${kind} photo is too large after compression (max 5 MB).`);
    }

    // --- B. Request signed params from backend -----------------------------
    if (__DEV__) {
      devLog('[P0_UPLOAD_KIND]', 'sign_request', { kind, hasEntityId: !!entityId, endpoint: API_ROUTES.uploads.sign });
    }

    const signBody: Record<string, unknown> = { kind };
    if (opts?.eventId) signBody.eventId = opts.eventId;
    if (opts?.circleId) signBody.circleId = opts.circleId;

    let signed: SignedUploadParams | null = null;
    try {
      signed = await api.post<SignedUploadParams>(
        API_ROUTES.uploads.sign,
        signBody,
      );
    } catch (signErr: any) {
      if (__DEV__) {
        devError('[P0_UPLOAD_KIND]', 'sign_FAILED', {
          kind,
          status: signErr?.status,
          message: signErr?.message,
          data: signErr?.data ? JSON.stringify(signErr.data).slice(0, 200) : 'none',
        });
      }
      throw new Error(`Upload sign failed (${signErr?.status || 'network'}): ${signErr?.message || 'unknown'}`);
    }

    if (__DEV__) {
      devLog('[P0_UPLOAD_SIGN_TARGET]', {
        kind,
        uploadUrl: signed?.uploadUrl?.slice(0, 60),
        cloudName: signed?.cloudName,
        signedKeys: signed?.signedParams ? Object.keys(signed.signedParams) : [],
      });
    }

    if (!signed?.uploadUrl || !signed?.signedParams) {
      throw new Error(`Backend sign response missing required fields (uploadUrl=${!!signed?.uploadUrl}, signedParams=${!!signed?.signedParams}).`);
    }

    if (__DEV__) {
      devLog("[P0_UPLOAD_PROOF]", "sign_response", { kind, hasUploadUrl: !!signed.uploadUrl, uploadUrlPrefix: signed.uploadUrl?.slice(0, 45), signedKeys: Object.keys(signed.signedParams || {}).sort() });
    }

    // --- C. Upload to Cloudinary (signed) ----------------------------------
    const formData = new FormData();
    // CRITICAL: String() every value — JSON.parse may return numbers/booleans
    // which React Native FormData does not reliably coerce on iOS.
    const formFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(signed.signedParams)) {
      const strVal = String(value);
      formData.append(key, strVal);
      formFields[key] = strVal;
    }
    formData.append("file", {
      uri: compressedUri,
      type: "image/jpeg",
      name: profile.filename,
    } as any);

    if (__DEV__) {
      devLog('[P0_UPLOAD_KIND]', 'formData_keys', {
        kind,
        keys: Object.keys(formFields),
        hasSignature: !!formFields.signature,
        hasApiKey: !!formFields.api_key,
      });
    }

    // SSOT: use backend-provided uploadUrl verbatim
    const endpoint = signed.uploadUrl;
    if (__DEV__) {
      devLog("[P0_UPLOAD_PROOF]", "cloudinary_fetch", { kind, endpointPrefix: endpoint?.slice(0, 45), hasEventId: !!entityId && kind==="event_photo", hasCircleId: !!entityId && kind==="circle_photo" });
      devLog('[P0_UPLOAD_CLOUDINARY_POST]', { kind, url: endpoint, hasFile: true, fileName: profile.filename, mimeType: 'image/jpeg' });
    }
    let res: Response;
    try {
      res = await fetch(endpoint, { method: "POST", body: formData });
    } catch (fetchErr: any) {
      if (__DEV__) devError('[P0_UPLOAD_CLOUDINARY_RES]', 'network_FAILED', { kind, error: fetchErr?.message });
      throw new Error(`Cloudinary network error: ${fetchErr?.message || 'fetch failed'}`);
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = null; }

    if (__DEV__) {
      devLog('[P0_UPLOAD_CLOUDINARY_RES]', {
        kind,
        status: res.status,
        ok: res.ok,
        hasSecureUrl: !!json?.secure_url,
        errorSnippet: !res.ok ? (json?.error?.message || text?.slice(0, 120)) : undefined,
      });
    }

    if (!res.ok) {
      const msg =
        (json && (json.error?.message || json.error)) ||
        text?.substring(0, 200) ||
        "Upload failed";
      if (__DEV__) {
        devError('[P0_UPLOAD_CLOUDINARY_RES]', 'upload_FAILED', {
          kind, status: res.status, msg,
          responseBody: text?.slice(0, 500),
        });
      }
      throw new Error(`Cloudinary upload failed (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    }

    const secureUrl = json?.secure_url as string | undefined;
    const publicId = json?.public_id as string | undefined;
    if (!secureUrl || secureUrl.length === 0) {
      if (__DEV__) devError('[P0_UPLOAD_CLOUDINARY_RES]', 'missing_secure_url', { kind }, json);
      throw new Error("Upload succeeded but no URL was returned.");
    }

    // --- D. Notify backend complete ----------------------------------------
    if (__DEV__) {
      devLog('[P0_UPLOAD_KIND]', 'complete_request', { kind, secureUrlPrefix: secureUrl?.slice(0, 50) });
    }

    const completeBody: UploadCompleteBody = {
      kind,
      secureUrl,
      publicId: publicId ?? String(signed.signedParams.public_id ?? ''),
    };
    if (opts?.eventId) completeBody.eventId = opts.eventId;
    if (opts?.circleId) completeBody.circleId = opts.circleId;

    try {
      await api.post(API_ROUTES.uploads.complete, completeBody);
    } catch (completeErr: any) {
      if (__DEV__) {
        devError('[P0_UPLOAD_KIND]', 'complete_FAILED', {
          kind, status: completeErr?.status, message: completeErr?.message,
        });
      }
      throw new Error(`Upload complete failed (${completeErr?.status || 'network'}): ${completeErr?.message || 'unknown'}`);
    }

    if (__DEV__) devLog('[P0_UPLOAD_KIND]', 'pipeline_success', { kind, secureUrlPrefix: secureUrl?.slice(0, 60) });
    return { success: true, url: secureUrl, publicId };
  } catch (error: any) {
    if (__DEV__) devError('[P0_UPLOAD_KIND]', 'pipeline_error', { kind, message: error?.message, status: error?.status });
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
