/**
 * Apple Maps MKLocalSearch — thin JS wrapper over the native iOS module.
 *
 * Returns [] on Android (MKLocalSearch is iOS-only).
 * Free, no API key, uses device location for relevance automatically.
 */

import { NativeModules, Platform } from "react-native";
import type { PlaceSuggestion } from "@/components/create/placeSearch";
import { devLog } from "./devLog";

interface AppleMapsResult {
  name: string;
  address: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  phone?: string;
  url?: string;
}

const AppleMapsSearchBridge = NativeModules.AppleMapsSearchBridge as
  | { search(query: string, lat: number, lon: number): Promise<AppleMapsResult[]> }
  | undefined;

/**
 * Search for places using Apple Maps MKLocalSearch.
 * Returns PlaceSuggestion[] matching the app's place search interface.
 * Returns [] on Android or if the native module is unavailable.
 */
export async function searchAppleMaps(
  query: string,
  lat?: number,
  lon?: number,
): Promise<PlaceSuggestion[]> {
  if (Platform.OS !== "ios" || !AppleMapsSearchBridge) return [];
  if (!query || query.length < 2) return [];

  try {
    const results = await AppleMapsSearchBridge.search(query, lat ?? 0, lon ?? 0);

    if (__DEV__) {
      devLog("[P0_PLACE_SEARCH]", "apple_maps_results", { query, count: results.length });
    }

    return results.map((r) => ({
      id: `apple-${r.latitude}-${r.longitude}`,
      name: r.name,
      address: r.address,
      fullAddress: r.fullAddress || `${r.name}, ${r.address}`,
    }));
  } catch (error: any) {
    if (__DEV__) {
      devLog("[P0_PLACE_SEARCH]", "apple_maps_error", { query, message: error?.message });
    }
    return [];
  }
}
