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

const FALLBACK_GIFS: CoverMediaItem[] = [
  { id: "fb-1", type: "gif", url: "https://media.tenor.com/images/4ee5af5e31adb83e3dbd872044719dc2/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/4ee5af5e31adb83e3dbd872044719dc2/tenor.gif", source: "gif", tags: ["party", "celebration"] },
  { id: "fb-2", type: "gif", url: "https://media.tenor.com/images/54a67457e1c4819f3f0d2aab2afe0834/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/54a67457e1c4819f3f0d2aab2afe0834/tenor.gif", source: "gif", tags: ["confetti", "celebrate"] },
  { id: "fb-3", type: "gif", url: "https://media.tenor.com/images/0e81e061194ed0c4e0e69f76e2427d03/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/0e81e061194ed0c4e0e69f76e2427d03/tenor.gif", source: "gif", tags: ["happy", "dance"] },
  { id: "fb-4", type: "gif", url: "https://media.tenor.com/images/2f3b4bd4e9b8eee29a5f6e8e1eae1e05/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/2f3b4bd4e9b8eee29a5f6e8e1eae1e05/tenor.gif", source: "gif", tags: ["birthday", "cake"] },
  { id: "fb-5", type: "gif", url: "https://media.tenor.com/images/5f2f44b6832e11e7c13a4fc86aef7e72/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/5f2f44b6832e11e7c13a4fc86aef7e72/tenor.gif", source: "gif", tags: ["cheers", "toast"] },
  { id: "fb-6", type: "gif", url: "https://media.tenor.com/images/e4e9e486c520cb3a8c1f3e9f23a4b46c/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/e4e9e486c520cb3a8c1f3e9f23a4b46c/tenor.gif", source: "gif", tags: ["fireworks", "night"] },
  { id: "fb-7", type: "gif", url: "https://media.tenor.com/images/d6cd182ee1e3bca5c1a74e3d8bdb3dff/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/d6cd182ee1e3bca5c1a74e3d8bdb3dff/tenor.gif", source: "gif", tags: ["music", "party"] },
  { id: "fb-8", type: "gif", url: "https://media.tenor.com/images/dd0d8cf63c5f6aecb7b96a74d57a9c58/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/dd0d8cf63c5f6aecb7b96a74d57a9c58/tenor.gif", source: "gif", tags: ["friends", "group"] },
  { id: "fb-9", type: "gif", url: "https://media.tenor.com/images/7b0e1dc27d8bf3b085de74d2f15a6f51/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/7b0e1dc27d8bf3b085de74d2f15a6f51/tenor.gif", source: "gif", tags: ["sparkle", "glitter"] },
  { id: "fb-10", type: "gif", url: "https://media.tenor.com/images/08d4e4f3f28e39321b42eab286c4d75b/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/08d4e4f3f28e39321b42eab286c4d75b/tenor.gif", source: "gif", tags: ["sunset", "nature"] },
  { id: "fb-11", type: "gif", url: "https://media.tenor.com/images/3bf39e1e1f744b5c7ed0e0e2ed16dd5f/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/3bf39e1e1f744b5c7ed0e0e2ed16dd5f/tenor.gif", source: "gif", tags: ["food", "dinner"] },
  { id: "fb-12", type: "gif", url: "https://media.tenor.com/images/5c7c4e01e4e25cb6cf3f69d1aef77eab/tenor.gif", thumbnailUrl: "https://media.tenor.com/images/5c7c4e01e4e25cb6cf3f69d1aef77eab/tenor.gif", source: "gif", tags: ["excited", "happy"] },
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
