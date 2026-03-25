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
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Search Tenor for GIFs matching a query string. */
export async function searchTenorGifs(query: string): Promise<CoverMediaItem[]> {
  if (!query.trim()) return fetchTenorFeatured();

  try {
    const res = await fetch(buildUrl("search", { q: query.trim() }));
    if (!res.ok) return [];
    const data: TenorSearchResponse = await res.json();
    return data.results
      .map(mapTenorResult)
      .filter((item): item is CoverMediaItem => item !== null);
  } catch {
    return [];
  }
}

/** Fetch Tenor featured/trending GIFs (default state). */
export async function fetchTenorFeatured(): Promise<CoverMediaItem[]> {
  try {
    const res = await fetch(buildUrl("featured", {}));
    if (!res.ok) return [];
    const data: TenorSearchResponse = await res.json();
    return data.results
      .map(mapTenorResult)
      .filter((item): item is CoverMediaItem => item !== null);
  } catch {
    return [];
  }
}
