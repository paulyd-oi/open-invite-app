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
  Switch,
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
  Clock,
  Users,
  Compass,
  ChevronDown,
  Check,
  X,
  RefreshCw,
  Calendar,
  Search,
  ArrowRight,
  Bell,
  BellOff,
  Sparkles,
  Lock,
  Share2,
  Camera,
} from "@/ui/icons";

import { trackEventCreated } from "@/lib/rateApp";
import { ALL_THEME_IDS, BASIC_THEME_IDS, EVENT_THEMES, isPremiumTheme, resolveEventTheme, type ThemeId } from "@/lib/eventThemes";
import { ThemeEffectLayer } from "@/components/ThemeEffectLayer";
import Animated, { FadeInDown, FadeIn, useAnimatedStyle, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { Image } from "react-native";
import { uploadByKind } from "@/lib/imageUpload";
import DateTimePicker from "@react-native-community/datetimepicker";

import BottomNavigation from "@/components/BottomNavigation";
import { CirclePhotoEmoji } from "@/components/CirclePhotoEmoji";
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
import EmojiPicker from "rn-emoji-keyboard";
import { buildEventSharePayload } from "@/lib/shareSSOT";
import { trackInviteShared } from "@/analytics/analyticsEventsSSOT";

const FREQUENCY_OPTIONS = [
  { value: "once", label: "One Time", icon: "📆" },
  { value: "weekly", label: "Weekly", icon: "🔄" },
  { value: "monthly", label: "Monthly", icon: "📅" },
];

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
  const [emoji, setEmoji] = useState(templateEmoji ?? "📅");
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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

  // Live theme preview — derive background color from selected theme
  const previewTheme = resolveEventTheme(selectedThemeId);
  const previewBg = selectedThemeId
    ? (isDark ? previewTheme.backBgDark : previewTheme.backBgLight)
    : colors.background;
  const previewBgStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(previewBg, { duration: 350 }),
  }), [previewBg]);

  // Glass treatment for form fields when theme is active
  const themed = !!selectedThemeId;
  const glassSurface = themed ? "rgba(255,255,255,0.10)" : colors.surface;
  const glassBorder = themed ? "rgba(255,255,255,0.15)" : colors.border;
  const glassText = themed ? "#FFFFFF" : colors.text;
  const glassSecondary = themed ? "rgba(255,255,255,0.6)" : colors.textSecondary;
  const glassTertiary = themed ? "rgba(255,255,255,0.4)" : colors.textTertiary;

  // Banner photo state
  const [bannerLocalUri, setBannerLocalUri] = useState<string | null>(null);
  const [bannerUpload, setBannerUpload] = useState<{ url: string; publicId: string } | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);

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
  };

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
      ...(selectedThemeId ? { themeId: selectedThemeId } : {}),
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
      <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Live theme particle effects — behind all content */}
      {selectedThemeId && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.45 }} pointerEvents="none">
          <ThemeEffectLayer themeId={selectedThemeId} />
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
          <View>
            <Text style={{ color: selectedThemeId ? "#FFFFFF" : colors.text }} className="text-3xl font-bold">Create Event</Text>
            <Text style={{ color: selectedThemeId ? "rgba(255,255,255,0.6)" : colors.textSecondary }} className="mt-1">Share what you're up to</Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: selectedThemeId ? "rgba(255,255,255,0.15)" : (isDark ? "#2C2C2E" : "#F3F4F6") }}
          >
            <X size={20} color={selectedThemeId ? "#FFFFFF" : colors.text} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: computedPaddingBottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isSmartMode && (
            <View
              style={{
                backgroundColor: "#ECFDF5",
                borderRadius: 12,
                padding: 12,
                marginBottom: 16,
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

          {/* Emoji Picker — tap to open rn-emoji-keyboard */}
          <Animated.View entering={FadeInDown.delay(0).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Event Icon</Text>
            <Pressable
              onPress={() => setShowEmojiPicker(true)}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}
            >
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: themed ? "rgba(255,255,255,0.12)" : (isDark ? "#2C2C2E" : "#FFF7ED") }}>
                  <Text className="text-2xl">{emoji}</Text>
                </View>
                <Text style={{ color: glassSecondary, fontSize: 15 }}>Tap to change icon</Text>
              </View>
            </Pressable>
          </Animated.View>

          {/* Event Theme Picker — Categorized Sections */}
          <Animated.View entering={FadeInDown.delay(25).springify()}>
            <Text style={{ color: glassSecondary, fontSize: 13, fontWeight: "500", marginBottom: 4 }}>Event Theme</Text>
            {([
              { label: "Basics", ids: ["neutral", "chill_hang", "dinner_night", "game_night", "worship_night"] },
              { label: "Seasonal", ids: ["spring_bloom", "spring_brunch", "summer_splash", "fall_harvest", "winter_glow", "easter", "fourth_of_july", "bonfire_night"] },
              { label: "Celebration", ids: ["birthday_bash", "celebration", "graduation", "party_night", "game_day", "luau"] },
              { label: "Elegant", ids: ["romance_elegant", "valentines", "garden_party"] },
            ] as { label: string; ids: ThemeId[] }[]).map((cat) => (
              <View key={cat.label}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: glassTertiary, marginTop: 8, marginBottom: 4, paddingLeft: 4 }}>{cat.label}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", gap: 8, paddingRight: 16 }}>
                    {cat.ids.map((tid) => {
                      const t = EVENT_THEMES[tid];
                      const selected = selectedThemeId === tid;
                      const premium = isPremiumTheme(tid);
                      const locked = premium && !userIsPro;
                      return (
                        <Pressable
                          key={tid}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedThemeId(selected ? null : tid);
                          }}
                          style={{
                            width: 84,
                            alignItems: "center",
                            paddingVertical: 10,
                            paddingHorizontal: 4,
                            borderRadius: 14,
                            borderWidth: selected ? 2 : 1,
                            borderColor: selected ? t.backAccent : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                            backgroundColor: selected
                              ? (isDark ? `${t.backAccent}18` : `${t.backAccent}0C`)
                              : (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"),
                            opacity: locked ? 0.65 : 1,
                          }}
                        >
                          <Text style={{ fontSize: 22, marginBottom: 4 }}>{t.swatch}</Text>
                          <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: "600", color: selected ? t.backAccent : glassSecondary, textAlign: "center", height: 26 }} numberOfLines={2}>
                            {t.label}
                          </Text>
                          {locked && (
                            <View style={{ position: "absolute", top: 4, right: 4 }}>
                              <Lock size={10} color={glassTertiary} />
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ))}
            <View style={{ height: 12 }} />
          </Animated.View>

          {/* Cover Photo — compact idle, full preview when selected */}
          <Animated.View entering={FadeInDown.delay(50).springify()}>
            {bannerLocalUri ? (
              <View className="rounded-xl mb-4 overflow-hidden" style={{ borderWidth: 1, borderColor: glassBorder }}>
                <Image source={{ uri: bannerLocalUri }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 11 }} />
                {uploadingBanner && (
                  <View style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", borderRadius: 11 }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 12, marginTop: 6, fontWeight: "600" }}>Uploading…</Text>
                  </View>
                )}
                <View style={{ position: "absolute", top: 8, right: 8, flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={handlePickBanner}
                    style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Change</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleRemoveBanner}
                    style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
                  >
                    <X size={14} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={handlePickBanner}
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
          <Animated.View entering={FadeInDown.delay(75).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Title *</Text>
            <TextInput
              testID="create-input-title"
              value={title}
              onChangeText={setTitle}
              placeholder="What are you doing?"
              placeholderTextColor={glassTertiary}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder, color: glassText }}
            />
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Description</Text>
            <TextInput
              testID="create-input-description"
              value={description}
              onChangeText={setDescription}
              placeholder="Add some details..."
              placeholderTextColor={glassTertiary}
              multiline
              numberOfLines={3}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder, color: glassText, minHeight: 80, textAlignVertical: "top" }}
            />
          </Animated.View>

          {/* Location with Search */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Location</Text>

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
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">When</Text>
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

          {/* Frequency (Recurring) - Only for non-circle events */}
          {!isCircleEvent && (
          <Animated.View entering={FadeInDown.delay(225).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Frequency</Text>
            <Pressable
              testID="create-select-frequency"
              onPress={() => setShowFrequencyPicker(!showFrequencyPicker)}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <RefreshCw size={18} color={themeColor} />
                  <Text style={{ color: glassText }} className="ml-3 font-medium">
                    {FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label}
                  </Text>
                </View>
                <ChevronDown size={20} color={glassTertiary} />
              </View>
            </Pressable>

            {showFrequencyPicker && (
              <View className="rounded-xl p-2 mb-4" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                {FREQUENCY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      handleFrequencyChange(option.value as "once" | "weekly" | "monthly");
                    }}
                    className="flex-row items-center p-3 rounded-lg mb-1"
                    style={{ backgroundColor: frequency === option.value ? `${themeColor}15` : "transparent" }}
                  >
                    <Text className="text-xl mr-3">{option.icon}</Text>
                    <Text
                      className="flex-1 font-medium"
                      style={{ color: frequency === option.value ? themeColor : glassText }}
                    >
                      {option.label}
                    </Text>
                    {frequency === option.value && <Check size={20} color={themeColor} />}
                  </Pressable>
                ))}
              </View>
            )}

            {frequency !== "once" && (
              <View className="rounded-xl p-3 mb-4 flex-row items-center" style={{ backgroundColor: `${themeColor}15` }}>
                <RefreshCw size={16} color={themeColor} />
                <Text style={{ color: themeColor }} className="ml-2 text-sm">
                  This event will repeat {frequency} starting{" "}
                  {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>
            )}
          </Animated.View>
          )}

          {/* Find Best Time — routes to Who's Free SSOT */}
          <Animated.View entering={FadeInDown.delay(245).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Need Help Picking a Time?</Text>
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

          {/* Visibility */}
          <Animated.View entering={FadeInDown.delay(250).springify()}>
            {isCircleEvent ? (
              <>
                {/* Group Only Visibility - Simplified */}
                <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Visibility</Text>
                <View className="rounded-xl p-3 mb-4 flex-row items-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                  <Lock size={16} color={glassSecondary} />
                  <Text className="text-sm ml-2" style={{ color: glassSecondary }}>
                    Only friends in this group can see and join.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Who's Invited?</Text>
                <View className="flex-row mb-4">
                  <Pressable
                    testID="create-select-visibility-all"
                    onPress={() => {
                      Haptics.selectionAsync();
                      setVisibility("all_friends");
                    }}
                    className="flex-1 rounded-xl p-4 mr-2 flex-row items-center justify-center"
                    style={{
                      backgroundColor: visibility === "all_friends" ? `${themeColor}15` : glassSurface,
                      borderWidth: 1,
                      borderColor: visibility === "all_friends" ? `${themeColor}40` : glassBorder
                    }}
                  >
                    <Compass size={18} color={visibility === "all_friends" ? themeColor : glassTertiary} />
                    <Text
                      className="ml-2 font-medium"
                      style={{ color: visibility === "all_friends" ? themeColor : glassSecondary }}
                    >
                      All Friends
                    </Text>
                  </Pressable>
                  <Pressable
                    testID="create-select-visibility-circles"
                    onPress={() => {
                      Haptics.selectionAsync();
                      setVisibility("specific_groups");
                    }}
                    className="flex-1 rounded-xl p-4 flex-row items-center justify-center"
                    style={{
                      backgroundColor: visibility === "specific_groups" ? "#4ECDC415" : glassSurface,
                      borderWidth: 1,
                      borderColor: visibility === "specific_groups" ? "#4ECDC440" : glassBorder
                    }}
                  >
                    <Users size={18} color={visibility === "specific_groups" ? "#4ECDC4" : glassTertiary} />
                    <Text
                      className="ml-2 font-medium"
                      style={{ color: visibility === "specific_groups" ? "#4ECDC4" : glassSecondary }}
                    >
                      Circles
                    </Text>
                  </Pressable>
                </View>

                {/* Circle Selection */}
                {visibility === "specific_groups" && (
                  <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                    <Text style={{ color: glassText }} className="text-sm font-medium mb-3">Select Circles</Text>
                    {circles.length === 0 ? (
                      <View className="items-center py-4">
                        <Text style={{ color: glassTertiary }} className="text-center mb-3">
                          No circles yet.
                        </Text>
                        <Pressable
                          onPress={() => router.push("/friends" as any)}
                          style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: themeColor }}
                        >
                          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>Go to Friends</Text>
                        </Pressable>
                      </View>
                    ) : (
                      circles.map((circle: Circle) => (
                        <Pressable
                          key={circle.id}
                          onPress={() => toggleGroup(circle.id)}
                          className="flex-row items-center p-3 rounded-lg mb-2"
                          style={{ backgroundColor: selectedGroupIds.includes(circle.id) ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F9FAFB" }}
                        >
                          <View
                            className="w-8 h-8 rounded-lg items-center justify-center mr-3 overflow-hidden"
                            style={{ backgroundColor: `${themeColor}20` }}
                          >
                            <CirclePhotoEmoji photoUrl={circle.photoUrl} emoji={circle.emoji} emojiClassName="text-base" />
                          </View>
                          <Text style={{ color: glassText }} className="flex-1 font-medium">{circle.name}</Text>
                          {selectedGroupIds.includes(circle.id) && (
                            <Check size={20} color={themeColor} />
                          )}
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </>
            )}
          </Animated.View>

          {/* Send Notification - Only for non-circle events */}
          {!isCircleEvent && (
          <Animated.View entering={FadeInDown.delay(275).springify()}>
            <Text style={{ color: glassSecondary }} className="text-sm font-medium mb-2">Send Notification</Text>
            <View className="flex-row mb-4">
              <Pressable
                testID="create-toggle-notification-yes"
                onPress={() => {
                  Haptics.selectionAsync();
                  setSendNotification(true);
                }}
                className="flex-1 rounded-xl p-4 mr-2 flex-row items-center justify-center"
                style={{
                  backgroundColor: sendNotification ? `${themeColor}15` : glassSurface,
                  borderWidth: 1,
                  borderColor: sendNotification ? `${themeColor}40` : glassBorder
                }}
              >
                <Bell size={18} color={sendNotification ? themeColor : glassTertiary} />
                <Text
                  className="ml-2 font-medium"
                  style={{ color: sendNotification ? themeColor : glassSecondary }}
                >
                  Yes
                </Text>
              </Pressable>
              <Pressable
                testID="create-toggle-notification-no"
                onPress={() => {
                  Haptics.selectionAsync();
                  setSendNotification(false);
                }}
                className="flex-1 rounded-xl p-4 flex-row items-center justify-center"
                style={{
                  backgroundColor: !sendNotification ? `${glassTertiary}15` : glassSurface,
                  borderWidth: 1,
                  borderColor: !sendNotification ? `${glassTertiary}40` : glassBorder
                }}
              >
                <BellOff size={18} color={!sendNotification ? glassSecondary : glassTertiary} />
                <Text
                  className="ml-2 font-medium"
                  style={{ color: !sendNotification ? glassSecondary : glassTertiary }}
                >
                  No
                </Text>
              </Pressable>
            </View>
            <Text style={{ color: glassTertiary }} className="text-xs mb-4 ml-1">
              {sendNotification
                ? visibility === "specific_groups"
                  ? "Friends in selected groups will be notified"
                  : "All friends will be notified about this event"
                : "No notifications will be sent"}
            </Text>
          </Animated.View>
          )}

          {/* Capacity */}
          <Animated.View entering={FadeInDown.delay(285).springify()}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1">
                <Text style={{ color: glassSecondary }} className="text-sm font-medium">Limit number of guests</Text>
                <Text style={{ color: glassTertiary }} className="text-xs mt-0.5">Once full, RSVPs close automatically.</Text>
              </View>
              <Switch
                value={hasCapacity}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setHasCapacity(value);
                  if (!value) setCapacityInput("");
                  else if (!capacityInput) setCapacityInput("6");
                }}
                trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
                thumbColor={hasCapacity ? themeColor : glassTertiary}
              />
            </View>
            {hasCapacity && (
              <View className="rounded-xl p-3 mb-4 flex-row items-center justify-between" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                <Text style={{ color: glassSecondary }} className="text-sm">Max guests</Text>
                <View className="flex-row items-center">
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      const current = parseInt(capacityInput) || 2;
                      if (current > 2) setCapacityInput(String(current - 1));
                    }}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: themed ? "rgba(255,255,255,0.08)" : colors.background }}
                  >
                    <Text style={{ color: parseInt(capacityInput || "2") <= 2 ? glassTertiary : glassText }} className="text-xl font-medium">−</Text>
                  </Pressable>
                  <Text style={{ color: glassText }} className="text-lg font-semibold mx-4 min-w-[32px] text-center">
                    {capacityInput || "2"}
                  </Text>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      const current = parseInt(capacityInput) || 2;
                      if (current < 100) setCapacityInput(String(current + 1));
                    }}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{ backgroundColor: themed ? "rgba(255,255,255,0.08)" : colors.background }}
                  >
                    <Text style={{ color: parseInt(capacityInput || "2") >= 100 ? glassTertiary : themeColor }} className="text-xl font-medium">+</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </Animated.View>

          {/* Pitch In V1 — payment handle for cost sharing */}
          <Animated.View entering={FadeInDown.delay(290).springify()}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1">
                <Text style={{ color: glassSecondary }} className="text-sm font-medium">Pitch In</Text>
                <Text style={{ color: glassTertiary }} className="text-xs mt-0.5">Let guests chip in for costs.</Text>
              </View>
              <Switch
                value={pitchInEnabled}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setPitchInEnabled(value);
                  if (!value) {
                    setPitchInHandle("");
                    setPitchInAmount("");
                    setPitchInNote("");
                  }
                }}
                trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
                thumbColor={pitchInEnabled ? themeColor : glassTertiary}
              />
            </View>
            {pitchInEnabled && (
              <Animated.View entering={FadeInDown.delay(50).springify()}>
                {/* Amount input */}
                <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                  <TextInput
                    value={pitchInAmount}
                    onChangeText={setPitchInAmount}
                    placeholder="Suggested amount (e.g. $10)"
                    placeholderTextColor={glassTertiary}
                    style={{ fontSize: 14, color: glassText }}
                    keyboardType="default"
                  />
                </View>

                {/* Payment method picker */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 10 }} contentContainerStyle={{ gap: 6 }}>
                  {([
                    { key: "venmo" as const, label: "Venmo" },
                    { key: "cashapp" as const, label: "Cash App" },
                    { key: "paypal" as const, label: "PayPal" },
                    { key: "other" as const, label: "Other" },
                  ]).map(({ key, label }) => (
                    <Pressable
                      key={key}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPitchInMethod(key);
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 10,
                        backgroundColor: pitchInMethod === key ? `${themeColor}18` : glassSurface,
                        borderWidth: 1,
                        borderColor: pitchInMethod === key ? themeColor : glassBorder,
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: pitchInMethod === key ? "600" : "400",
                        color: pitchInMethod === key ? themeColor : glassSecondary,
                      }}>
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* Handle input with @ prefix for Venmo/Cash App */}
                <View className="rounded-xl p-3 mb-3 flex-row items-center" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                  {(pitchInMethod === "venmo" || pitchInMethod === "cashapp") && (
                    <Text style={{ fontSize: 14, color: glassTertiary, marginRight: 2 }}>@</Text>
                  )}
                  <TextInput
                    value={pitchInHandle}
                    onChangeText={setPitchInHandle}
                    placeholder={pitchInMethod === "venmo" ? "username" : pitchInMethod === "cashapp" ? "cashtag" : pitchInMethod === "paypal" ? "PayPal email or username" : "Handle or username"}
                    placeholderTextColor={glassTertiary}
                    style={{ fontSize: 14, color: glassText, flex: 1 }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Note presets + input */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
                  {[
                    "Help cover snacks and drinks",
                    "Help cover venue costs",
                    "Help cover supplies",
                    "Help support the event",
                    "Totally optional, but appreciated",
                  ].map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPitchInNote(preset);
                      }}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 16,
                        backgroundColor: pitchInNote === preset ? `${themeColor}18` : glassSurface,
                        borderWidth: 1,
                        borderColor: pitchInNote === preset ? themeColor : glassBorder,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: pitchInNote === preset ? themeColor : glassSecondary }}>
                        {preset}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                  <TextInput
                    value={pitchInNote}
                    onChangeText={setPitchInNote}
                    placeholder="Note (e.g. for food & drinks)"
                    placeholderTextColor={glassTertiary}
                    style={{ fontSize: 14, color: glassText }}
                    maxLength={100}
                  />
                </View>
              </Animated.View>
            )}
          </Animated.View>

          {/* What to Bring V2 — item list builder */}
          <Animated.View entering={FadeInDown.delay(295).springify()}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1">
                <Text style={{ color: glassSecondary }} className="text-sm font-medium">What to bring</Text>
                <Text style={{ color: glassTertiary }} className="text-xs mt-0.5">Guests can claim items to bring.</Text>
              </View>
              <Switch
                value={bringListEnabled}
                onValueChange={(value) => {
                  Haptics.selectionAsync();
                  setBringListEnabled(value);
                  if (!value) {
                    setBringListItems([]);
                    setBringListInput("");
                  }
                }}
                trackColor={{ false: themed ? "rgba(255,255,255,0.15)" : colors.separator, true: `${themeColor}80` }}
                thumbColor={bringListEnabled ? themeColor : glassTertiary}
              />
            </View>
            {bringListEnabled && (
              <Animated.View entering={FadeInDown.delay(50).springify()}>
                {/* Add item row */}
                <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
                  <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}>
                    <TextInput
                      value={bringListInput}
                      onChangeText={setBringListInput}
                      placeholder="e.g. Chips, Ice, Cups..."
                      placeholderTextColor={glassTertiary}
                      style={{ fontSize: 14, color: glassText }}
                      maxLength={60}
                      onSubmitEditing={() => {
                        const trimmed = bringListInput.trim();
                        if (trimmed && bringListItems.length < 20) {
                          setBringListItems((prev) => [...prev, trimmed]);
                          setBringListInput("");
                        }
                      }}
                      returnKeyType="done"
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      const trimmed = bringListInput.trim();
                      if (trimmed && bringListItems.length < 20) {
                        Haptics.selectionAsync();
                        setBringListItems((prev) => [...prev, trimmed]);
                        setBringListInput("");
                      }
                    }}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: bringListInput.trim() ? themeColor : glassSurface,
                      borderWidth: 1,
                      borderColor: bringListInput.trim() ? themeColor : glassBorder,
                    }}
                  >
                    <Text style={{ fontSize: 20, fontWeight: "500", color: bringListInput.trim() ? "white" : glassTertiary }}>+</Text>
                  </Pressable>
                </View>
                {/* Item list */}
                {bringListItems.length > 0 && (
                  <View className="mb-4" style={{ gap: 6 }}>
                    {/* INVARIANT_ALLOW_SMALL_MAP */}
                    {bringListItems.map((item, index) => (
                      <View
                        key={`${item}-${index}`}
                        className="flex-row items-center rounded-xl px-3 py-2.5"
                        style={{ backgroundColor: glassSurface, borderWidth: 1, borderColor: glassBorder }}
                      >
                        <Text style={{ fontSize: 14, color: glassText, flex: 1 }}>{item}</Text>
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync();
                            setBringListItems((prev) => prev.filter((_, i) => i !== index));
                          }}
                          hitSlop={8}
                        >
                          <X size={16} color={glassTertiary} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </Animated.View>
            )}
          </Animated.View>

          {/* [P1_HOSTING_NUDGE] Soft nudge banner — premium themes upsell */}
          {showNudgeBanner && (
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              style={{
                backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED",
                borderRadius: 12,
                padding: 14,
                marginTop: 12,
                borderWidth: 1,
                borderColor: isDark ? "#3A3A3C" : "#FDBA74",
              }}
            >
              <Text style={{ color: glassText, fontWeight: "600", fontSize: 14, marginBottom: 4 }}>
                Make your event stand out
              </Text>
              <Text style={{ color: glassSecondary, fontSize: 13, lineHeight: 18, marginBottom: 10 }}>
                Unlock premium themes, effects, and seasonal collections with Pro.
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={handleNudgeUpgrade}
                  style={{
                    backgroundColor: themeColor,
                    borderRadius: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 13 }}>Upgrade</Text>
                </Pressable>
                <Pressable
                  onPress={handleNudgeDismiss}
                  style={{
                    borderRadius: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text style={{ color: glassTertiary, fontSize: 13 }}>Not now</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* Hosting is unlimited for all tiers — quota indicator removed */}

          {/* [P1_CREATE_ENTITLEMENTS_TIMEOUT] Entitlements loading timeout message */}
          {entitlementsTimedOut && (entitlementsLoading || hostingQuota.isLoading) && (
            <View
              className="rounded-xl p-3 mt-3"
              style={{ backgroundColor: isDark ? "#332B00" : "#FFFBEB", borderColor: "#F59E0B40", borderWidth: 1 }}
            >
              <Text className="text-xs text-center mb-2" style={{ color: isDark ? "#FCD34D" : "#92400E" }}>
                Still loading your plan details...
              </Text>
              <Pressable
                onPress={() => {
                  setEntitlementsTimedOut(false);
                  refetchEntitlements();
                  hostingQuota.refetch();
                }}
                className="self-center px-4 py-1.5 rounded-lg"
                style={{ backgroundColor: "#F59E0B20" }}
              >
                <Text className="text-xs font-semibold" style={{ color: "#F59E0B" }}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Create Button */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
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
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomNavigation />

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
      <EmojiPicker
        open={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelected={(emojiObject) => {
          setEmoji(emojiObject.emoji);
          Haptics.selectionAsync();
          setShowEmojiPicker(false);
        }}
      />
    </SafeAreaView>
    </Animated.View>
  );
}
