import { useState, useCallback, useEffect } from "react";
import { devLog, devError } from "@/lib/devLog";
import { searchPlaces, buildCleanLocation, type PlaceSuggestion } from "@/components/create/placeSearch";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

export function useLocationSearch() {
  const [locationPermissionAsked, setLocationPermissionAsked] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  // Request and fetch user location for location-biased place search
  const requestAndFetchLocation = useCallback(async () => {
    if (userLocation) return; // Already have location

    try {
      // First check current permission status
      let { status } = await Location.getForegroundPermissionsAsync();

      // If not determined yet, request permission
      if (status !== "granted") {
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
        setLocationPermissionAsked(true);
        devLog("[create.tsx] Location permission result:", status);
      }

      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
        });
        devLog("[create.tsx] Got user location for search biasing");
      }
    } catch (error) {
      // Silently fail - location biasing is optional
      devLog("[create.tsx] Could not get user location for search biasing:", error);
    }
  }, [userLocation]);

  // Try to fetch location on mount (if already granted)
  useEffect(() => {
    const fetchUserLocation = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation({
            lat: loc.coords.latitude,
            lon: loc.coords.longitude,
          });
        }
      } catch (error) {
        // Silently fail - location biasing is optional
        devLog("[create.tsx] Could not get user location for search biasing");
      }
    };
    fetchUserLocation();
  }, []);

  // [P0_PLACE_SEARCH] Debounced place search with location biasing + stale-response prevention
  useEffect(() => {
    if (!locationQuery || locationQuery.length < 2) {
      setPlaceSuggestions([]);
      return;
    }

    // Request location permission on first search if not already asked
    if (!userLocation && !locationPermissionAsked) {
      requestAndFetchLocation();
    }

    // AbortController cancels in-flight requests when query changes (prevents stale overwrites)
    const abortController = new AbortController();
    let cancelled = false;

    // Adaptive debounce: wait longer when location isn't available yet so GPS has time to resolve
    const debounceMs = userLocation ? 300 : 800;

    const timeoutId = setTimeout(async () => {
      setIsSearchingPlaces(true);
      try {
        const results = await searchPlaces(
          locationQuery,
          userLocation?.lat,
          userLocation?.lon,
          abortController.signal,
        );
        // [P0_PLACE_SEARCH] Guard: only apply results if this effect instance is still current
        if (!cancelled) {
          setPlaceSuggestions(results);
          if (__DEV__) devLog("[P0_PLACE_SEARCH]", "applied", { query: locationQuery, count: results.length });
        } else if (__DEV__) {
          devLog("[P0_PLACE_SEARCH]", "stale_discarded", { query: locationQuery, count: results.length });
        }
      } catch (error: any) {
        // Ignore abort errors (expected when query changes rapidly)
        if (error?.name !== "AbortError" && !cancelled) {
          devError("[P0_PLACE_SEARCH] error:", error);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingPlaces(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
      cancelled = true;
      abortController.abort(); // Cancel any in-flight HTTP request
    };
  }, [locationQuery, userLocation, locationPermissionAsked, requestAndFetchLocation]);

  const handleSelectPlace = useCallback((place: PlaceSuggestion) => {
    Haptics.selectionAsync();
    setSelectedPlace(place);
    setLocation(buildCleanLocation(place));
    setLocationQuery("");
    setShowLocationSearch(false);
    setPlaceSuggestions([]);
  }, []);

  const handleLocationInputChange = useCallback((text: string) => {
    setLocationQuery(text);
    setLocation(text);
    setSelectedPlace(null);
    if (text.length >= 2) {
      setShowLocationSearch(true);
    }
  }, []);

  const handleLocationFocus = useCallback(() => {
    setShowLocationSearch(true);
    setLocationQuery(location);
    // Eagerly request location on focus so coordinates are ready by the time the user types
    if (!userLocation && !locationPermissionAsked) {
      requestAndFetchLocation();
    }
  }, [location, userLocation, locationPermissionAsked, requestAndFetchLocation]);

  const handleClearPlace = useCallback(() => {
    setSelectedPlace(null);
    setLocation("");
    setLocationQuery("");
  }, []);

  const handleCloseSearch = useCallback(() => {
    setShowLocationSearch(false);
    if (!selectedPlace) {
      setLocation(locationQuery);
    }
  }, [selectedPlace, locationQuery]);

  const handleOpenSearch = useCallback(() => {
    setShowLocationSearch(true);
    setLocationQuery(location);
  }, [location]);

  const prefillLocation = useCallback((loc: string) => {
    setLocation(loc);
    setLocationQuery(loc);
  }, []);

  return {
    location,
    setLocation,
    locationQuery,
    selectedPlace,
    showLocationSearch,
    placeSuggestions,
    isSearchingPlaces,
    userLocation,
    locationPermissionAsked,
    handleSelectPlace,
    handleLocationInputChange,
    handleLocationFocus,
    handleClearPlace,
    handleCloseSearch,
    handleOpenSearch,
    prefillLocation,
  };
}
