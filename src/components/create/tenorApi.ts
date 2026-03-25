/**
 * Tenor GIF Search API v2 — client-side integration for V1.
 *
 * Free tier, no backend proxy needed. Returns CoverMediaItem[] for
 * direct use in the cover media picker grid.
 *
 * Docs: https://developers.google.com/tenor/guides/quickstart
 */
import type { CoverMediaItem } from "./coverMedia.types";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

/** Tenor API v2 key (free tier, client-side OK for dev). */
const TENOR_API_KEY = "AIzaSyBqRNueRYdE7KMqPKR0cfw1JJ4MRAT3xS8";
const TENOR_BASE = "https://tenor.googleapis.com/v2";
const TENOR_CLIENT_KEY = "open_invite_app";
const RESULT_LIMIT = 20;

/* ------------------------------------------------------------------ */
/*  Response types (subset of Tenor v2 response)                       */
/* ------------------------------------------------------------------ */

interface TenorMediaFormat {
  url: string;
  dims: [number, number];
  size: number;
}

interface TenorResult {
  id: string;
  title: string;
  media_formats: {
    gif?: TenorMediaFormat;
    tinygif?: TenorMediaFormat;
    nanogif?: TenorMediaFormat;
    mediumgif?: TenorMediaFormat;
  };
  content_description: string;
  tags: string[];
}

interface TenorSearchResponse {
  results: TenorResult[];
  next: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapTenorResult(result: TenorResult): CoverMediaItem | null {
  const fullUrl =
    result.media_formats.mediumgif?.url ??
    result.media_formats.gif?.url;
  const thumbUrl =
    result.media_formats.tinygif?.url ??
    result.media_formats.nanogif?.url;

  if (!fullUrl || !thumbUrl) return null;

  return {
    id: `tenor-${result.id}`,
    type: "gif",
    url: fullUrl,
    thumbnailUrl: thumbUrl,
    source: "gif",
    tags: result.tags?.slice(0, 5) ?? [],
  };
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(`${TENOR_BASE}/${endpoint}`);
  url.searchParams.set("key", TENOR_API_KEY);
  url.searchParams.set("client_key", TENOR_CLIENT_KEY);
  url.searchParams.set("limit", String(RESULT_LIMIT));
  // Request only the formats we use to reduce payload size
  url.searchParams.set("media_filter", "gif,mediumgif,tinygif,nanogif");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/* ------------------------------------------------------------------ */
/*  Fallback GIFs (used when Tenor API is unavailable)                 */
/* ------------------------------------------------------------------ */

// Verified Giphy CDN URLs — no API key required for direct media access.
// Full: /giphy.gif, Thumbnail: /200w.gif
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

/** Search Tenor for GIFs matching a query string. Falls back to curated set on error. */
export async function searchTenorGifs(query: string): Promise<CoverMediaItem[]> {
  if (!query.trim()) return fetchTenorFeatured();

  try {
    const res = await fetch(buildUrl("search", { q: query.trim() }));
    if (!res.ok) return FALLBACK_GIFS;
    const data: TenorSearchResponse = await res.json();
    const results = data.results
      .map(mapTenorResult)
      .filter((item): item is CoverMediaItem => item !== null);
    return results.length > 0 ? results : FALLBACK_GIFS;
  } catch {
    return FALLBACK_GIFS;
  }
}

/** Fetch Tenor featured/trending GIFs (default state). Falls back to curated set on error. */
export async function fetchTenorFeatured(): Promise<CoverMediaItem[]> {
  try {
    const res = await fetch(buildUrl("featured", {}));
    if (!res.ok) return FALLBACK_GIFS;
    const data: TenorSearchResponse = await res.json();
    const results = data.results
      .map(mapTenorResult)
      .filter((item): item is CoverMediaItem => item !== null);
    return results.length > 0 ? results : FALLBACK_GIFS;
  } catch {
    return FALLBACK_GIFS;
  }
}
