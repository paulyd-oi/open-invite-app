import { devLog, devError } from "@/lib/devLog";
import { BACKEND_URL } from "@/lib/config";

// Place suggestion type
export interface PlaceSuggestion {
  id: string;
  name: string;
  address: string;
  fullAddress: string;
}

// Google Places API key (client-side, restricted to Places API)
const GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

// Search places via Google Places Autocomplete API directly (with location bias)
const searchPlacesViaGoogle = async (
  query: string,
  lat?: number,
  lon?: number,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> => {
  if (!GOOGLE_PLACES_KEY || !query || query.length < 2) return [];

  try {
    // Build Google Places Autocomplete URL with location bias
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_KEY}`;

    // Add location bias: prefer results within ~50km of user's location
    if (lat !== undefined && lon !== undefined) {
      url += `&location=${lat},${lon}&radius=50000`;
    }

    if (__DEV__) devLog("[P0_PLACE_SEARCH]", "google_request", { query, hasLocation: lat !== undefined });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const response = await globalThis.fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (__DEV__) devLog("[P0_PLACE_SEARCH]", "google_http_error", { query, status: response.status });
      return [];
    }

    const data = await response.json();

    if (data.status !== "OK" || !data.predictions?.length) {
      if (__DEV__) devLog("[P0_PLACE_SEARCH]", "google_no_results", { query, status: data.status });
      return [];
    }

    // Map Google predictions to PlaceSuggestion format
    return data.predictions.slice(0, 8).map((p: any) => {
      const mainText = p.structured_formatting?.main_text ?? p.description;
      const secondaryText = p.structured_formatting?.secondary_text ?? "";
      return {
        id: p.place_id,
        name: mainText,
        address: secondaryText,
        fullAddress: p.description,
      };
    });
  } catch (error: any) {
    if (error?.name === "AbortError") return [];
    if (__DEV__) devLog("[P0_PLACE_SEARCH]", "google_error", { query, message: error?.message });
    return [];
  }
};

// Search places using backend proxy (fallback when no Google API key)
const searchPlacesViaBackend = async (query: string, lat?: number, lon?: number, signal?: AbortSignal): Promise<PlaceSuggestion[]> => {
  if (!query || query.length < 2) return [];

  try {
    // Build URL with optional location parameters
    let url = `${BACKEND_URL}/api/places/search?query=${encodeURIComponent(query)}`;
    if (lat !== undefined && lon !== undefined) {
      url += `&lat=${lat}&lon=${lon}`;
    }

    if (__DEV__) devLog("[P0_PLACE_SEARCH]", "backend_request", { query, url: url.slice(0, 80) });

    // Create AbortController for timeout, chained to caller's signal
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    // If caller aborts (e.g. new query supersedes), abort this request too
    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    // Use globalThis.fetch explicitly for React Native compatibility
    const response = await globalThis.fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (__DEV__) devLog("[P0_PLACE_SEARCH]", "http_error", { query, status: response.status });
      return searchPlacesLocal(query);
    }

    const data = await response.json();

    if (data.places && data.places.length > 0) {
      if (__DEV__) devLog("[P0_PLACE_SEARCH]", "results", { query, count: data.places.length });
      return data.places;
    }

    // If backend returns no results or error, use local fallback
    if (data.error) {
      if (__DEV__) devLog("[P0_PLACE_SEARCH]", "api_error", { query, error: data.error });
    }
    if (__DEV__) devLog("[P0_PLACE_SEARCH]", "fallback_local", { query });
    return searchPlacesLocal(query);
  } catch (error: any) {
    // Don't log aborted requests (expected when query changes quickly)
    if (error?.name === "AbortError") return [];
    if (__DEV__) devLog("[P0_PLACE_SEARCH]", "fetch_error", { query, message: error?.message });
    return searchPlacesLocal(query);
  }
};

// Fallback local search when no API key - enhanced with smart suggestions
const searchPlacesLocal = async (query: string): Promise<PlaceSuggestion[]> => {
  if (!query || query.length < 2) return [];

  const suggestions: PlaceSuggestion[] = [];
  const queryLower = query.toLowerCase().trim();

  // Always add the user's query as an option first
  suggestions.push({
    id: `custom-${Date.now()}`,
    name: query,
    address: "Use as custom location",
    fullAddress: query,
  });

  // Smart category-based suggestions
  const categoryMatches: { [key: string]: string[] } = {
    coffee: ["Starbucks", "Coffee Shop", "Café", "Coffee Bean", "Peet's Coffee", "Dunkin'"],
    cafe: ["Café", "Coffee Shop", "Starbucks", "Bakery Café"],
    restaurant: ["Restaurant", "Diner", "Bistro", "Eatery", "Grill"],
    food: ["Restaurant", "Fast Food", "Food Court", "Diner"],
    bar: ["Bar", "Pub", "Sports Bar", "Wine Bar", "Brewery", "Lounge"],
    gym: ["Gym", "Fitness Center", "24 Hour Fitness", "LA Fitness", "Planet Fitness", "CrossFit"],
    fitness: ["Fitness Center", "Gym", "Yoga Studio", "Pilates"],
    park: ["Park", "City Park", "Dog Park", "Playground", "Recreation Area"],
    beach: ["Beach", "Beach Park", "Boardwalk", "Pier"],
    mall: ["Shopping Mall", "Shopping Center", "Outlet Mall"],
    movie: ["Movie Theater", "AMC Theaters", "Regal Cinema", "Cinemark"],
    theater: ["Movie Theater", "Theater", "Playhouse"],
    bowling: ["Bowling Alley", "Bowling Center", "Bowl"],
    golf: ["Golf Course", "Golf Club", "Driving Range", "Mini Golf", "TopGolf"],
    library: ["Library", "Public Library", "City Library"],
    museum: ["Museum", "Art Museum", "History Museum", "Science Museum"],
    zoo: ["Zoo", "Safari Park", "Animal Park", "Wildlife Reserve"],
    hotel: ["Hotel", "Inn", "Marriott", "Hilton", "Hyatt", "Resort"],
    airport: ["Airport", "International Airport", "Terminal"],
    hospital: ["Hospital", "Medical Center", "Urgent Care", "ER"],
    school: ["School", "University", "College", "Campus"],
    pizza: ["Pizza Hut", "Domino's", "Papa John's", "Pizzeria", "Pizza Place"],
    burger: ["McDonald's", "Burger King", "Wendy's", "In-N-Out", "Five Guys", "Shake Shack"],
    taco: ["Taco Bell", "Chipotle", "Mexican Restaurant", "Taqueria", "Del Taco"],
    mexican: ["Mexican Restaurant", "Chipotle", "Taco Bell", "Taqueria"],
    chinese: ["Chinese Restaurant", "Panda Express", "P.F. Chang's"],
    sushi: ["Sushi Restaurant", "Sushi Bar", "Japanese Restaurant"],
    japanese: ["Japanese Restaurant", "Sushi Restaurant", "Ramen Shop"],
    italian: ["Italian Restaurant", "Olive Garden", "Pasta House", "Trattoria"],
    indian: ["Indian Restaurant", "Curry House", "Tandoori"],
    thai: ["Thai Restaurant", "Thai Kitchen"],
    ice: ["Ice Cream Shop", "Baskin Robbins", "Cold Stone", "Dairy Queen", "Froyo"],
    bakery: ["Bakery", "Donut Shop", "Pastry Shop", "Bread Co"],
    smoothie: ["Jamba Juice", "Smoothie King", "Juice Bar"],
    juice: ["Juice Bar", "Jamba Juice", "Pressed Juicery"],
    jamba: ["Jamba Juice"],
    spa: ["Spa", "Day Spa", "Massage", "Wellness Center"],
    salon: ["Hair Salon", "Barber Shop", "Great Clips", "Supercuts", "Beauty Salon"],
    bank: ["Bank", "Chase Bank", "Bank of America", "Wells Fargo", "Credit Union"],
    gas: ["Gas Station", "Shell", "Chevron", "76", "Costco Gas", "Mobil"],
    pharmacy: ["CVS", "Walgreens", "Rite Aid", "Pharmacy"],
    grocery: ["Grocery Store", "Whole Foods", "Trader Joe's", "Safeway", "Kroger", "Vons"],
    target: ["Target"],
    walmart: ["Walmart", "Walmart Supercenter"],
    costco: ["Costco", "Costco Wholesale"],
    apple: ["Apple Store"],
    starbucks: ["Starbucks", "Starbucks Reserve"],
    home: ["My Place", "Home", "My House"],
    work: ["Work", "Office", "Workplace"],
    office: ["Office", "Work", "Coworking Space", "WeWork"],
  };

  // Find matching categories and add suggestions
  let foundCategory = false;
  for (const [keyword, categorySuggestions] of Object.entries(categoryMatches)) {
    if (queryLower.includes(keyword) || keyword.includes(queryLower)) {
      foundCategory = true;
      for (const suggestion of categorySuggestions) {
        if (!suggestions.find(s => s.name.toLowerCase() === suggestion.toLowerCase())) {
          suggestions.push({
            id: `smart-${suggestion.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${suggestions.length}`,
            name: suggestion,
            address: "Nearby location",
            fullAddress: suggestion,
          });
        }
        if (suggestions.length >= 8) break;
      }
      if (suggestions.length >= 8) break;
    }
  }

  // If no category match, add generic helpful suggestions
  if (!foundCategory && suggestions.length < 4) {
    const genericSuggestions = [
      { name: `${query} near me`, address: "Search nearby" },
      { name: `${query} downtown`, address: "Downtown area" },
      { name: `${query} restaurant`, address: "At a restaurant" },
    ];

    for (const generic of genericSuggestions) {
      suggestions.push({
        id: `generic-${Date.now()}-${suggestions.length}`,
        name: generic.name,
        address: generic.address,
        fullAddress: generic.name,
      });
      if (suggestions.length >= 6) break;
    }
  }

  return suggestions.slice(0, 8);
};

// Main search function — Google Places direct (with location bias) → backend proxy → local fallback
export const searchPlaces = async (query: string, lat?: number, lon?: number, signal?: AbortSignal): Promise<PlaceSuggestion[]> => {
  // 1. Try Google Places Autocomplete directly (if API key is set)
  if (GOOGLE_PLACES_KEY) {
    const googleResults = await searchPlacesViaGoogle(query, lat, lon, signal);
    if (googleResults.length > 0) return googleResults;
  }

  // 2. Fall back to backend proxy
  return searchPlacesViaBackend(query, lat, lon, signal);
};

/** Parse a route param string into a Date, returning null for any garbage. */
export function safeParseDate(param: unknown): Date | null {
  if (typeof param !== 'string' || param.length === 0) return null;
  const ms = Date.parse(param);
  if (isNaN(ms)) return null;
  return new Date(ms);
}

/**
 * Normalize a location string to prevent duplicated address segments.
 * Example input:  "9355 Vervain Street, 9355 Vervain Street, Rancho Peñasquitos, San Diego"
 * Example output: "9355 Vervain Street, Rancho Peñasquitos, San Diego"
 */
export const normalizeLocationString = (raw: string | null | undefined): string | null => {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Split on ", " into segments
  const parts = trimmed.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return trimmed;

  // Deduplicate: walk segments, skip any that duplicate the previous segment (case-insensitive)
  const deduped: string[] = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const prev = deduped[deduped.length - 1].toLowerCase();
    const curr = parts[i].toLowerCase();
    // Skip if exact dup or if previous already contains this segment
    if (curr === prev || prev.includes(curr)) continue;
    deduped.push(parts[i]);
  }

  return deduped.join(", ") || null;
};

/**
 * Build a clean location string from a PlaceSuggestion.
 * Prefers address (formatted_address) over fullAddress to avoid server-side
 * name+address concatenation that causes duplication.
 * If place.address looks like a real address (not a placeholder like "Nearby location"),
 * use it. Otherwise fall back to fullAddress with dedup normalization.
 */
export const buildCleanLocation = (place: PlaceSuggestion): string => {
  const isRealAddress = place.address &&
    place.address !== "Use as custom location" &&
    place.address !== "Nearby location" &&
    place.address !== "Search nearby" &&
    place.address !== "Downtown area" &&
    place.address !== "At a restaurant";

  if (isRealAddress) {
    // Backend returns: name="Bonsai", address="9355 Vervain St, San Diego, CA"
    // If name differs from the address start, compose "Name, Address"
    const addrLC = place.address.toLowerCase();
    const nameLC = place.name.toLowerCase();
    if (nameLC && !addrLC.startsWith(nameLC) && nameLC !== addrLC) {
      return normalizeLocationString(`${place.name}, ${place.address}`) ?? place.address;
    }
    return normalizeLocationString(place.address) ?? place.address;
  }

  // Fallback: use fullAddress with dedup normalization
  return normalizeLocationString(place.fullAddress) ?? place.fullAddress;
};
