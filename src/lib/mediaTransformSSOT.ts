/**
 * Media Transform SSOT — Cloudinary render-URL optimisation.
 *
 * Ensures hero/banner images request appropriately-sized derivatives
 * instead of full-resolution originals, reducing memory + decode cost.
 *
 * Rules
 * ─────
 * 1. Only transform URLs containing "res.cloudinary.com" AND "/image/upload/".
 * 2. Insert transform segment immediately after "/upload/".
 * 3. Never double-transform: if a segment after "/upload/" already contains
 *    Cloudinary transform tokens (w_, h_, c_, f_, q_), return unchanged.
 * 4. Non-Cloudinary URLs are returned unchanged.
 *
 * Proof tag: [MEDIA_TRANSFORM_SSOT_V1]
 */

export type CloudinaryTransform = {
  /** Desired pixel width. Omit to leave unconstrained. */
  w?: number;
  /** Desired pixel height. Omit to leave unconstrained. */
  h?: number;
  /** Crop mode. */
  crop?: "fill" | "fit" | "limit";
  /** Compression quality (1-100). Defaults to "auto" when omitted. */
  quality?: number;
  /** Output format. Defaults to "auto" when omitted. */
  format?: "auto" | "jpg" | "png" | "webp";
};

const UPLOAD_MARKER = "/image/upload/";

/** Tokens that indicate an existing Cloudinary transform segment. */
const TRANSFORM_TOKENS = /(?:^|,)(?:w_|h_|c_|f_|q_)/;

/**
 * Transform a Cloudinary URL by injecting width / height / crop / quality /
 * format parameters.  Non-Cloudinary URLs and already-transformed URLs are
 * returned unchanged.
 *
 * @example
 * toCloudinaryTransformedUrl(
 *   "https://res.cloudinary.com/openinvite/image/upload/v177.../path.jpg",
 *   { w: 1200, h: 600, crop: "fill" },
 * )
 * // → ".../image/upload/f_auto,q_auto,w_1200,h_600,c_fill/v177.../path.jpg"
 */
export function toCloudinaryTransformedUrl(
  inputUrl: string,
  t: CloudinaryTransform,
): string {
  // Guard: not a string or not Cloudinary
  if (typeof inputUrl !== "string") return inputUrl;
  if (!inputUrl.includes("res.cloudinary.com") || !inputUrl.includes(UPLOAD_MARKER)) {
    return inputUrl;
  }

  const uploadIdx = inputUrl.indexOf(UPLOAD_MARKER);
  const afterUpload = inputUrl.slice(uploadIdx + UPLOAD_MARKER.length);

  // Guard: already transformed (next path segment contains transform tokens)
  const firstSegment = afterUpload.split("/")[0];
  if (TRANSFORM_TOKENS.test(firstSegment)) {
    return inputUrl;
  }

  // Build transform segment parts
  const parts: string[] = [];

  // Format — always first
  const fmt = t.format ?? "auto";
  parts.push(`f_${fmt}`);

  // Quality
  if (t.quality != null) {
    parts.push(`q_${t.quality}`);
  } else {
    parts.push("q_auto");
  }

  // Dimensions
  if (t.w != null) parts.push(`w_${t.w}`);
  if (t.h != null) parts.push(`h_${t.h}`);

  // Crop
  if (t.crop) {
    const cropMap = { fill: "c_fill", fit: "c_fit", limit: "c_limit" } as const;
    parts.push(cropMap[t.crop]);
  }

  const segment = parts.join(",");

  // Inject segment right after "/upload/"
  const before = inputUrl.slice(0, uploadIdx + UPLOAD_MARKER.length);
  return `${before}${segment}/${afterUpload}`;
}
