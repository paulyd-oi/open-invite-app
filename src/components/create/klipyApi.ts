/**
 * Klipy GIF Search API — Tenor v2-compatible client-side integration.
 *
 * Klipy is a drop-in replacement for Tenor v2 (same endpoint structure).
 * Returns CoverMediaItem[] for direct use in the cover media picker grid.
 *
 * Docs: https://docs.klipy.com
 * Key management: https://partner.klipy.com/api-keys
 */
import type { CoverMediaItem } from "./coverMedia.types";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

/** Klipy API key (Tenor v2-compatible). Obtain from partner.klipy.com. */
const KLIPY_API_KEY = "Cl5FaE1P5l7YqEjgDHbCPrsDZctuWke0zcEjCGjuQxBYDlOK02Hqtv9LTPqcDx1m";
const KLIPY_BASE = "https://api.klipy.com/v2";
const KLIPY_CLIENT_KEY = "open_invite_app";
const RESULT_LIMIT = 20;

/* ------------------------------------------------------------------ */
/*  Response types (Tenor v2-compatible response subset)               */
/* ------------------------------------------------------------------ */

interface KlipyMediaFormat {
  url: string;
  dims: [number, number];
  size: number;
}

interface KlipyResult {
  id: string;
  title: string;
  media_formats: {
    gif?: KlipyMediaFormat;
    tinygif?: KlipyMediaFormat;
    nanogif?: KlipyMediaFormat;
    mediumgif?: KlipyMediaFormat;
  };
  content_description: string;
  tags: string[];
}

interface KlipySearchResponse {
  results: KlipyResult[];
  next: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapKlipyResult(result: KlipyResult): CoverMediaItem | null {
  const fullUrl =
    result.media_formats.mediumgif?.url ??
    result.media_formats.gif?.url;
  const thumbUrl =
    result.media_formats.tinygif?.url ??
    result.media_formats.nanogif?.url;

  if (!fullUrl || !thumbUrl) return null;

  return {
    id: `klipy-${result.id}`,
    type: "gif",
    url: fullUrl,
    thumbnailUrl: thumbUrl,
    source: "gif",
    tags: result.tags?.slice(0, 5) ?? [],
  };
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(`${KLIPY_BASE}/${endpoint}`);
  url.searchParams.set("key", KLIPY_API_KEY);
  url.searchParams.set("client_key", KLIPY_CLIENT_KEY);
  url.searchParams.set("limit", String(RESULT_LIMIT));
  url.searchParams.set("media_filter", "gif,mediumgif,tinygif,nanogif");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/* ------------------------------------------------------------------ */
/*  Fallback GIFs (used when Klipy API is unavailable)                 */
/* ------------------------------------------------------------------ */

// Verified Giphy CDN URLs — no API key required for direct media access.
const FALLBACK_GIFS: CoverMediaItem[] = [
  { id: "fb-1", type: "gif", url: "https://media.giphy.com/media/26BRBKqUiq586bRVm/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/26BRBKqUiq586bRVm/200w.gif", source: "gif", tags: ["confetti", "celebration"] },
  { id: "fb-2", type: "gif", url: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/200w.gif", source: "gif", tags: ["party", "dance"] },
  { id: "fb-3", type: "gif", url: "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/200w.gif", source: "gif", tags: ["celebrate", "happy"] },
  { id: "fb-4", type: "gif", url: "https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/200w.gif", source: "gif", tags: ["fireworks", "night"] },
  { id: "fb-5", type: "gif", url: "https://media.giphy.com/media/l0HlvtIPdijJCbQnS/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/l0HlvtIPdijJCbQnS/200w.gif", source: "gif", tags: ["dance", "happy"] },
  { id: "fb-6", type: "gif", url: "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/g9582DNuQppxC/200w.gif", source: "gif", tags: ["cheers", "toast"] },
  { id: "fb-7", type: "gif", url: "https://media.giphy.com/media/UDGKJdRBbLmGA/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/UDGKJdRBbLmGA/200w.gif", source: "gif", tags: ["balloons", "party"] },
  { id: "fb-8", type: "gif", url: "https://media.giphy.com/media/WRL7YgP42OKns6FMsY/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/WRL7YgP42OKns6FMsY/200w.gif", source: "gif", tags: ["birthday", "cake"] },
  { id: "fb-9", type: "gif", url: "https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/200w.gif", source: "gif", tags: ["sparkle", "glitter"] },
  { id: "fb-10", type: "gif", url: "https://media.giphy.com/media/l4FGni1RBAR2OWsGk/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/l4FGni1RBAR2OWsGk/200w.gif", source: "gif", tags: ["champagne", "toast"] },
  { id: "fb-11", type: "gif", url: "https://media.giphy.com/media/l46CsyBPj9ajF9Y4M/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/l46CsyBPj9ajF9Y4M/200w.gif", source: "gif", tags: ["disco", "music"] },
  { id: "fb-12", type: "gif", url: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", thumbnailUrl: "https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif", source: "gif", tags: ["excited", "happy"] },
];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Search Klipy for GIFs matching a query string. Falls back to curated set on error. */
export async function searchGifs(query: string): Promise<CoverMediaItem[]> {
  if (!query.trim()) return fetchFeaturedGifs();

  try {
    const res = await fetch(buildUrl("search", { q: query.trim() }));
    if (!res.ok) return FALLBACK_GIFS;
    const data: KlipySearchResponse = await res.json();
    const results = data.results
      .map(mapKlipyResult)
      .filter((item): item is CoverMediaItem => item !== null);
    return results.length > 0 ? results : FALLBACK_GIFS;
  } catch {
    return FALLBACK_GIFS;
  }
}

/** Fetch Klipy featured/trending GIFs (default state). Falls back to curated set on error. */
export async function fetchFeaturedGifs(): Promise<CoverMediaItem[]> {
  try {
    const res = await fetch(buildUrl("featured", {}));
    if (!res.ok) return FALLBACK_GIFS;
    const data: KlipySearchResponse = await res.json();
    const results = data.results
      .map(mapKlipyResult)
      .filter((item): item is CoverMediaItem => item !== null);
    return results.length > 0 ? results : FALLBACK_GIFS;
  } catch {
    return FALLBACK_GIFS;
  }
}
