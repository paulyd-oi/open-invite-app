import { Hono } from "hono";
import { type AppType } from "../types";

export const placesRouter = new Hono<AppType>();

// Google Places API key from environment (optional)
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";

interface GooglePlacesPrediction {
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text?: string;
  };
  description: string;
}

interface GooglePlacesResponse {
  status: string;
  predictions?: GooglePlacesPrediction[];
}

interface PhotonFeature {
  properties: {
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    district?: string;
    locality?: string;
    type?: string;
  };
  geometry: {
    coordinates: [number, number];
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name?: string;
  address?: {
    amenity?: string;
    shop?: string;
    tourism?: string;
    leisure?: string;
    building?: string;
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
}

// Format address from Nominatim result
function formatAddress(result: NominatimResult): { name: string; address: string } {
  const addr = result.address;

  // Try to get a meaningful name
  let name = result.name ||
             addr?.amenity ||
             addr?.shop ||
             addr?.tourism ||
             addr?.leisure ||
             addr?.building ||
             "";

  // If no specific name, use the first part of display_name
  if (!name) {
    const parts = result.display_name.split(", ");
    name = parts[0] ?? result.display_name;
  }

  // Build a shorter address
  const addressParts: string[] = [];

  if (addr?.house_number && addr?.road) {
    addressParts.push(`${addr.house_number} ${addr.road}`);
  } else if (addr?.road) {
    addressParts.push(addr.road);
  }

  if (addr?.neighbourhood || addr?.suburb) {
    addressParts.push(addr.neighbourhood || addr.suburb || "");
  }

  const city = addr?.city || addr?.town || addr?.village || "";
  if (city) {
    addressParts.push(city);
  }

  if (addr?.state) {
    addressParts.push(addr.state);
  }

  const address = addressParts.filter(Boolean).join(", ") || result.display_name;

  return { name, address };
}

// Search using Nominatim (OpenStreetMap) - free, no API key needed
async function searchNominatim(query: string, lat?: number, lon?: number): Promise<{ id: string; name: string; address: string; fullAddress: string }[]> {
  try {
    // Build URL with optional viewbox for location biasing
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=8&countrycodes=us`;

    // Add viewbox for location biasing if coordinates provided (roughly 50 mile radius box)
    if (lat !== undefined && lon !== undefined) {
      const delta = 0.75; // roughly 50 miles in degrees
      url += `&viewbox=${lon - delta},${lat + delta},${lon + delta},${lat - delta}&bounded=0`;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "VibeCodeApp/1.0 (contact@vibecode.com)",
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      console.error("Nominatim API error:", response.status);
      return [];
    }

    const results = await response.json() as NominatimResult[];

    if (!results || results.length === 0) {
      return [];
    }

    return results.map((result) => {
      const { name, address } = formatAddress(result);
      return {
        id: `osm-${result.place_id}`,
        name,
        address,
        fullAddress: result.display_name,
      };
    });
  } catch (error) {
    console.error("Nominatim search error:", error);
    return [];
  }
}

// Search using Photon (Komoot's geocoder based on OSM) - faster and more business-friendly
async function searchPhoton(query: string, lat?: number, lon?: number): Promise<{ id: string; name: string; address: string; fullAddress: string }[]> {
  try {
    // Build URL with optional location biasing
    let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`;

    // Add location biasing if coordinates provided (prioritizes results near user)
    if (lat !== undefined && lon !== undefined) {
      url += `&lat=${lat}&lon=${lon}`;
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "VibeCodeApp/1.0",
      },
    });

    if (!response.ok) {
      console.error("Photon API error:", response.status);
      return [];
    }

    const data = await response.json() as PhotonResponse;

    if (!data.features || data.features.length === 0) {
      return [];
    }

    return data.features.map((feature: PhotonFeature, index: number) => {
      const props = feature.properties;

      // Get the name
      const name = props.name ||
                   (props.housenumber && props.street ? `${props.housenumber} ${props.street}` : props.street) ||
                   "Location";

      // Build address parts
      const addressParts: string[] = [];

      if (props.housenumber && props.street) {
        addressParts.push(`${props.housenumber} ${props.street}`);
      } else if (props.street) {
        addressParts.push(props.street);
      }

      if (props.district || props.locality) {
        addressParts.push(props.district || props.locality || "");
      }

      if (props.city) {
        addressParts.push(props.city);
      }

      if (props.state) {
        addressParts.push(props.state);
      }

      const address = addressParts.filter(Boolean).join(", ");
      const fullAddress = [name, address].filter(Boolean).join(", ");

      return {
        id: `photon-${props.osm_id || index}-${Date.now()}`,
        name,
        address: address || props.country || "Unknown location",
        fullAddress,
      };
    });
  } catch (error) {
    console.error("Photon search error:", error);
    return [];
  }
}

// Common place categories for smart suggestions (fallback)
const PLACE_CATEGORIES = [
  { keywords: ["coffee", "cafe", "starbucks"], suggestions: ["Starbucks", "Coffee Shop", "Café", "Coffee Bean", "Peet's Coffee"] },
  { keywords: ["restaurant", "food", "eat", "dinner", "lunch", "breakfast"], suggestions: ["Restaurant", "Diner", "Bistro", "Eatery"] },
  { keywords: ["bar", "pub", "drinks", "beer", "wine"], suggestions: ["Bar", "Pub", "Sports Bar", "Wine Bar", "Brewery"] },
  { keywords: ["gym", "fitness", "workout", "exercise"], suggestions: ["Gym", "Fitness Center", "24 Hour Fitness", "LA Fitness", "CrossFit"] },
  { keywords: ["park", "outdoor", "nature"], suggestions: ["Park", "National Park", "State Park", "Dog Park", "Playground"] },
  { keywords: ["home", "house"], suggestions: ["My Place", "Home", "My House", "Apartment"] },
  { keywords: ["work", "office"], suggestions: ["Work", "Office", "Workplace"] },
];

// Generate smart suggestions based on query (fallback when API fails)
function getSmartSuggestions(query: string): { id: string; name: string; address: string; fullAddress: string }[] {
  const queryLower = query.toLowerCase().trim();
  const suggestions: { id: string; name: string; address: string; fullAddress: string }[] = [];

  // First, always add the user's exact input as an option
  suggestions.push({
    id: `custom-${Date.now()}`,
    name: query,
    address: "Use as custom location",
    fullAddress: query,
  });

  // Find matching categories
  for (const category of PLACE_CATEGORIES) {
    const matches = category.keywords.some(keyword =>
      queryLower.includes(keyword) || keyword.includes(queryLower)
    );

    if (matches) {
      for (const suggestion of category.suggestions) {
        if (!suggestions.find(s => s.name.toLowerCase() === suggestion.toLowerCase())) {
          suggestions.push({
            id: `smart-${suggestion.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`,
            name: suggestion,
            address: "Search nearby",
            fullAddress: suggestion,
          });
        }
        if (suggestions.length >= 8) break;
      }
    }
    if (suggestions.length >= 8) break;
  }

  return suggestions.slice(0, 8);
}

// GET /api/places/search?query=...&lat=...&lon=... - Search for places with optional location biasing
placesRouter.get("/search", async (c) => {
  const query = c.req.query("query");
  const latStr = c.req.query("lat");
  const lonStr = c.req.query("lon");

  // Parse location coordinates if provided
  const lat = latStr ? parseFloat(latStr) : undefined;
  const lon = lonStr ? parseFloat(lonStr) : undefined;

  if (!query || query.length < 2) {
    return c.json({ places: [] });
  }

  // Log if location biasing is being used
  if (lat !== undefined && lon !== undefined) {
    console.log(`Location search with biasing: "${query}" near (${lat}, ${lon})`);
  }

  // If we have a Google API key, use Google Places (best quality)
  if (GOOGLE_API_KEY) {
    try {
      // Build Google Places URL with optional location biasing
      let googleUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        query
      )}&types=establishment|geocode&key=${GOOGLE_API_KEY}`;

      // Add location bias if coordinates provided
      if (lat !== undefined && lon !== undefined) {
        googleUrl += `&location=${lat},${lon}&radius=50000`; // 50km radius bias
      }

      const response = await fetch(googleUrl);

      const data = await response.json() as GooglePlacesResponse;

      if (data.status === "OK" && data.predictions && data.predictions.length > 0) {
        const places = data.predictions.slice(0, 8).map((prediction: GooglePlacesPrediction) => ({
          id: prediction.place_id,
          name: prediction.structured_formatting.main_text,
          address: prediction.structured_formatting.secondary_text || prediction.description,
          fullAddress: prediction.description,
        }));

        return c.json({ places });
      }
    } catch (error) {
      console.error("Google Places API error:", error);
    }
  }

  // Try Photon API (fast OSM-based geocoder) - FREE, no API key needed
  console.log("Using Photon API for location search:", query);
  const photonResults = await searchPhoton(query, lat, lon);

  if (photonResults.length > 0) {
    return c.json({ places: photonResults });
  }

  // Fallback to Nominatim (official OSM geocoder) - FREE, no API key needed
  console.log("Falling back to Nominatim API for:", query);
  const nominatimResults = await searchNominatim(query, lat, lon);

  if (nominatimResults.length > 0) {
    return c.json({ places: nominatimResults });
  }

  // Last resort: smart suggestions
  console.log("Using smart suggestions for:", query);
  const smartSuggestions = getSmartSuggestions(query);
  return c.json({ places: smartSuggestions });
});
