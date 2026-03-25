/** Normalized media item shape — shared across Featured, GIFs, and Uploads tabs. */
export interface CoverMediaItem {
  id: string;
  type: "image" | "gif";
  /** Full-resolution URL for the cover. */
  url: string;
  /** Smaller URL for grid thumbnails. */
  thumbnailUrl: string;
  /** Origin of this item. */
  source: "featured" | "gif" | "upload";
  /** Human-readable category (for featured filtering). */
  category?: string;
  /** Searchable tags. */
  tags?: string[];
}

/** Category chip for filtering featured content. */
export interface CoverCategory {
  id: string;
  label: string;
}
