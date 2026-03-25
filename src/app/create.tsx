import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { trackEventCreated as trackEventCreatedAnalytics, trackValueEventCreated } from "@/analytics/analyticsEventsSSOT";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { devLog, devWarn, devError } from "@/lib/devLog";
import { circleKeys } from "@/lib/circleQueryKeys";
import { qk } from "@/lib/queryKeys";
import {
  MapPin,
  Search,
  ArrowRight,
  Share2,
  Camera,
  X,
  Sparkles,
} from "@/ui/icons";

import { trackEventCreated } from "@/lib/rateApp";
import { EVENT_THEMES, resolveEventTheme, type ThemeId } from "@/lib/eventThemes";
import { loadCustomThemes, deleteCustomTheme, MAX_CUSTOM_THEMES, type CustomTheme } from "@/lib/customThemeStorage";
import Animated, { FadeInDown, FadeIn, useAnimatedStyle, withTiming } from "react-native-reanimated";
import BottomSheet from "@/components/BottomSheet";
import { CreateEditorHeader } from "@/components/create/CreateEditorHeader";
import { CreatePreviewHero } from "@/components/create/CreatePreviewHero";
import { CreateBottomDock, type DockMode } from "@/components/create/CreateBottomDock";
import { ThemeSwatchRail } from "@/components/create/ThemeSwatchRail";
import { EffectSwatchRail } from "@/components/create/EffectSwatchRail";
import { SettingsSheetContent } from "@/components/create/SettingsSheetContent";
import { CoverMediaPickerSheet } from "@/components/create/CoverMediaPickerSheet";
import type { CoverMediaItem } from "@/components/create/coverMedia.types";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { uploadByKind } from "@/lib/imageUpload";
import DateTimePicker from "@react-native-community/datetimepicker";

import BottomNavigation from "@/components/BottomNavigation";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button } from "@/ui/Button";
import { logError, normalizeCreateEventError, type CreateEventErrorReceipt } from "@/lib/errors";
import { guardEmailVerification } from "@/lib/emailVerificationGate";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { NotificationPrePromptModal } from "@/components/NotificationPrePromptModal";
// [GROWTH_V1] PostValueInvitePrompt replaced by event-specific share prompt
import { shouldShowNotificationPrompt } from "@/lib/notificationPrompt";
import { useEntitlements, canCreateEvent, usePremiumStatusContract, useHostingQuota, usePremiumDriftGuard, type PaywallContext } from "@/lib/entitlements";
import { useSubscription } from "@/lib/SubscriptionContext";
import { markGuidanceComplete } from "@/lib/firstSessionGuidance";
import { useOnboardingGuide } from "@/hooks/useOnboardingGuide";
import { OnboardingGuideOverlay } from "@/components/OnboardingGuideOverlay";
import {
  getActiveEventCount,
} from "@/lib/softLimits";
import {
  type CreateEventRequest,
  type CreateEventResponse,
  type GetCirclesResponse,
  type Circle,
  type GetProfilesResponse,
  type GetEventsResponse,
} from "@/shared/contracts";
// [P0_FIND_BEST_TIME_SSOT] SuggestedTimesPicker replaced by route to /whos-free SSOT
import { getPendingIcsImport } from "@/lib/deepLinks";
import { eventKeys, invalidateEventKeys, getInvalidateAfterEventCreate } from "@/lib/eventQueryKeys";
import { postIdempotent } from "@/lib/idempotencyKey";
import { buildEventSharePayload } from "@/lib/shareSSOT";
import { trackInviteShared } from "@/analytics/analyticsEventsSSOT";

// Place suggestion type
interface PlaceSuggestion {
  id: string;
  name: string;
  address: string;
  fullAddress: string;
}

// Search places using backend proxy (avoids CORS/API key issues)

// DEV-only: last create-event error receipt for inspection
let __lastCreateEventReceipt: CreateEventErrorReceipt | null = null;

const searchPlacesViaBackend = async (query: string, lat?: number, lon?: number, signal?: AbortSignal): Promise<PlaceSuggestion[]> => {
  if (!query || query.length < 2) return [];

  try {
    // Build URL with optional location parameters
    let url = `${BACKEND_URL}/api/places/search?query=${encodeURIComponent(query)}`;
    if (lat !== undefined && lon !== undefined) {
      url += `&lat=${lat}&lon=${lon}`;
    }

    if (__DEV__) devLog("[P0_PLACE_SEARCH]", "request", { query, url: url.slice(0, 80) });

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

// Main search function - uses backend API for Google Places
const searchPlaces = async (query: string, lat?: number, lon?: number, signal?: AbortSignal): Promise<PlaceSuggestion[]> => {
  return searchPlacesViaBackend(query, lat, lon, signal);
};

/** Parse a route param string into a Date, returning null for any garbage. */
function safeParseDate(param: unknown): Date | null {
  if (typeof param !== 'string' || param.length === 0) return null;
  const ms = Date.parse(param);
  if (isNaN(ms)) return null;
  return new Date(ms);
}

export default function CreateEventScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const onboardingGuide = useOnboardingGuide();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const isSmartMode = params?.mode === "smart";
  
  // [P1_CREATE_FLOW] Proof log: create screen mounted
  useEffect(() => {
    if (__DEV__) {
      devLog('[P1_CREATE_FLOW]', 'create screen mounted', { bootStatus });
    }
  }, []);
  useEffect(() => {
    if (__DEV__ && isSmartMode) {
      console.log("[P0_SMART_CREATE_MODE]", {
        circleId: params?.circleId,
        date: params?.date,
        duration: params?.duration,
      });
    }
  }, [isSmartMode]);
  const { date, template, emoji: templateEmoji, title: templateTitle, duration, circleId, visibility: visibilityParam, endDate: endDateParam } = useLocalSearchParams<{
    date?: string;
    template?: string;
    emoji?: string;
    title?: string;
    duration?: string;
    circleId?: string;
    visibility?: string;
    endDate?: string;
  }>();
  const { themeColor, isDark, colors } = useTheme();

  // Check if creating from a circle
  const isCircleEvent = !!circleId;

  // Fetch active profile
  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 60000,
  });

  const activeProfile = profilesData?.activeProfile;
  const [locationPermissionAsked, setLocationPermissionAsked] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

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

  // Initialize date from URL param or use next-evening heuristic (hardened)
  const getInitialDate = (): Date => {
    const parsed = safeParseDate(date);
    if (parsed) return parsed;
    if (__DEV__ && date) {
      devWarn('[P1_PREFILL_EVENT]', 'params_invalid', { field: 'date', reason: 'unparseable' });
    }
    // [P1_AUTOFILL_DEFAULTS] No explicit date param — default to next 6 PM
    const now = new Date();
    const evening = new Date(now);
    evening.setHours(18, 0, 0, 0);
    // If 6 PM today is still in the future, use it; otherwise tomorrow 6 PM
    if (evening.getTime() <= now.getTime()) {
      evening.setDate(evening.getDate() + 1);
    }
    if (__DEV__) {
      devLog('[P1_AUTOFILL_DEFAULTS]', {
        applied: ['startTime'],
        startTime: evening.toISOString(),
        reason: 'no_date_param_next_evening',
        hasCircleContext: isCircleEvent,
      });
    }
    return evening;
  };

  const [title, setTitle] = useState(templateTitle ?? "");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const emoji = templateEmoji ?? "📅";
  const [startDate, setStartDate] = useState(getInitialDate);
  const [endDate, setEndDate] = useState(() => {
    const start = getInitialDate();
    const ONE_HOUR = 60 * 60 * 1000;
    let coerced = false;

    // Priority 1: explicit endDate param
    const parsedEnd = safeParseDate(endDateParam);
    if (parsedEnd) {
      if (parsedEnd.getTime() > start.getTime()) {
        if (__DEV__) devLog('[P1_PREFILL_EVENT]', 'params_valid', { hasDateParam: !!date, hasEndDateParam: true, hasDurationParam: !!duration, coerced: false });
        return parsedEnd;
      }
      // endDate <= start → coerce
      coerced = true;
      if (__DEV__) devWarn('[P1_PREFILL_EVENT]', 'params_invalid', { field: 'endDate', reason: 'endDate_lte_start' });
    } else if (endDateParam) {
      // endDateParam present but garbage
      if (__DEV__) devWarn('[P1_PREFILL_EVENT]', 'params_invalid', { field: 'endDate', reason: 'unparseable' });
    }

    // Priority 2: duration param (legacy)
    if (!coerced && duration) {
      const mins = parseInt(duration, 10);
      if (!isNaN(mins) && mins > 0) {
        if (__DEV__) devLog('[P1_PREFILL_EVENT]', 'params_valid', { hasDateParam: !!date, hasEndDateParam: false, hasDurationParam: true, coerced: false });
        return new Date(start.getTime() + mins * 60 * 1000);
      }
      if (__DEV__) devWarn('[P1_PREFILL_EVENT]', 'params_invalid', { field: 'duration', reason: 'unparseable' });
    }

    // Default: start + 1 hour
    if (__DEV__) devLog('[P1_PREFILL_EVENT]', 'params_valid', { hasDateParam: !!date, hasEndDateParam: !!endDateParam, hasDurationParam: !!duration, coerced });
    return new Date(start.getTime() + ONE_HOUR);
  });
  const [userModifiedEndTime, setUserModifiedEndTime] = useState(false); // Track if user manually changed end time
  const [visibility, setVisibility] = useState<"all_friends" | "specific_groups" | "circle_only">(() => {
    // If visibility param provided, use it (for circle events)
    if (visibilityParam === "open_invite") return "all_friends";
    if (visibilityParam === "circle_only") return "circle_only";
    // Default: circle_only for circle events, all_friends otherwise
    return isCircleEvent ? "circle_only" : "all_friends";
  });
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<"once" | "weekly" | "monthly">("once");
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);
  const [sendNotification, setSendNotification] = useState(true);
  const isPrivateCircleEvent = true; // Circle events are always private
  const circleEventMode = "open_invite" as const; // Circle events are always open invite
  
  // Capacity state
  const [hasCapacity, setHasCapacity] = useState(false);
  const [capacityInput, setCapacityInput] = useState("");

  // Pitch In V1 state
  const [pitchInEnabled, setPitchInEnabled] = useState(false);
  const [pitchInAmount, setPitchInAmount] = useState("");
  const [pitchInMethod, setPitchInMethod] = useState<"venmo" | "cashapp" | "paypal" | "other">("venmo");
  const [pitchInHandle, setPitchInHandle] = useState("");
  const [pitchInNote, setPitchInNote] = useState("");

  // What to Bring V2 state
  const [bringListEnabled, setBringListEnabled] = useState(false);
  const [bringListItems, setBringListItems] = useState<string[]>([]);
  const [bringListInput, setBringListInput] = useState("");

  // Event Themes V1 state
  const [selectedThemeId, setSelectedThemeId] = useState<ThemeId | null>(null);

  // Custom themes — loaded from MMKV, refreshed on focus
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [selectedCustomTheme, setSelectedCustomTheme] = useState<CustomTheme | null>(null);
  useFocusEffect(
    useCallback(() => {
      setCustomThemes(loadCustomThemes());
    }, []),
  );

  // Live theme preview — derive background color from selected theme
  const previewTheme = resolveEventTheme(selectedThemeId);
  const hasTheme = !!selectedThemeId || !!selectedCustomTheme;
  const previewBg = selectedThemeId
    ? (isDark ? previewTheme.backBgDark : previewTheme.backBgLight)
    : selectedCustomTheme
      ? "#0A0A18"
      : colors.background;
  const previewBgStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(previewBg, { duration: 350 }),
  }), [previewBg]);

  // Glass treatment for form fields when theme is active
  const themed = hasTheme;
  const glassSurface = themed ? "rgba(255,255,255,0.10)" : colors.surface;
  const glassBorder = themed ? "rgba(255,255,255,0.15)" : colors.border;
  const glassText = themed ? "#FFFFFF" : colors.text;
  const glassSecondary = themed ? "rgba(255,255,255,0.6)" : colors.textSecondary;
  const glassTertiary = themed ? "rgba(255,255,255,0.4)" : colors.textTertiary;

  // Bottom dock sheet state
  const [activeDockMode, setActiveDockMode] = useState<DockMode | null>(null);

  // Banner photo state
  const [bannerLocalUri, setBannerLocalUri] = useState<string | null>(null);
  const [bannerUpload, setBannerUpload] = useState<{ url: string; publicId: string } | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [selectedCoverItem, setSelectedCoverItem] = useState<CoverMediaItem | null>(null);

  // Paywall and notification modal state
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("RECURRING_EVENTS");
  // Prompt arbitration: only ONE modal per create success
  // [GROWTH_V1] "share_event" takes highest priority — shares the actual event just created
  type CreatePromptChoice = "share_event" | "post_value_invite" | "notification" | "none";
  const [createPromptChoice, setCreatePromptChoice] = useState<CreatePromptChoice>("none");
  // [GROWTH_V1] Store created event for post-create share prompt
  const [createdEvent, setCreatedEvent] = useState<{ id: string; title: string; emoji: string; startTime: string; endTime?: string | null; location?: string | null; description?: string | null } | null>(null);
  // Fetch entitlements for gating
  // usePremiumStatusContract is single source of truth - CRITICAL: don't show gates while isLoading
  const { data: entitlements, refetch: refetchEntitlements } = useEntitlements();
  const premiumStatus = usePremiumStatusContract();
  const { isPro: userIsPro, isLoading: entitlementsLoading } = premiumStatus;
  const { isPremium, openPaywall } = useSubscription();
  const hostingQuota = useHostingQuota();

  // [P0_PREMIUM_DRIFT_GUARD] Cross-contract consistency check (DEV-only)
  usePremiumDriftGuard(premiumStatus, hostingQuota);

  // [P1_CREATE_ENTITLEMENTS_TIMEOUT] Show visible message when entitlements loading stalls
  const [entitlementsTimedOut, setEntitlementsTimedOut] = useState(false);
  useEffect(() => {
    if (!entitlementsLoading && !hostingQuota.isLoading) {
      setEntitlementsTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      if (entitlementsLoading || hostingQuota.isLoading) {
        setEntitlementsTimedOut(true);
        if (__DEV__) {
          devLog("[P1_CREATE_ENTITLEMENTS_TIMEOUT]", {
            entitlementsLoading,
            quotaLoading: hostingQuota.isLoading,
            action: "timeout_shown",
          });
        }
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [entitlementsLoading, hostingQuota.isLoading]);

  // [P0_FIND_BEST_TIME_SSOT] Return-flow: pick up time selected in /whos-free
  const BEST_TIME_PICK_KEY = "oi:bestTimePick";
  const BEST_TIME_TTL_MS = 30 * 60 * 1000; // 30 minutes
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        let raw: string | null = null;
        try {
          raw = await AsyncStorage.getItem(BEST_TIME_PICK_KEY);
        } catch {
          // read failed — nothing to apply
        }
        // Always clear immediately, even if parse/apply will fail
        try { await AsyncStorage.removeItem(BEST_TIME_PICK_KEY); } catch {}
        if (!raw || cancelled) return;
        try {
          const parsed = JSON.parse(raw) as { startISO?: string; endISO?: string; pickedAtMs?: number };
          const { startISO, endISO, pickedAtMs } = parsed;
          // Validate fields exist
          if (typeof startISO !== "string" || typeof endISO !== "string" || typeof pickedAtMs !== "number") {
            if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "invalid_shape", raw });
            return;
          }
          // TTL guard — ignore stale picks
          const ageMs = Date.now() - pickedAtMs;
          if (ageMs > BEST_TIME_TTL_MS) {
            if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "stale", ageMs, ttl: BEST_TIME_TTL_MS });
            return;
          }
          const pickedStart = new Date(startISO);
          const pickedEnd = new Date(endISO);
          if (isNaN(pickedStart.getTime()) || isNaN(pickedEnd.getTime())) {
            if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "bad_date", startISO, endISO });
            return;
          }
          setStartDate(pickedStart);
          setEndDate(pickedEnd);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (__DEV__) {
            devLog("[P0_FIND_BEST_TIME_SSOT] apply", {
              startISO,
              endISO,
              ageMs,
              decision: "applied",
            });
          }
        } catch {
          if (__DEV__) devLog("[P0_FIND_BEST_TIME_SSOT] ignored", { reason: "parse_error" });
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  // [P1_HOSTING_QUOTA_UI] DEV proof log (once per render when quota present)
  const quotaLoggedRef = React.useRef(false);
  useEffect(() => {
    if (!hostingQuota.isLoading && !quotaLoggedRef.current) {
      quotaLoggedRef.current = true;
      if (__DEV__) {
        devLog("[P1_HOSTING_QUOTA_UI]", {
          eventsUsed: hostingQuota.eventsUsed,
          monthlyLimit: hostingQuota.monthlyLimit,
          remaining: hostingQuota.remaining,
          canHost: hostingQuota.canHost,
          isUnlimited: hostingQuota.isUnlimited,
        });
      }
    }
  }, [hostingQuota.isLoading, hostingQuota.eventsUsed, hostingQuota.monthlyLimit, hostingQuota.remaining, hostingQuota.canHost, hostingQuota.isUnlimited]);

  // ── [P1_HOSTING_QUOTA_NUDGE] Soft nudge banner state ──
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const nudgeCheckedRef = React.useRef(false);

  const nudgeMonthKey = useMemo(() => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }, []);

  const nudgeStorageKey = useMemo(() => {
    const userId = session?.user?.id;
    if (!userId) return null;
    return `oi:hosting_nudge_dismissed:${userId}:${nudgeMonthKey}`;
  }, [session?.user?.id, nudgeMonthKey]);

  // Check dismiss state on mount
  useEffect(() => {
    if (nudgeCheckedRef.current || !nudgeStorageKey) return;
    nudgeCheckedRef.current = true;
    (async () => {
      try {
        const val = await AsyncStorage.getItem(nudgeStorageKey);
        if (val === "1") setNudgeDismissed(true);
      } catch {
        // fail-open: show banner if read fails
      }
    })();
  }, [nudgeStorageKey]);

  const handleNudgeDismiss = useCallback(async () => {
    setNudgeDismissed(true);
    if (__DEV__) {
      devLog("[P1_HOSTING_NUDGE]", { action: "dismiss", monthKey: nudgeMonthKey });
    }
    if (nudgeStorageKey) {
      try {
        await AsyncStorage.setItem(nudgeStorageKey, "1");
      } catch {
        // non-critical
      }
    }
  }, [nudgeStorageKey, nudgeMonthKey]);

  const handleNudgeUpgrade = useCallback(() => {
    if (__DEV__) {
      devLog("[P1_HOSTING_NUDGE]", { action: "upgrade_tap", monthKey: nudgeMonthKey });
    }
    setPaywallContext("RECURRING_EVENTS");
    setShowPaywallModal(true);
  }, [nudgeMonthKey]);

  // ── [P1_HOSTING_NUDGE] Soft nudge: driven by backend nudgeMeta ──
  // Premium/unlimited: NEVER nudge. Loading/fetching/error: fail-open (no nudge).
  // nudgeMeta.shouldNudgeNow is the SSOT for threshold logic.
  const showNudgeBanner = useMemo(() => {
    // Premium suppression — usePremiumStatusContract is SSOT
    if (userIsPro) return false;
    // Fail-open: any loading/fetching/error → no nudge
    if (entitlementsLoading || premiumStatus.isFetching) return false;
    if (hostingQuota.isLoading || hostingQuota.isFetching) return false;
    if (hostingQuota.error) return false;
    // Unlimited plans → no nudge
    if (hostingQuota.isUnlimited) return false;
    // Backend SSOT: nudgeMeta drives threshold logic
    if (!hostingQuota.nudgeMeta || !hostingQuota.nudgeMeta.shouldNudgeNow) return false;
    // User dismissed for this month
    if (nudgeDismissed) return false;
    return true;
  }, [
    userIsPro,
    entitlementsLoading,
    premiumStatus.isFetching,
    hostingQuota.isLoading,
    hostingQuota.isFetching,
    hostingQuota.error,
    hostingQuota.isUnlimited,
    hostingQuota.nudgeMeta,
    nudgeDismissed,
  ]);

  // [P1_HOSTING_NUDGE] DEV proof log
  useEffect(() => {
    if (!__DEV__ || hostingQuota.isLoading || entitlementsLoading) return;
    devLog("[P1_HOSTING_NUDGE]", {
      action: showNudgeBanner ? "shown" : "suppressed",
      eventsUsed: hostingQuota.eventsUsed,
      monthlyLimit: hostingQuota.monthlyLimit,
      proSuppressed: userIsPro,
      unlimitedSuppressed: hostingQuota.isUnlimited,
      dismissed: nudgeDismissed,
    });
  }, [
    showNudgeBanner,
    hostingQuota.isLoading,
    entitlementsLoading,
    hostingQuota.eventsUsed,
    hostingQuota.monthlyLimit,
    userIsPro,
    hostingQuota.isUnlimited,
    nudgeDismissed,
  ]);

  // Check for pending ICS import on mount
  useEffect(() => {
    const loadPendingImport = async () => {
      const pendingImport = await getPendingIcsImport();
      if (pendingImport) {
        devLog('[Create Event] Loading ICS import:', pendingImport.title);
        setTitle(pendingImport.title);
        setStartDate(pendingImport.startTime);
        if (pendingImport.endTime) {
          setEndDate(pendingImport.endTime);
          setUserModifiedEndTime(true); // Don't auto-update end time
        }
        if (pendingImport.location) {
          setLocation(pendingImport.location);
        }
        if (pendingImport.notes) {
          setDescription(pendingImport.notes);
        }
        safeToast.success('Event imported from calendar', 'Review and create your event');
      }
    };
    loadPendingImport();
  }, []);

  // Auto-update endDate when startDate changes (if user hasn't manually set it)
  useEffect(() => {
    if (!userModifiedEndTime) {
      const newEndDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      setEndDate(newEndDate);
    }
  }, [startDate, userModifiedEndTime]);

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

  /**
   * Normalize a location string to prevent duplicated address segments.
   * Example input:  "9355 Vervain Street, 9355 Vervain Street, Rancho Peñasquitos, San Diego"
   * Example output: "9355 Vervain Street, Rancho Peñasquitos, San Diego"
   */
  const normalizeLocationString = (raw: string | null | undefined): string | null => {
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
  const buildCleanLocation = (place: PlaceSuggestion): string => {
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

  const handleSelectPlace = (place: PlaceSuggestion) => {
    Haptics.selectionAsync();
    setSelectedPlace(place);
    setLocation(buildCleanLocation(place));
    setLocationQuery("");
    setShowLocationSearch(false);
    setPlaceSuggestions([]);
  };

  const handleLocationInputChange = (text: string) => {
    setLocationQuery(text);
    setLocation(text);
    setSelectedPlace(null);
    if (text.length >= 2) {
      setShowLocationSearch(true);
    }
  };

  const { data: circlesData } = useQuery({
    queryKey: circleKeys.all(),
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: isAuthedForNetwork(bootStatus, session),
  });

  const circles = circlesData?.circles ?? [];

  // Fetch my events for active event counting (soft-limit check)
  const { data: myEventsData } = useQuery({
    queryKey: eventKeys.mine(),
    queryFn: () => api.get<GetEventsResponse>("/api/events/mine"),
    enabled: isAuthedForNetwork(bootStatus, session) && !isPremium,
  });

  const myEvents = myEventsData?.events ?? [];
  const activeEventCount = getActiveEventCount(myEvents);

  // [PAYWALL_COUNT] Diagnostic: track imported vs app-created event breakdown
  if (__DEV__ && myEvents.length > 0) {
    const importedCount = myEvents.filter((e: any) => e.isImported).length;
    const appCreatedCount = myEvents.length - importedCount;
    devLog("[PAYWALL_COUNT]", "event_breakdown", {
      total: myEvents.length,
      imported: importedCount,
      appCreated: appCreatedCount,
      activeEventCount,
    });
  }

  const createMutation = useMutation({
    mutationFn: (data: CreateEventRequest) =>
      postIdempotent<CreateEventResponse>("/api/events", data),
    onSuccess: async (response) => {
      // [P1_CREATE_FLOW] Proof log: create success
      if (__DEV__) {
        devLog('[P1_CREATE_FLOW]', 'create success', {
          eventId: response?.event?.id || 'unknown',
          title: response?.event?.title || 'unknown',
        });
        // [P0_EVENT_CREATE_NOTIFY] Proof: confirm flag was sent with the request
        devLog('[P0_EVENT_CREATE_NOTIFY]', 'server_accepted', {
          eventId: response?.event?.id?.slice(0, 8),
          sendNotification,
          expected: sendNotification ? 'push_fanout' : 'no_push',
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Track for rate app prompt
      trackEventCreated();
      // [P0_ANALYTICS_EVENT] event_created
      trackEventCreatedAnalytics({
        visibility: visibility ?? "unknown",
        hasLocation: location ? 1 : 0,
        hasPhoto: bannerUpload ? 1 : 0,
        isOpenInvite: visibility === "all_friends" ? 1 : 0,
      });
      // [P0_POSTHOG_VALUE] value_event_created — canonical retention event
      trackValueEventCreated({
        eventId: response?.event?.id ?? "unknown",
        isOpenInvite: visibility === "all_friends",
        source: circleId ? "circle" : "create",
        hasLocation: !!location,
        hasCoverImage: !!bannerUpload,
        hasGuests: 0,
        ts: new Date().toISOString(),
      });
      if (__DEV__) {
        devLog("[P0_POSTHOG_VALUE]", { event: "value_event_created", eventId: (response?.event?.id ?? "").slice(0, 8) + "..." });
      }
      // Mark guidance complete - user has created their first invite
      markGuidanceComplete("create_invite");
      // Complete "create_event" onboarding step
      if (onboardingGuide.shouldShowStep("create_event")) {
        onboardingGuide.completeStep("create_event");
      }
      // P0 FIX: Invalidate using SSOT contract
      invalidateEventKeys(queryClient, getInvalidateAfterEventCreate(), "event_create");
      // Invalidate entitlements to refresh usage counts
      queryClient.invalidateQueries({ queryKey: qk.entitlements() });
      // P0 FIX: Always invalidate circle queries so circle calendars reflect new events
      // (memberEvents includes ALL events by circle members, not just circle-linked ones)
      queryClient.invalidateQueries({ queryKey: circleKeys.all() });
      if (circleId) {
        queryClient.invalidateQueries({ queryKey: circleKeys.single(circleId) });
      }
      // ── [GROWTH_V1] Prompt arbitration: at most ONE modal per create success ──
      // Priority: ShareEvent (always) > NotificationPrePrompt > none
      // ShareEvent is the highest priority because sharing the just-created event
      // is the single most valuable growth action after create.

      // Store the created event for the share prompt
      const evt = response?.event;
      if (evt?.id) {
        setCreatedEvent({
          id: evt.id,
          title: evt.title ?? title,
          emoji: evt.emoji ?? emoji,
          startTime: evt.startTime ?? startDate.toISOString(),
          endTime: evt.endTime ?? endDate?.toISOString() ?? null,
          location: evt.location ?? location ?? null,
          description: evt.description ?? description ?? null,
        });
      }

      let notifEligible = false;
      try {
        notifEligible = await shouldShowNotificationPrompt(session?.user?.id) ?? false;
      } catch {
        notifEligible = false;
      }

      // [GROWTH_V1] Always show share_event if we have the created event
      let chosen: CreatePromptChoice = "none";
      if (evt?.id) {
        chosen = "share_event";
      } else if (notifEligible) {
        chosen = "notification";
      }

      if (__DEV__) {
        devLog("[P1_PROMPT_ARB_CREATE]", `chosen=${chosen} hasEvent=${!!evt?.id} notifEligible=${notifEligible}`);
      }

      if (chosen !== "none") {
        setCreatePromptChoice(chosen);
        // router.back() deferred until the chosen modal is dismissed
      } else {
        router.back();
      }
    },
    onError: (error: any) => {
      // ── Structured error receipt ──────────────────────────────────────
      const receipt = normalizeCreateEventError(error, circleId ?? null);

      // [P1_CREATE_EVENT_CIRCLE_ERR] Proof log: structured receipt
      if (__DEV__) {
        devLog('[P1_CREATE_EVENT_CIRCLE_ERR]', 'create failure receipt', receipt);
        __lastCreateEventReceipt = receipt;
      }
      logError("Create Event", error);

      // Actionable user-facing copy from receipt (never generic "Server Error")
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      safeToast.error(receipt.message, receipt.hint, error);
    },
  });

  // Handle frequency change with recurring event gating
  const handleFrequencyChange = (newFrequency: "once" | "weekly" | "monthly") => {
    // If changing to recurring, check if allowed
    if (newFrequency !== "once") {
      const check = canCreateEvent(entitlements, true);
      if (!check.allowed && check.context) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPaywallContext(check.context);
        setShowPaywallModal(true);
        // Reset to "once" if not allowed
        setFrequency("once");
        return;
      }
    }
    setFrequency(newFrequency);
    setShowFrequencyPicker(false);
  };

  const handlePickBanner = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        safeToast.warning("Permission Required", "Please allow access to your photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      setBannerLocalUri(uri);
      setBannerUpload(null);
      setUploadingBanner(true);
      try {
        const upload = await uploadByKind(uri, "event_cover");
        setBannerUpload({ url: upload.url, publicId: upload.publicId ?? "" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e: any) {
        if (__DEV__) devError("[CREATE_BANNER_UPLOAD]", e);
        safeToast.error("Upload failed", "Please try again.");
        setBannerLocalUri(null);
      } finally {
        setUploadingBanner(false);
      }
    } catch (e: any) {
      if (__DEV__) devError("[CREATE_BANNER_PICK]", e);
    }
  };

  const handleRemoveBanner = () => {
    setBannerLocalUri(null);
    setBannerUpload(null);
    setSelectedCoverItem(null);
  };

  /** Handle cover selection from the media picker sheet. */
  const handleCoverSelect = useCallback((item: CoverMediaItem) => {
    setSelectedCoverItem(item);
    // Use the full-res URL as the banner — no upload needed for featured/gif items
    setBannerLocalUri(item.url);
    setBannerUpload({ url: item.url, publicId: "" });
    setUploadingBanner(false);
  }, []);

  // Dock mode handler — toggles sheets
  const handleDockMode = useCallback((mode: DockMode) => {
    setActiveDockMode((prev) => (prev === mode ? null : mode));
  }, []);

  // Theme selection from swatch rail
  const handleThemeSelect = useCallback((id: ThemeId | null) => {
    setSelectedThemeId(id);
    setSelectedCustomTheme(null);
  }, []);

  const handleCustomThemeSelect = useCallback((ct: CustomTheme | null) => {
    setSelectedCustomTheme(ct);
    if (ct) setSelectedThemeId(null);
  }, []);

  const handleDeleteCustomTheme = useCallback((id: string) => {
    deleteCustomTheme(id);
    if (selectedCustomTheme?.id === id) setSelectedCustomTheme(null);
    setCustomThemes(loadCustomThemes());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedCustomTheme]);

  const handleOpenThemeBuilder = useCallback((editId?: string) => {
    Haptics.selectionAsync();
    if (editId) {
      router.push({ pathname: "/theme-builder", params: { editId } });
    } else {
      router.push("/theme-builder");
    }
  }, [router]);

  // Effect selection from effect swatch rail
  const handleEffectSelect = useCallback((_effectKey: string | null) => {
    // Effect selection updates the theme's particle preset at runtime.
    // For V1 this is view-only — the effect preview comes from the selected theme.
    // Future: allow overriding the effect independently of the theme.
  }, []);

  const handleCreate = () => {
    // [P0_SINGLEFLIGHT] Prevent double-submit while mutation is in-flight
    if (createMutation.isPending) {
      if (__DEV__) devLog("[P0_SINGLEFLIGHT]", "blocked action=createEvent");
      return;
    }
    // [P1_CREATE_FLOW] Proof log: submit tapped
    if (__DEV__) {
      devLog('[P1_CREATE_FLOW]', 'submit tapped', {
        hasTitle: !!title.trim(),
        frequency,
        visibility,
      });
    }
    
    // Gate: require email verification
    if (!guardEmailVerification(session)) {
      return;
    }

    if (uploadingBanner) {
      safeToast.warning("Please Wait", "Cover photo is still uploading.");
      return;
    }

    if (!title.trim()) {
      safeToast.warning("Missing Title", "Please enter a title for your event.");
      return;
    }

    // Validate endTime > startTime
    if (endDate <= startDate) {
      safeToast.warning("Invalid Time", "End time must be after start time.");
      return;
    }

    if (visibility === "specific_groups" && selectedGroupIds.length === 0) {
      safeToast.warning("No Groups Selected", "Please select at least one group.");
      return;
    }

    // Compute recurring flag
    const isRecurring = frequency !== "once";

    // ── Fail-open master check ──
    // If ANY loading/fetching flag is active, skip ALL gates (backend validates).
    const anyLoading =
      entitlementsLoading || premiumStatus.isFetching ||
      hostingQuota.isLoading || hostingQuota.isFetching ||
      !!hostingQuota.error;

    if (anyLoading) {
      // fail-open: let backend be the final arbiter
      if (__DEV__) {
        devLog("[P0_PREMIUM_PAYWALL_DECISION]", {
          premiumIsPro: userIsPro,
          quotaIsUnlimited: hostingQuota.isUnlimited,
          shouldNudgeNow: hostingQuota.nudgeMeta?.shouldNudgeNow ?? null,
          canHost: hostingQuota.canHost,
          loadingFlags: { entitlementsLoading, premiumFetching: premiumStatus.isFetching, quotaLoading: hostingQuota.isLoading, quotaFetching: hostingQuota.isFetching, quotaError: !!hostingQuota.error },
          action: "fail_open_loading",
        });
      }
    } else {
      // Event creation is unlimited — only gate premium features (recurring)
      const check = canCreateEvent(entitlements, isRecurring);

      if (!check.allowed && check.context) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPaywallContext(check.context);
        setShowPaywallModal(true);
        return;
      }
    }

    // Normalize location to prevent duplicated address segments at persist time
    const _normalizedLocation = normalizeLocationString(location) ?? (location.trim() || undefined);

    if (__DEV__) {
      devLog("[P0_EVENT_CREATE_LOCATION_PAYLOAD]", {
        rawLocationState: location,
        normalizedLocation: _normalizedLocation,
        selectedPlaceName: selectedPlace?.name,
        selectedPlaceAddress: selectedPlace?.address,
        selectedPlaceFullAddress: selectedPlace?.fullAddress,
      });
    }

    // [P0_EVENT_CREATE_NOTIFY] Proof: log notification flag before submission
    // This is the canonical proof that frontend sends the correct value.
    // If push still fires when sendNotification=false, the bug is backend-side.
    if (__DEV__) {
      devLog("[P0_EVENT_CREATE_NOTIFY]", "payload", {
        sendNotification,
        visibility,
        isCircleEvent,
        title: title.trim().slice(0, 20),
      });
    }

    const createPayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      location: _normalizedLocation,
      emoji,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      visibility,
      groupIds: visibility === "specific_groups" ? selectedGroupIds : undefined,
      circleId: isCircleEvent ? circleId : undefined,
      isPrivateCircleEvent: isCircleEvent ? isPrivateCircleEvent : undefined,
      isRecurring,
      recurrence: isRecurring ? frequency : undefined,
      sendNotification,
      capacity: hasCapacity && capacityInput ? parseInt(capacityInput, 10) : null,
      reflectionEnabled: false,
      // Pitch In V1
      ...(pitchInEnabled && pitchInHandle.trim() ? {
        pitchInEnabled: true,
        pitchInTone: pitchInAmount.trim() ? "suggested" as const : "optional" as const,
        pitchInAmount: pitchInAmount.trim() || undefined,
        pitchInMethod,
        pitchInHandle: pitchInHandle.trim(),
        pitchInNote: pitchInNote.trim() || undefined,
      } : {}),
      // What to Bring V2
      ...(bringListEnabled && bringListItems.length > 0 ? {
        bringListEnabled: true,
        bringListItems: bringListItems.map((label, i) => ({
          id: `item_${i}_${Date.now()}`,
          label,
        })),
      } : {}),
      // Banner photo (pre-uploaded)
      ...(bannerUpload ? {
        eventPhotoUrl: bannerUpload.url,
        eventPhotoPublicId: bannerUpload.publicId,
      } : {}),
      // Event Themes V1
      // TODO: Backend custom theme support — currently falls back to neutral for server storage
      ...(selectedThemeId ? { themeId: selectedThemeId } : selectedCustomTheme ? { themeId: "neutral" as ThemeId } : {}),
    };
    if (__DEV__) devLog("[P0_EVENT_REFLECTION_DEFAULT]", "create_payload", { reflectionEnabled: createPayload.reflectionEnabled });
    createMutation.mutate(createPayload);
  };

  const toggleGroup = (groupId: string) => {
    Haptics.selectionAsync();
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  // [QA-8] Suppress login flash: only show sign-in prompt when definitively logged out
  if (!session) {
    if (bootStatus !== 'loggedOut') return null;
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: glassText }} className="text-xl font-semibold mb-2">
            Sign in to create events
          </Text>
          <Button
            variant="primary"
            label="Sign In"
            onPress={() => router.replace("/login")}
            style={{ marginTop: 16 }}
          />
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  // [CREATE_CTA_RENDER] DEV-only: confirm CTA is reachable
  // Dock sits at ~56pt above safe-area bottom; give scroll enough room to
  // clear the dock so the Create button is fully reachable.
  const computedPaddingBottom = 100 + insets.bottom;
  if (__DEV__) {
    devLog('[CREATE_CTA_RENDER]', {
      disabled: createMutation.isPending,
      hasOnPress: true,
      bottomInset: insets.bottom,
      paddingBottom: computedPaddingBottom,
    });
  }

  return (
    <Animated.View testID="create-screen" className="flex-1" style={[{ flex: 1 }, previewBgStyle]}>
      {/* ── Editor Header ── */}
      <CreateEditorHeader
        onCancel={() => router.back()}
        onSave={handleCreate}
        isPending={createMutation.isPending}
        themed={themed}
        glassText={glassText}
        glassSecondary={glassSecondary}
        themeColor={themeColor}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: computedPaddingBottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Live Preview Hero ── */}
          <CreatePreviewHero
            title={title}
            selectedThemeId={selectedThemeId}
            previewTheme={previewTheme}
            selectedCustomTheme={selectedCustomTheme}
            glassText={glassText}
            glassSecondary={glassSecondary}
            themed={themed}
            coverImageUrl={selectedCoverItem?.url ?? bannerLocalUri}
          />

          {isSmartMode && (
            <View
              style={{
                backgroundColor: "#ECFDF5",
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
                marginHorizontal: 16,
                borderWidth: 1,
                borderColor: "#A7F3D0",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#065F46", marginBottom: 4 }}>
                Best time selected
              </Text>
              <Text style={{ fontSize: 12, color: "#065F46" }}>
                Everyone is available at this time. You can adjust it before sending.
              </Text>
            </View>
          )}

          <View className="px-4">
          {/* Cover Photo — text row entry point (hero is the visual preview) */}
          <Animated.View entering={FadeInDown.delay(0).springify()}>
            {bannerLocalUri ? (
              <View
                className="rounded-xl mb-4"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: glassSurface,
                  borderWidth: 0.5,
                  borderColor: glassBorder,
                }}
              >
                <Pressable
                  onPress={() => setShowCoverPicker(true)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
                >
                  <Camera size={16} color={glassSecondary} />
                  <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500" }}>Change cover</Text>
                </Pressable>
                <Pressable
                  onPress={handleRemoveBanner}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <X size={14} color={glassTertiary} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowCoverPicker(true)}
                className="rounded-xl mb-4"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: glassSurface,
                  borderWidth: 1,
                  borderColor: glassBorder,
                  borderStyle: "dashed",
                  gap: 8,
                }}
              >
                <Camera size={16} color={glassTertiary} />
                <Text style={{ color: glassTertiary, fontSize: 13, fontWeight: "500" }}>Add cover photo</Text>
              </Pressable>
            )}
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.delay(25).springify()}>
            <TextInput
              testID="create-input-title"
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={glassTertiary}
              className="rounded-2xl p-3.5 mb-3"
              style={{ backgroundColor: glassSurface, borderWidth: 0.5, borderColor: glassBorder, color: glassText, fontSize: 16, fontWeight: "600" }}
            />
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeInDown.delay(50).springify()}>
            <TextInput
              testID="create-input-description"
              value={description}
              onChangeText={setDescription}
              placeholder="Add some details..."
              placeholderTextColor={glassTertiary}
              multiline
              numberOfLines={3}
              className="rounded-2xl p-3.5 mb-3"
              style={{ backgroundColor: glassSurface, borderWidth: 0.5, borderColor: glassBorder, color: glassText, minHeight: 72, textAlignVertical: "top", fontSize: 14 }}
            />
          </Animated.View>

          {/* Location with Search */}
          <Animated.View entering={FadeInDown.delay(75).springify()}>
            <Text style={{ color: glassTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" }} className="mb-1.5 ml-1">Location</Text>

            {/* Selected Place Display */}
            {selectedPlace && !showLocationSearch ? (
              <Pressable
                onPress={() => {
                  setShowLocationSearch(true);
                  setLocationQuery(location);
                }}
                className="rounded-xl mb-4 p-4"
                style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: themed ? glassBorder : "#4ECDC440" }}
              >
                <View className="flex-row items-start">
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#4ECDC420" }}>
                    <MapPin size={20} color="#4ECDC4" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: glassText }} className="font-semibold">{selectedPlace.name}</Text>
                    <Text style={{ color: glassSecondary }} className="text-sm mt-1">{selectedPlace.address}</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setSelectedPlace(null);
                      setLocation("");
                      setLocationQuery("");
                    }}
                    className="p-1"
                  >
                    <X size={18} color={glassTertiary} />
                  </Pressable>
                </View>
              </Pressable>
            ) : (
              <View className="mb-4">
                {/* Search Input */}
                <View className="rounded-xl flex-row items-center px-4" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                  <Search size={18} color={glassTertiary} />
                  <TextInput
                    testID="create-input-location"
                    value={showLocationSearch ? locationQuery : location}
                    onChangeText={handleLocationInputChange}
                    onFocus={() => {
                      setShowLocationSearch(true);
                      setLocationQuery(location);
                      // Eagerly request location on focus so coordinates are ready by the time the user types
                      if (!userLocation && !locationPermissionAsked) {
                        requestAndFetchLocation();
                      }
                    }}
                    placeholder="Search for a place..."
                    placeholderTextColor={glassTertiary}
                    className="flex-1 p-4"
                    style={{ color: glassText }}
                  />
                  {isSearchingPlaces && (
                    <ActivityIndicator size="small" color="#4ECDC4" />
                  )}
                </View>

                {/* Place Suggestions */}
                {showLocationSearch && placeSuggestions.length > 0 && (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    className="rounded-xl mt-2 overflow-hidden"
                    style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}
                  >
                    {placeSuggestions.map((place, index) => (
                      <Pressable
                        key={`${place.id}-${index}`}
                        onPress={() => handleSelectPlace(place)}
                        className="p-4 flex-row items-center"
                        style={{ borderBottomWidth: index < placeSuggestions.length - 1 ? 1 : 0, borderBottomColor: glassBorder }}
                      >
                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                          {index === 0 ? (
                            <ArrowRight size={18} color="#4ECDC4" />
                          ) : (
                            <MapPin size={18} color={glassTertiary} />
                          )}
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: glassText }} className="font-medium">{place.name}</Text>
                          <Text style={{ color: glassSecondary }} className="text-sm" numberOfLines={1}>
                            {place.address}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </Animated.View>
                )}

                {/* Close search button */}
                {showLocationSearch && (
                  <Pressable
                    onPress={() => {
                      setShowLocationSearch(false);
                      if (!selectedPlace) {
                        setLocation(locationQuery);
                      }
                    }}
                    className="mt-2 py-2"
                  >
                    <Text style={{ color: "#4ECDC4" }} className="text-center font-medium">
                      {locationQuery && !selectedPlace ? "Use custom location" : "Close"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </Animated.View>

          {/* Date & Time */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={{ color: glassTertiary, fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" }} className="mb-1.5 ml-1">When</Text>
            <View
              style={{
                borderColor: isSmartMode ? themeColor : "transparent",
                borderWidth: isSmartMode ? 1 : 0,
                borderRadius: 12,
              }}
            >
              <View
                className="rounded-xl p-4 mb-4"
                style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}
              >
                {/* Start Row */}
                <View className="flex-row items-center justify-between mb-3">
                  <Text style={{ color: glassSecondary }} className="text-xs font-medium w-12">START</Text>
                  <View className="flex-row flex-1 items-center justify-end">
                    <DateTimePicker
                      value={startDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "compact" : "default"}
                      themeVariant={isDark ? "dark" : "light"}
                      onChange={(_, date) => date && setStartDate(date)}
                    />
                    <DateTimePicker
                      value={startDate}
                      mode="time"
                      display={Platform.OS === "ios" ? "compact" : "default"}
                      themeVariant={isDark ? "dark" : "light"}
                      onChange={(_, date) => date && setStartDate(date)}
                    />
                  </View>
                </View>

                {/* End Row */}
                <View className="flex-row items-center justify-between">
                  <Text style={{ color: glassSecondary }} className="text-xs font-medium w-12">END</Text>
                  <View className="flex-row flex-1 items-center justify-end">
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      display={Platform.OS === "ios" ? "compact" : "default"}
                      themeVariant={isDark ? "dark" : "light"}
                      onChange={(_, date) => {
                        if (date) {
                          setEndDate(date);
                          setUserModifiedEndTime(true);
                        }
                      }}
                    />
                    <DateTimePicker
                      value={endDate}
                      mode="time"
                      display={Platform.OS === "ios" ? "compact" : "default"}
                      themeVariant={isDark ? "dark" : "light"}
                      onChange={(_, date) => {
                        if (date) {
                          setEndDate(date);
                          setUserModifiedEndTime(true);
                        }
                      }}
                    />
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Find Best Time — routes to Who's Free SSOT */}
          <Animated.View entering={FadeInDown.delay(125).springify()}>
            <View className="mb-4">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  if (__DEV__) devLog('[P0_FIND_BEST_TIME_SSOT] open', { source: 'create' });
                  router.push('/whos-free?source=create' as any);
                }}
                className="rounded-xl p-4 flex-row items-center"
                style={{
                  backgroundColor: `${themeColor}10`,
                  borderWidth: 1,
                  borderColor: `${themeColor}30`,
                }}
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <Sparkles size={20} color={themeColor} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold" style={{ color: themeColor }}>
                    Find Best Time
                  </Text>
                  <Text className="text-sm" style={{ color: glassSecondary }}>
                    See when friends are free
                  </Text>
                </View>
                <ArrowRight size={20} color={themeColor} />
              </Pressable>
            </View>
          </Animated.View>

          {/* Advanced settings moved to Settings sheet — see SettingsSheetContent */}

          {/* Create Button */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <Button
              testID="create-submit-event"
              variant="primary"
              label={createMutation.isPending ? "Creating..." : "Create Invite"}
              onPress={handleCreate}
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
              style={{
                borderRadius: 12,
                paddingVertical: 14,
                marginTop: 16,
                shadowColor: themeColor,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.5 : 0.3,
                shadowRadius: 8,
              }}
            />
          </Animated.View>

          {/* DEV-only: Show last create-event error receipt */}
          {__DEV__ && __lastCreateEventReceipt && (
            <Pressable
              onPress={() => {
                const r = __lastCreateEventReceipt;
                if (!r) return;
                Alert.alert(
                  "Last Create-Event Error",
                  [
                    `Status: ${r.status ?? "null"}`,
                    `Code: ${r.code ?? "none"}`,
                    `Message: ${r.message}`,
                    `Hint: ${r.hint}`,
                    `Circle: ${r.isCircle ? r.circleId : "n/a"}`,
                    `Request ID: ${r.requestId ?? "none"}`,
                    `Time: ${r.ts}`,
                  ].join("\n"),
                );
              }}
              className="mt-2 py-2 items-center"
            >
              <Text style={{ color: glassTertiary }} className="text-xs">
                DEV: Show last create-event error
              </Text>
            </Pressable>
          )}
          </View>{/* close px-5 */}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Bottom Editing Dock ── */}
      <CreateBottomDock
        activeMode={activeDockMode}
        onModeChange={handleDockMode}
        themed={themed}
        glassText={glassText}
        glassTertiary={glassTertiary}
        themeColor={themeColor}
      />

      {/* ── Theme Sheet ── */}
      <BottomSheet
        visible={activeDockMode === "theme"}
        onClose={() => setActiveDockMode(null)}
        title="Theme"
        heightPct={0.55}
      >
        <ThemeSwatchRail
          selectedThemeId={selectedThemeId}
          selectedCustomTheme={selectedCustomTheme}
          customThemes={customThemes}
          userIsPro={userIsPro}
          isDark={isDark}
          glassText={glassText}
          glassSecondary={glassSecondary}
          glassTertiary={glassTertiary}
          onSelectTheme={handleThemeSelect}
          onSelectCustomTheme={handleCustomThemeSelect}
          onDeleteCustomTheme={handleDeleteCustomTheme}
          onOpenPaywall={() => {
            setPaywallContext("PREMIUM_THEME");
            setShowPaywallModal(true);
          }}
          onOpenThemeBuilder={handleOpenThemeBuilder}
        />
      </BottomSheet>

      {/* ── Effect Sheet ── */}
      <BottomSheet
        visible={activeDockMode === "effect"}
        onClose={() => setActiveDockMode(null)}
        title="Effect"
        heightPct={0.5}
      >
        <EffectSwatchRail
          selectedThemeId={selectedThemeId}
          glassText={glassText}
          glassSecondary={glassSecondary}
          glassTertiary={glassTertiary}
          themeColor={themeColor}
          isDark={isDark}
          onSelectEffect={handleEffectSelect}
        />
      </BottomSheet>

      {/* ── Settings Sheet ── */}
      <BottomSheet
        visible={activeDockMode === "settings"}
        onClose={() => setActiveDockMode(null)}
        title="Settings"
        heightPct={0.65}
      >
        <SettingsSheetContent
          isCircleEvent={isCircleEvent}
          frequency={frequency}
          showFrequencyPicker={showFrequencyPicker}
          onToggleFrequencyPicker={() => setShowFrequencyPicker((p) => !p)}
          onFrequencyChange={handleFrequencyChange}
          startDate={startDate}
          visibility={visibility}
          onSetVisibility={setVisibility}
          selectedGroupIds={selectedGroupIds}
          onToggleGroup={toggleGroup}
          circles={circles}
          sendNotification={sendNotification}
          onSetSendNotification={setSendNotification}
          hasCapacity={hasCapacity}
          onSetHasCapacity={setHasCapacity}
          capacityInput={capacityInput}
          onSetCapacityInput={setCapacityInput}
          pitchInEnabled={pitchInEnabled}
          onSetPitchInEnabled={setPitchInEnabled}
          pitchInAmount={pitchInAmount}
          onSetPitchInAmount={setPitchInAmount}
          pitchInMethod={pitchInMethod}
          onSetPitchInMethod={setPitchInMethod}
          pitchInHandle={pitchInHandle}
          onSetPitchInHandle={setPitchInHandle}
          pitchInNote={pitchInNote}
          onSetPitchInNote={setPitchInNote}
          bringListEnabled={bringListEnabled}
          onSetBringListEnabled={setBringListEnabled}
          bringListItems={bringListItems}
          onSetBringListItems={setBringListItems}
          bringListInput={bringListInput}
          onSetBringListInput={setBringListInput}
          showNudgeBanner={showNudgeBanner}
          onNudgeUpgrade={handleNudgeUpgrade}
          onNudgeDismiss={handleNudgeDismiss}
          entitlementsTimedOut={entitlementsTimedOut}
          entitlementsLoading={entitlementsLoading}
          hostingQuotaLoading={hostingQuota.isLoading}
          onRetryEntitlements={() => {
            setEntitlementsTimedOut(false);
            refetchEntitlements();
            hostingQuota.refetch();
          }}
          themed={themed}
          isDark={isDark}
          themeColor={themeColor}
          glassText={glassText}
          glassSecondary={glassSecondary}
          glassTertiary={glassTertiary}
          glassSurface={glassSurface}
          glassBorder={glassBorder}
          colors={colors}
        />
      </BottomSheet>

      {/* ── Cover Media Picker Sheet ── */}
      <CoverMediaPickerSheet
        visible={showCoverPicker}
        onClose={() => setShowCoverPicker(false)}
        onSelectCover={handleCoverSelect}
        onPickLocalImage={handlePickBanner}
        selectedCoverId={selectedCoverItem?.id}
      />

      {/* BottomNavigation removed — editor uses its own dock */}

      {/* Paywall Modal */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />

      {/* Prompt arbitration: exactly one modal per create success */}
      <NotificationPrePromptModal
        visible={createPromptChoice === "notification"}
        onClose={() => {
          setCreatePromptChoice("none");
          router.back();
        }}
        userId={session?.user?.id}
      />

      {/* [GROWTH_V1] Post-create event share prompt — shares the actual event */}
      <Modal
        visible={createPromptChoice === "share_event"}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setCreatePromptChoice("none");
          router.back();
        }}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onPress={() => {
            setCreatePromptChoice("none");
            router.back();
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: 24,
              paddingTop: 24,
              paddingBottom: 40,
            }}
          >
            {/* Handle bar */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>

            {/* Success header */}
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <Text style={{ fontSize: 28, marginBottom: 4 }}>{createdEvent?.emoji || "🎉"}</Text>
              <Text style={{ fontSize: 20, fontWeight: "700", color: glassText, textAlign: "center" }}>
                Your event is live!
              </Text>
              <Text style={{ fontSize: 14, color: glassSecondary, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
                Share it so friends can join
              </Text>
            </View>

            {/* Share CTA — primary */}
            <Pressable
              onPress={async () => {
                if (!createdEvent) return;
                try {
                  const startDate = new Date(createdEvent.startTime);
                  const endDate = createdEvent.endTime ? new Date(createdEvent.endTime) : null;
                  const dateStr = startDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                  const timeStr = endDate
                    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                    : startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  const payload = buildEventSharePayload({
                    id: createdEvent.id,
                    title: createdEvent.title,
                    emoji: createdEvent.emoji,
                    dateStr,
                    timeStr,
                    location: createdEvent.location,
                    description: createdEvent.description,
                  });
                  trackInviteShared({ entity: "event", sourceScreen: "create_success" });
                  await Share.share({ message: payload.message, title: createdEvent.title, url: payload.url });
                } catch (err) {
                  devError("[GROWTH_V1] share error:", err);
                }
                setCreatePromptChoice("none");
                router.back();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 16,
                borderRadius: 14,
                backgroundColor: themeColor,
              }}
            >
              <Share2 size={20} color="white" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "white", marginLeft: 8 }}>
                Share Event
              </Text>
            </Pressable>

            {/* Skip */}
            <Pressable
              onPress={() => {
                setCreatePromptChoice("none");
                router.back();
              }}
              style={{ alignItems: "center", paddingVertical: 14, marginTop: 4 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "500", color: glassSecondary }}>
                I'll share later
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Onboarding Guide Overlay */}
      {onboardingGuide.shouldShowStep("create_event") && (
        <OnboardingGuideOverlay
          step="create_event"
          onDismiss={() => onboardingGuide.dismissGuide()}
          onSkipAll={() => onboardingGuide.dismissGuide()}
          themeColor={themeColor}
          isDark={isDark}
          colors={colors}
          position="bottom"
        />
      )}
    </Animated.View>
  );
}
