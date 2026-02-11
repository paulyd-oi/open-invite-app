import { useEffect, useRef } from "react";
import { Image } from "react-native";
import { devLog } from "@/lib/devLog";
import { toCloudinaryTransformedUrl } from "@/lib/mediaTransformSSOT";

/**
 * Bounded hero/banner batch-prefetch SSOT.
 *
 * Opportunistically prefetches up to `max` hero-banner URIs into the native
 * image cache using `Image.prefetch`.  Each URI is first run through
 * `toCloudinaryTransformedUrl` so the cached derivative matches what
 * `HeroBannerSurface` actually renders (w:1200 h:600 crop:fill).
 *
 * Guarantees
 * ──────────
 * 1. Hard cap:  `uris.slice(0, max)` — never prefetch more than `max` (default 6).
 * 2. Dedup:     `Set` eliminates duplicate URIs within a single batch.
 * 3. Fire-and-forget: uses `Promise.allSettled`, never throws, never blocks.
 * 4. Transform: every URI passes through `toCloudinaryTransformedUrl` so cached
 *    bytes match the render-path (avoids double-download).
 * 5. DEV-only proof log under `[P0_PERF_PRELOAD]` tag (gated by devLog).
 * 6. Signature-stable: re-fires only when the joined key of transformed URIs changes.
 *
 * Proof tag: [P0_PERF_PRELOAD_BOUNDED_HEROES]
 */

/** Hero banner transform params — must match HeroBannerSurface exactly. */
const HERO_TRANSFORM = { w: 1200, h: 600, crop: "fill" as const, format: "auto" as const };

export function usePreloadHeroBanners(opts: {
  uris: (string | null | undefined)[];
  enabled?: boolean;
  max?: number;
}): void {
  const { uris, enabled = true, max = 6 } = opts;

  // Derive deduped + transformed + capped list
  const transformed: string[] = [];
  const seen = new Set<string>();

  for (const raw of uris) {
    if (!raw || typeof raw !== "string" || raw.length === 0) continue;
    const url = toCloudinaryTransformedUrl(raw, HERO_TRANSFORM);
    if (seen.has(url)) continue;
    seen.add(url);
    transformed.push(url);
    if (transformed.length >= max) break; // hard cap
  }

  // Stable signature so effect only re-fires on actual list change
  const signature = transformed.join("|");

  const prevSig = useRef("");

  useEffect(() => {
    if (!enabled || transformed.length === 0) return;
    if (signature === prevSig.current) return; // already prefetched this set
    prevSig.current = signature;

    if (__DEV__) {
      devLog("[P0_PERF_PRELOAD]", {
        tag: "P0_PERF_PRELOAD_BOUNDED_HEROES",
        count: transformed.length,
        max,
        uris: transformed,
      });
    }

    // Fire-and-forget: prefetch all, never throw
    Promise.allSettled(transformed.map((url) => Image.prefetch(url))).catch(
      () => {
        // allSettled never rejects, but belt-and-suspenders
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled]);
}
