import React, { useState, useEffect } from "react";
import { View, Text, Image, ActivityIndicator, Platform } from "react-native";
import { MapPin } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";

interface MapPreviewProps {
  location: string;
  height?: number;
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

// Get Google API key from environment
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ||
                       process.env.EXPO_PUBLIC_VIBECODE_GOOGLE_API_KEY || "";

// Simple geocoding using Nominatim (OpenStreetMap) - free, no API key needed
async function geocodeAddress(address: string): Promise<Coordinates | null> {
  try {
    const encodedAddress = encodeURIComponent(address);

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
      {
        headers: {
          "User-Agent": "OpenInviteApp/1.0",
          "Accept": "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (__DEV__) console.log("Geocoding response not OK:", response.status);
      return null;
    }

    const data = await response.json();
    if (__DEV__) {
      console.log("Geocoding result for:", address, "->", data?.length > 0 ? `${data[0].lat}, ${data[0].lon}` : "not found");
    }

    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (__DEV__) {
      console.log("Geocoding error:", errorMessage);
    }
    return null;
  }
}

// Generate Google Maps Static API URL (best quality, requires API key)
function getGoogleStaticMapUrl(
  lat: number,
  lng: number,
  width: number = 400,
  height: number = 200,
  apiKey: string
): string {
  const zoom = 15;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=roadmap&markers=color:0x4ECDC4%7C${lat},${lng}&key=${apiKey}`;
}

// Alternative: OpenStreetMap static map using MapTiler (has free tier without key for low usage)
// Or use a simple embedded approach with OpenStreetMap tiles
function getOSMStaticMapUrl(
  lat: number,
  lng: number,
  width: number = 400,
  height: number = 200
): string {
  const zoom = 15;
  // Using OpenStreetMap's static map service via StaticMapMaker
  // This is a reliable free service that generates static maps
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik&markers=${lat},${lng},lightblue`;
}

// Fallback: Simple tile-based URL from OpenStreetMap
function getOSMTileUrl(
  lat: number,
  lng: number,
  zoom: number = 15
): string {
  // Convert lat/lng to tile coordinates
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lng + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);

  // Return a single tile (256x256)
  return `https://tile.openstreetmap.org/${zoom}/${xtile}/${ytile}.png`;
}

export function MapPreview({ location, height = 128 }: MapPreviewProps) {
  const { colors, isDark } = useTheme();
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchCoordinates() {
      setIsLoading(true);
      setImageError(false);
      setUseFallback(false);

      if (__DEV__) console.log("MapPreview: Geocoding location:", location);
      const coords = await geocodeAddress(location);

      if (mounted) {
        if (__DEV__) {
          if (coords) {
            console.log("MapPreview: Found coordinates:", coords.latitude, coords.longitude);
          } else {
            console.log("MapPreview: Could not geocode location");
          }
        }
        setCoordinates(coords);
        setIsLoading(false);
      }
    }

    fetchCoordinates();

    return () => {
      mounted = false;
    };
  }, [location]);

  // Show loading state
  if (isLoading) {
    return (
      <View
        className="rounded-xl items-center justify-center overflow-hidden"
        style={{
          height,
          backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
        }}
      >
        <ActivityIndicator size="small" color="#4ECDC4" />
        <Text className="text-xs mt-2" style={{ color: colors.textSecondary }}>
          Loading map...
        </Text>
      </View>
    );
  }

  // Show fallback if geocoding failed or both image sources failed
  if (!coordinates || (imageError && useFallback)) {
    return (
      <View
        className="rounded-xl items-center justify-center overflow-hidden"
        style={{
          height,
          backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB",
        }}
      >
        <MapPin size={32} color="#4ECDC4" />
        <Text
          className="text-sm mt-2 text-center px-4"
          style={{ color: colors.textSecondary }}
          numberOfLines={2}
        >
          {location}
        </Text>
      </View>
    );
  }

  // Determine which map service to use
  let mapUrl: string;

  if (GOOGLE_API_KEY && !useFallback) {
    // Use Google Maps Static API if we have an API key
    mapUrl = getGoogleStaticMapUrl(
      coordinates.latitude,
      coordinates.longitude,
      400,
      Math.round(height * 2),
      GOOGLE_API_KEY
    );
    if (__DEV__) console.log("MapPreview: Using Google Maps Static API");
  } else {
    // Fallback to OpenStreetMap static map
    mapUrl = getOSMStaticMapUrl(
      coordinates.latitude,
      coordinates.longitude,
      400,
      Math.round(height * 2)
    );
    if (__DEV__) console.log("MapPreview: Using OpenStreetMap static map");
  }

  return (
    <View className="rounded-xl overflow-hidden" style={{ height }}>
      <Image
        source={{ uri: mapUrl }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="cover"
        onError={() => {
          if (__DEV__) console.log("MapPreview: Image failed to load, useFallback:", useFallback);
          if (!useFallback && GOOGLE_API_KEY) {
            // Try Geoapify fallback if Google failed
            setUseFallback(true);
          } else {
            // Both failed, show placeholder
            setImageError(true);
          }
        }}
        onLoad={() => {
          if (__DEV__) console.log("MapPreview: Map image loaded successfully");
        }}
      />
      {/* Overlay pin for better visibility */}
      <View
        className="absolute inset-0 items-center justify-center"
        pointerEvents="none"
      >
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{
            backgroundColor: "#4ECDC4",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 4,
          }}
        >
          <MapPin size={18} color="#fff" />
        </View>
      </View>
    </View>
  );
}
