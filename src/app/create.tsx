import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
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
} from "@/ui/icons";

import { trackEventCreated } from "@/lib/rateApp";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import DateTimePicker from "@react-native-community/datetimepicker";

import BottomNavigation from "@/components/BottomNavigation";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { safeToast } from "@/lib/safeToast";
import { toUserMessage, logError } from "@/lib/errors";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { NotificationNudgeModal } from "@/components/notifications/NotificationNudgeModal";
import { useEntitlements, canCreateEvent, type PaywallContext } from "@/lib/entitlements";
import { SoftLimitModal } from "@/components/SoftLimitModal";
import { useSubscription } from "@/lib/SubscriptionContext";
import {
  MAX_ACTIVE_EVENTS_FREE,
  getActiveEventCount,
  hasShownActiveEventsPrompt,
  markActiveEventsPromptShown,
} from "@/lib/softLimits";
import {
  type CreateEventRequest,
  type CreateEventResponse,
  type GetCirclesResponse,
  type Circle,
  type GetProfilesResponse,
  type GetEventsResponse,
} from "@/shared/contracts";
import { EventCategoryPicker, type EventCategory } from "@/components/EventCategoryPicker";
import { SuggestedTimesPicker } from "@/components/SuggestedTimesPicker";
import { getPendingIcsImport } from "@/lib/deepLinks";

// Comprehensive emoji preset list - frequently used, well-supported across devices
const EMOJI_OPTIONS = [
  // Activities & Sports
  "🏃", "🚴", "🏊", "⚽", "🏀", "🎾", "🏋️", "🧘", "⛳", "🎳",
  // Food & Drinks
  "🍽️", "☕", "🍕", "🍔", "🍣", "🍜", "🍻", "🍷", "🧁", "🍦",
  // Entertainment
  "🎬", "🎮", "🎤", "🎵", "🎸", "🎨", "🎭", "📺", "🎯", "🎲",
  // Social & Celebrations
  "🎉", "🎂", "🥳", "💃", "🕺", "👯", "🤝", "💬", "❤️", "🔥",
  // Travel & Places
  "✈️", "🚗", "🏖️", "⛰️", "🏕️", "🌴", "🌆", "🏠", "🏢", "🌎",
  // Work & Study
  "📅", "💼", "📚", "✏️", "💻", "📱", "🎓", "📝", "🗓️", "⏰",
  // Nature & Weather
  "☀️", "🌙", "⭐", "🌸", "🌻", "🐶", "🐱", "🦋", "🌈", "❄️",
  // Health & Wellness
  "💪", "🧠", "💊", "🩺", "😴", "🧘", "🏥", "💆", "🛁", "🌿",
];

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
const searchPlacesViaBackend = async (query: string, lat?: number, lon?: number): Promise<PlaceSuggestion[]> => {
  if (!query || query.length < 2) return [];

  try {
    // Check for truthy value (not just undefined) to handle empty string case
    const RENDER_BACKEND_URL = "https://open-invite-api.onrender.com";
    const vibecodeSandboxUrl = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
    const rawBackendUrl = vibecodeSandboxUrl && vibecodeSandboxUrl.length > 0
      ? vibecodeSandboxUrl
      : RENDER_BACKEND_URL;
    // Remove trailing slashes to prevent double-slash URLs
    const backendUrl = rawBackendUrl.replace(/\/+$/, "");

    // Build URL with optional location parameters
    let url = `${backendUrl}/api/places/search?query=${encodeURIComponent(query)}`;
    if (lat !== undefined && lon !== undefined) {
      url += `&lat=${lat}&lon=${lon}`;
    }

    console.log("[create.tsx] Searching places:", url);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

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
      console.log("[create.tsx] Places API error:", response.status, response.statusText);
      return searchPlacesLocal(query);
    }

    const data = await response.json();
    console.log("[create.tsx] Places API response:", JSON.stringify(data).slice(0, 200));

    if (data.places && data.places.length > 0) {
      console.log("[create.tsx] Found", data.places.length, "places from API");
      return data.places;
    }

    // If backend returns no results or error, use local fallback
    if (data.error) {
      console.log("[create.tsx] Places API returned error:", data.error);
    }
    console.log("[create.tsx] No places from API, using local fallback");
    return searchPlacesLocal(query);
  } catch (error: any) {
    console.log("[create.tsx] Places search error:", error?.message || error);
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
const searchPlaces = async (query: string, lat?: number, lon?: number): Promise<PlaceSuggestion[]> => {
  return searchPlacesViaBackend(query, lat, lon);
};

export default function CreateEventScreen() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { date, template, emoji: templateEmoji, title: templateTitle, duration, circleId } = useLocalSearchParams<{
    date?: string;
    template?: string;
    emoji?: string;
    title?: string;
    duration?: string;
    circleId?: string;
  }>();
  const { themeColor, isDark, colors } = useTheme();

  // Check if creating from a circle
  const isCircleEvent = !!circleId;

  // Check active profile to redirect business profiles to business event creation
  const { data: profilesData } = useQuery({
    queryKey: ["profiles"],
    queryFn: () => api.get<GetProfilesResponse>("/api/profile"),
    enabled: bootStatus === 'authed',
    staleTime: 60000,
  });

  const activeProfile = profilesData?.activeProfile;

  // Fetch user location for location-biased place search
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
        console.log("Could not get user location for search biasing");
      }
    };
    fetchUserLocation();
  }, []);

  // Initialize date from URL param or use current date
  const getInitialDate = () => {
    if (date) {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }
    return new Date();
  };

  const [title, setTitle] = useState(templateTitle ?? "");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [emoji, setEmoji] = useState(templateEmoji ?? "📅");
  const [startDate, setStartDate] = useState(getInitialDate);
  const [endDate, setEndDate] = useState(() => {
    const initial = getInitialDate();
    return new Date(initial.getTime() + 60 * 60 * 1000); // Default: start + 1 hour
  });
  const [userModifiedEndTime, setUserModifiedEndTime] = useState(false); // Track if user manually changed end time
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [visibility, setVisibility] = useState<"all_friends" | "specific_groups" | "circle_only">(
    isCircleEvent ? "circle_only" : "all_friends"
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [frequency, setFrequency] = useState<"once" | "weekly" | "monthly">("once");
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);
  const [customEmojiInput, setCustomEmojiInput] = useState("");
  const [sendNotification, setSendNotification] = useState(true);
  const [category, setCategory] = useState<EventCategory | null>(null);
  const [isPrivateCircleEvent, setIsPrivateCircleEvent] = useState(true); // Default to private for circle events
  const [circleEventMode, setCircleEventMode] = useState<"open_invite" | "set_rsvp">("open_invite"); // Default to Open Invite for lower friction

  // Paywall and notification modal state
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [paywallContext, setPaywallContext] = useState<PaywallContext>("ACTIVE_EVENTS_LIMIT");
  const [showNotificationNudge, setShowNotificationNudge] = useState(false);
  const [showSoftLimitModal, setShowSoftLimitModal] = useState(false);

  // Fetch entitlements for gating
  const { data: entitlements, refetch: refetchEntitlements } = useEntitlements();
  const { isPremium, openPaywall } = useSubscription();

  // Check for pending ICS import on mount
  useEffect(() => {
    const loadPendingImport = async () => {
      const pendingImport = await getPendingIcsImport();
      if (pendingImport) {
        console.log('[Create Event] Loading ICS import:', pendingImport.title);
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

  // Debounced place search with location biasing
  useEffect(() => {
    if (!locationQuery || locationQuery.length < 2) {
      setPlaceSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearchingPlaces(true);
      try {
        const results = await searchPlaces(
          locationQuery,
          userLocation?.lat,
          userLocation?.lon
        );
        setPlaceSuggestions(results);
      } catch (error) {
        console.error("Error searching places:", error);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [locationQuery, userLocation]);

  const handleSelectPlace = (place: PlaceSuggestion) => {
    Haptics.selectionAsync();
    setSelectedPlace(place);
    setLocation(place.fullAddress);
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
    queryKey: ["circles"],
    queryFn: () => api.get<GetCirclesResponse>("/api/circles"),
    enabled: !!session,
  });

  const circles = circlesData?.circles ?? [];

  // Fetch my events for active event counting (soft-limit check)
  const { data: myEventsData } = useQuery({
    queryKey: ["events", "mine"],
    queryFn: () => api.get<GetEventsResponse>("/api/events/mine"),
    enabled: !!session && !isPremium,
  });

  const myEvents = myEventsData?.events ?? [];
  const activeEventCount = getActiveEventCount(myEvents);

  const createMutation = useMutation({
    mutationFn: (data: CreateEventRequest) =>
      api.post<CreateEventResponse>("/api/events", data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Track for rate app prompt
      trackEventCreated();
      // Invalidate all event-related queries to refresh calendar and feed
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["events", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["events", "feed"] });
      // Invalidate entitlements to refresh usage counts
      queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      // Also invalidate circle queries if this is a circle event
      if (circleId) {
        queryClient.invalidateQueries({ queryKey: ["circle", circleId] });
        queryClient.invalidateQueries({ queryKey: ["circles"] });
      }
      // Check if we should show notification nudge (after 600ms)
      checkNotificationNudge();
      router.back();
    },
    onError: (error) => {
      logError("Create Event", error);
      const { title, message } = toUserMessage(error);
      safeToast.error(title, message || "Failed to create event. Please try again.");
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

  // Check notification nudge eligibility after successful create
  const checkNotificationNudge = async () => {
    try {
      const response = await api.get<{ eligible: boolean }>("/api/notifications/nudge-eligibility");
      if (response.eligible) {
        // Wait 600ms as per spec
        setTimeout(() => {
          setShowNotificationNudge(true);
        }, 600);
      }
    } catch (error) {
      console.log("[CreateEvent] Error checking nudge eligibility:", error);
    }
  };

  const handleCreate = () => {
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

    // Soft-limit check: Show upgrade prompt for free users hitting active events limit
    if (!isPremium && activeEventCount >= MAX_ACTIVE_EVENTS_FREE && !hasShownActiveEventsPrompt()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      markActiveEventsPromptShown();
      setShowSoftLimitModal(true);
      return;
    }

    // Check entitlements before creating
    const isRecurring = frequency !== "once";
    const check = canCreateEvent(entitlements, isRecurring);

    if (!check.allowed && check.context) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setPaywallContext(check.context);
      setShowPaywallModal(true);
      return;
    }

    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
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
    });
  };

  // Handle soft-limit modal upgrade action
  const handleSoftLimitUpgrade = async () => {
    setShowSoftLimitModal(false);
    // Try to open paywall directly, or route to subscription page as fallback
    const result = await openPaywall();
    if (!result.ok && result.error) {
      // If openPaywall fails, route to subscription page
      router.push("/subscription?source=soft_limit_active_events");
    }
  };

  const handleSoftLimitDismiss = () => {
    setShowSoftLimitModal(false);
    // User can continue creating the event after dismissing
  };

  const toggleGroup = (groupId: string) => {
    Haptics.selectionAsync();
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ color: colors.text }} className="text-xl font-semibold mb-2">
            Sign in to create events
          </Text>
          <Pressable
            onPress={() => router.replace("/login")}
            className="px-6 py-3 rounded-full mt-4"
            style={{ backgroundColor: themeColor }}
          >
            <Text className="text-white font-semibold">Sign In</Text>
          </Pressable>
        </View>
        <BottomNavigation />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <View className="px-5 pt-2 pb-4 flex-row items-center justify-between">
          <View>
            <Text style={{ color: colors.text }} className="text-3xl font-bold">Create Event</Text>
            <Text style={{ color: colors.textSecondary }} className="mt-1">Share what you're up to</Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
          >
            <X size={20} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Emoji Picker */}
          <Animated.View entering={FadeInDown.delay(0).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Event Icon</Text>
            <Pressable
              onPress={() => setShowEmojiPicker(!showEmojiPicker)}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#FFF7ED" }}>
                    <Text className="text-2xl">{emoji}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary }}>Tap to change icon</Text>
                </View>
                <ChevronDown size={20} color={colors.textTertiary} />
              </View>
            </Pressable>

            {showEmojiPicker && (
              <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                {/* Custom Emoji Input */}
                <View className="mb-4">
                  <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Type custom emoji</Text>
                  <View className="flex-row items-center">
                    <TextInput
                      value={customEmojiInput}
                      onChangeText={(text) => {
                        // Only keep the last emoji character entered
                        const emojis = [...text].filter((char) => {
                          const codePoint = char.codePointAt(0) || 0;
                          return codePoint > 127;
                        });
                        if (emojis.length > 0) {
                          const lastEmoji = emojis[emojis.length - 1];
                          setCustomEmojiInput(lastEmoji);
                          setEmoji(lastEmoji);
                          Haptics.selectionAsync();
                        } else {
                          setCustomEmojiInput(text);
                        }
                      }}
                      placeholder="Tap to open emoji keyboard"
                      placeholderTextColor={colors.textTertiary}
                      className="flex-1 rounded-xl p-4 text-center text-2xl"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB", color: colors.text }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {customEmojiInput && (
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          setEmoji(customEmojiInput);
                          setShowEmojiPicker(false);
                          setCustomEmojiInput("");
                        }}
                        className="ml-2 px-4 py-3 rounded-xl"
                        style={{ backgroundColor: themeColor }}
                      >
                        <Text className="text-white font-semibold">Use</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Divider */}
                <View className="flex-row items-center mb-4">
                  <View className="flex-1 h-px" style={{ backgroundColor: colors.separator }} />
                  <Text style={{ color: colors.textTertiary }} className="mx-3 text-sm">or pick from below</Text>
                  <View className="flex-1 h-px" style={{ backgroundColor: colors.separator }} />
                </View>

                {/* Preset Emojis - organized by category */}
                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {[
                    { label: "Activities", emojis: EMOJI_OPTIONS.slice(0, 10) },
                    { label: "Food & Drinks", emojis: EMOJI_OPTIONS.slice(10, 20) },
                    { label: "Entertainment", emojis: EMOJI_OPTIONS.slice(20, 30) },
                    { label: "Social", emojis: EMOJI_OPTIONS.slice(30, 40) },
                    { label: "Travel", emojis: EMOJI_OPTIONS.slice(40, 50) },
                    { label: "Work & Study", emojis: EMOJI_OPTIONS.slice(50, 60) },
                    { label: "Nature", emojis: EMOJI_OPTIONS.slice(60, 70) },
                    { label: "Wellness", emojis: EMOJI_OPTIONS.slice(70, 80) },
                  ].map((category) => (
                    <View key={category.label} className="mb-3">
                      <Text style={{ color: colors.textTertiary }} className="text-xs font-medium mb-2 uppercase tracking-wide">
                        {category.label}
                      </Text>
                      <View className="flex-row flex-wrap">
                        {category.emojis.map((e) => (
                          <Pressable
                            key={e}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setEmoji(e);
                              setShowEmojiPicker(false);
                              setCustomEmojiInput("");
                            }}
                            className="w-11 h-11 rounded-xl items-center justify-center mr-2 mb-2"
                            style={{ backgroundColor: emoji === e ? `${themeColor}20` : isDark ? "#2C2C2E" : "#F9FAFB" }}
                          >
                            <Text className="text-xl">{e}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </Animated.View>

          {/* Title */}
          <Animated.View entering={FadeInDown.delay(50).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Title *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What are you doing?"
              placeholderTextColor={colors.textTertiary}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text }}
            />
          </Animated.View>

          {/* Description */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Add some details..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, minHeight: 80, textAlignVertical: "top" }}
            />
          </Animated.View>

          {/* Location with Search */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Location</Text>

            {/* Selected Place Display */}
            {selectedPlace && !showLocationSearch ? (
              <Pressable
                onPress={() => {
                  setShowLocationSearch(true);
                  setLocationQuery(location);
                }}
                className="rounded-xl mb-4 p-4"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: "#4ECDC440" }}
              >
                <View className="flex-row items-start">
                  <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#4ECDC420" }}>
                    <MapPin size={20} color="#4ECDC4" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: colors.text }} className="font-semibold">{selectedPlace.name}</Text>
                    <Text style={{ color: colors.textSecondary }} className="text-sm mt-1">{selectedPlace.address}</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setSelectedPlace(null);
                      setLocation("");
                      setLocationQuery("");
                    }}
                    className="p-1"
                  >
                    <X size={18} color={colors.textTertiary} />
                  </Pressable>
                </View>
              </Pressable>
            ) : (
              <View className="mb-4">
                {/* Search Input */}
                <View className="rounded-xl flex-row items-center px-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                  <Search size={18} color={colors.textTertiary} />
                  <TextInput
                    value={showLocationSearch ? locationQuery : location}
                    onChangeText={handleLocationInputChange}
                    onFocus={() => {
                      setShowLocationSearch(true);
                      setLocationQuery(location);
                    }}
                    placeholder="Search for a place..."
                    placeholderTextColor={colors.textTertiary}
                    className="flex-1 p-4"
                    style={{ color: colors.text }}
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
                    style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  >
                    {placeSuggestions.map((place, index) => (
                      <Pressable
                        key={`${place.id}-${index}`}
                        onPress={() => handleSelectPlace(place)}
                        className="p-4 flex-row items-center"
                        style={{ borderBottomWidth: index < placeSuggestions.length - 1 ? 1 : 0, borderBottomColor: colors.separator }}
                      >
                        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                          {index === 0 ? (
                            <ArrowRight size={18} color="#4ECDC4" />
                          ) : (
                            <MapPin size={18} color={colors.textTertiary} />
                          )}
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: colors.text }} className="font-medium">{place.name}</Text>
                          <Text style={{ color: colors.textSecondary }} className="text-sm" numberOfLines={1}>
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
                      {locationQuery && !selectedPlace ? "Use this location" : "Close"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </Animated.View>

          {/* Date & Time */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">When</Text>
            <View 
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              {/* Start Row */}
              <View className="flex-row items-center justify-between mb-3">
                <Text style={{ color: colors.textSecondary }} className="text-xs font-medium w-12">START</Text>
                <View className="flex-row flex-1">
                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    className="flex-1 rounded-lg p-2 mr-2 flex-row items-center justify-center"
                    style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
                  >
                    <Calendar size={14} color={themeColor} />
                    <Text style={{ color: colors.text }} className="ml-1 text-sm font-medium">
                      {startDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowTimePicker(true)}
                    className="flex-1 rounded-lg p-2 flex-row items-center justify-center"
                    style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
                  >
                    <Clock size={14} color="#4ECDC4" />
                    <Text style={{ color: colors.text }} className="ml-1 text-sm font-medium">
                      {startDate.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* End Row */}
              <View className="flex-row items-center justify-between">
                <Text style={{ color: colors.textSecondary }} className="text-xs font-medium w-12">END</Text>
                <View className="flex-row flex-1">
                  <Pressable
                    onPress={() => setShowEndDatePicker(true)}
                    className="flex-1 rounded-lg p-2 mr-2 flex-row items-center justify-center"
                    style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
                  >
                    <Calendar size={14} color={themeColor} />
                    <Text style={{ color: colors.text }} className="ml-1 text-sm font-medium">
                      {endDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setShowEndTimePicker(true)}
                    className="flex-1 rounded-lg p-2 flex-row items-center justify-center"
                    style={{ backgroundColor: isDark ? "#1C1C1E" : "#F3F4F6" }}
                  >
                    <Clock size={14} color="#4ECDC4" />
                    <Text style={{ color: colors.text }} className="ml-1 text-sm font-medium">
                      {endDate.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {showDatePicker && (
              <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                {/* Month and Day picker - main picker */}
                <View className="flex-row items-center justify-center px-4 pt-3">
                  <Text style={{ color: colors.textSecondary }} className="text-sm font-medium">
                    {startDate.getFullYear()}
                  </Text>
                  <Pressable
                    onPress={() => {
                      // Toggle to show year adjustment
                      const newDate = new Date(startDate);
                      newDate.setFullYear(newDate.getFullYear() - 1);
                      setStartDate(newDate);
                    }}
                    className="ml-2 px-2 py-1 rounded"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text style={{ color: colors.textTertiary }} className="text-xs">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const newDate = new Date(startDate);
                      newDate.setFullYear(newDate.getFullYear() + 1);
                      setStartDate(newDate);
                    }}
                    className="ml-1 px-2 py-1 rounded"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text style={{ color: colors.textTertiary }} className="text-xs">+1</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, date) => {
                    if (Platform.OS === "android") {
                      setShowDatePicker(false);
                    }
                    if (date) setStartDate(date);
                  }}
                  style={{ height: 150 }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    className="py-3 items-center"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {showTimePicker && (
              <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <View className="py-2">
                  <DateTimePicker
                    value={startDate}
                    mode="time"
                    display={Platform.OS === "ios" ? "compact" : "default"}
                    textColor={isDark ? "#FFFFFF" : "#000000"}
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(event, date) => {
                      if (Platform.OS === "android") {
                        setShowTimePicker(false);
                      }
                      if (date) setStartDate(date);
                    }}
                  />
                </View>
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowTimePicker(false)}
                    className="py-2 items-center"
                    style={{ backgroundColor: themeColor, borderRadius: 8, marginHorizontal: 8, marginBottom: 8 }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* End Date Picker */}
            {showEndDatePicker && (
              <View className="rounded-xl mb-4 overflow-hidden" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                {/* Month and Day picker - main picker */}
                <View className="flex-row items-center justify-center px-4 pt-3">
                  <Text style={{ color: colors.textSecondary }} className="text-sm font-medium">
                    {endDate.getFullYear()}
                  </Text>
                  <Pressable
                    onPress={() => {
                      const newDate = new Date(endDate);
                      newDate.setFullYear(newDate.getFullYear() - 1);
                      setEndDate(newDate);
                      setUserModifiedEndTime(true);
                    }}
                    className="ml-2 px-2 py-1 rounded"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text style={{ color: colors.textTertiary }} className="text-xs">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const newDate = new Date(endDate);
                      newDate.setFullYear(newDate.getFullYear() + 1);
                      setEndDate(newDate);
                      setUserModifiedEndTime(true);
                    }}
                    className="ml-1 px-2 py-1 rounded"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Text style={{ color: colors.textTertiary }} className="text-xs">+1</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={endDate}
                  mode="date"
                  display="spinner"
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, date) => {
                    if (Platform.OS === "android") {
                      setShowEndDatePicker(false);
                    }
                    if (date) {
                      setEndDate(date);
                      setUserModifiedEndTime(true);
                    }
                  }}
                  style={{ height: 150 }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowEndDatePicker(false)}
                    className="py-3 items-center"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* End Time Picker */}
            {showEndTimePicker && (
              <View className="rounded-xl mb-4 overflow-hidden p-2" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <DateTimePicker
                  value={endDate}
                  mode="time"
                  display={Platform.OS === "ios" ? "compact" : "default"}
                  textColor={isDark ? "#FFFFFF" : "#000000"}
                  themeVariant={isDark ? "dark" : "light"}
                  onChange={(event, date) => {
                    if (Platform.OS === "android") {
                      setShowEndTimePicker(false);
                    }
                    if (date) {
                      setEndDate(date);
                      setUserModifiedEndTime(true);
                    }
                  }}
                />
                {Platform.OS === "ios" && (
                  <Pressable
                    onPress={() => setShowEndTimePicker(false)}
                    className="py-2 items-center mt-2"
                    style={{ backgroundColor: themeColor, borderRadius: 8 }}
                  >
                    <Text className="text-white font-semibold">Done</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Animated.View>

          {/* Frequency (Recurring) */}
          <Animated.View entering={FadeInDown.delay(225).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Frequency</Text>
            <Pressable
              onPress={() => setShowFrequencyPicker(!showFrequencyPicker)}
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <RefreshCw size={18} color={themeColor} />
                  <Text style={{ color: colors.text }} className="ml-3 font-medium">
                    {FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label}
                  </Text>
                </View>
                <ChevronDown size={20} color={colors.textTertiary} />
              </View>
            </Pressable>

            {showFrequencyPicker && (
              <View className="rounded-xl p-2 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
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
                      style={{ color: frequency === option.value ? themeColor : colors.text }}
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

          {/* Category */}
          <Animated.View entering={FadeInDown.delay(235).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Category (Optional)</Text>
            <View className="mb-4">
              <EventCategoryPicker
                selectedCategory={category}
                onCategoryChange={setCategory}
              />
            </View>
          </Animated.View>

          {/* Suggested Times */}
          <Animated.View entering={FadeInDown.delay(245).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Need Help Picking a Time?</Text>
            <View className="mb-4">
              <SuggestedTimesPicker
                onSelectTime={(time) => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setStartDate(time);
                }}
              />
            </View>
          </Animated.View>

          {/* Visibility */}
          <Animated.View entering={FadeInDown.delay(250).springify()}>
            {isCircleEvent ? (
              <>
                {/* Group Only Visibility */}
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Group Only</Text>
                <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                  <Text className="text-xs leading-4" style={{ color: colors.textSecondary }}>
                    Only friends in this group can see the event.
                  </Text>
                </View>

                {/* Event Mode Selector */}
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Event Mode</Text>
                <View className="flex-row mb-4">
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setCircleEventMode("set_rsvp");
                    }}
                    className="flex-1 rounded-xl p-4 mr-2 flex-row items-center justify-center"
                    style={{
                      backgroundColor: circleEventMode === "set_rsvp" ? "#EF444415" : colors.surface,
                      borderWidth: 1,
                      borderColor: circleEventMode === "set_rsvp" ? "#EF444440" : colors.border
                    }}
                  >
                    <Bell size={18} color={circleEventMode === "set_rsvp" ? "#EF4444" : colors.textTertiary} />
                    <Text
                      className="ml-2 font-medium"
                      style={{ color: circleEventMode === "set_rsvp" ? "#EF4444" : colors.textSecondary }}
                    >
                      Set RSVP
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setCircleEventMode("open_invite");
                    }}
                    className="flex-1 rounded-xl p-4 flex-row items-center justify-center"
                    style={{
                      backgroundColor: circleEventMode === "open_invite" ? `${themeColor}15` : colors.surface,
                      borderWidth: 1,
                      borderColor: circleEventMode === "open_invite" ? `${themeColor}40` : colors.border
                    }}
                  >
                    <Compass size={18} color={circleEventMode === "open_invite" ? themeColor : colors.textTertiary} />
                    <Text
                      className="ml-2 font-medium"
                      style={{ color: circleEventMode === "open_invite" ? themeColor : colors.textSecondary }}
                    >
                      Open Invite
                    </Text>
                  </Pressable>
                </View>
                <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
                  <Text className="text-xs leading-4" style={{ color: colors.textSecondary }}>
                    {circleEventMode === "set_rsvp"
                      ? "Everyone in the group will be invited and added as going. They can change their response later."
                      : "Host is marked as going. Other members can see and choose to join."}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Who's Invited?</Text>
                <View className="flex-row mb-4">
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setVisibility("all_friends");
                    }}
                    className="flex-1 rounded-xl p-4 mr-2 flex-row items-center justify-center"
                    style={{
                      backgroundColor: visibility === "all_friends" ? `${themeColor}15` : colors.surface,
                      borderWidth: 1,
                      borderColor: visibility === "all_friends" ? `${themeColor}40` : colors.border
                    }}
                  >
                    <Compass size={18} color={visibility === "all_friends" ? themeColor : colors.textTertiary} />
                    <Text
                      className="ml-2 font-medium"
                      style={{ color: visibility === "all_friends" ? themeColor : colors.textSecondary }}
                    >
                      All Friends
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setVisibility("specific_groups");
                    }}
                    className="flex-1 rounded-xl p-4 flex-row items-center justify-center"
                    style={{
                      backgroundColor: visibility === "specific_groups" ? "#4ECDC415" : colors.surface,
                      borderWidth: 1,
                      borderColor: visibility === "specific_groups" ? "#4ECDC440" : colors.border
                    }}
                  >
                    <Users size={18} color={visibility === "specific_groups" ? "#4ECDC4" : colors.textTertiary} />
                    <Text
                      className="ml-2 font-medium"
                      style={{ color: visibility === "specific_groups" ? "#4ECDC4" : colors.textSecondary }}
                    >
                      Circles
                    </Text>
                  </Pressable>
                </View>

                {/* Circle Selection */}
                {visibility === "specific_groups" && (
                  <View className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.text }} className="text-sm font-medium mb-3">Select Circles</Text>
                    {circles.length === 0 ? (
                      <Text style={{ color: colors.textTertiary }} className="text-center py-4">
                        No circles yet. Create circles from Friends tab!
                      </Text>
                    ) : (
                      circles.map((circle: Circle) => (
                        <Pressable
                          key={circle.id}
                          onPress={() => toggleGroup(circle.id)}
                          className="flex-row items-center p-3 rounded-lg mb-2"
                          style={{ backgroundColor: selectedGroupIds.includes(circle.id) ? `${themeColor}15` : isDark ? "#2C2C2E" : "#F9FAFB" }}
                        >
                          <View
                            className="w-8 h-8 rounded-full items-center justify-center mr-3"
                            style={{ backgroundColor: `${themeColor}20` }}
                          >
                            <Text className="text-base">{circle.emoji}</Text>
                          </View>
                          <Text style={{ color: colors.text }} className="flex-1 font-medium">{circle.name}</Text>
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

          {/* Send Notification */}
          <Animated.View entering={FadeInDown.delay(275).springify()}>
            <Text style={{ color: colors.textSecondary }} className="text-sm font-medium mb-2">Send Notification</Text>
            <View className="flex-row mb-4">
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setSendNotification(true);
                }}
                className="flex-1 rounded-xl p-4 mr-2 flex-row items-center justify-center"
                style={{
                  backgroundColor: sendNotification ? `${themeColor}15` : colors.surface,
                  borderWidth: 1,
                  borderColor: sendNotification ? `${themeColor}40` : colors.border
                }}
              >
                <Bell size={18} color={sendNotification ? themeColor : colors.textTertiary} />
                <Text
                  className="ml-2 font-medium"
                  style={{ color: sendNotification ? themeColor : colors.textSecondary }}
                >
                  Yes
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setSendNotification(false);
                }}
                className="flex-1 rounded-xl p-4 flex-row items-center justify-center"
                style={{
                  backgroundColor: !sendNotification ? `${colors.textTertiary}15` : colors.surface,
                  borderWidth: 1,
                  borderColor: !sendNotification ? `${colors.textTertiary}40` : colors.border
                }}
              >
                <BellOff size={18} color={!sendNotification ? colors.textSecondary : colors.textTertiary} />
                <Text
                  className="ml-2 font-medium"
                  style={{ color: !sendNotification ? colors.textSecondary : colors.textTertiary }}
                >
                  No
                </Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.textTertiary }} className="text-xs mb-4 ml-1">
              {sendNotification
                ? visibility === "specific_groups"
                  ? "Friends in selected groups will be notified"
                  : "All friends will be notified about this event"
                : "No notifications will be sent"}
            </Text>
          </Animated.View>

          {/* Create Button */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <Pressable
              onPress={handleCreate}
              disabled={createMutation.isPending}
              className="rounded-xl p-4 items-center mt-4"
              style={{
                backgroundColor: createMutation.isPending ? colors.textTertiary : themeColor,
                shadowColor: themeColor,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.5 : 0.3,
                shadowRadius: 8,
              }}
            >
              <Text className="text-white font-semibold text-lg">
                {createMutation.isPending ? "Creating..." : "Create Open Invite"}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomNavigation />

      {/* Paywall Modal */}
      <PaywallModal
        visible={showPaywallModal}
        context={paywallContext}
        onClose={() => setShowPaywallModal(false)}
      />

      {/* Notification Nudge Modal */}
      <NotificationNudgeModal
        visible={showNotificationNudge}
        onClose={() => setShowNotificationNudge(false)}
      />

      {/* Soft-Limit Modal */}
      <SoftLimitModal
        visible={showSoftLimitModal}
        onUpgrade={handleSoftLimitUpgrade}
        onDismiss={handleSoftLimitDismiss}
        title="You're organizing a lot"
        description="Premium removes limits and adds smart reminders."
      />
    </SafeAreaView>
  );
}
