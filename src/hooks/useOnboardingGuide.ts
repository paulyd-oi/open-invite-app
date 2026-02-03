import { useEffect, useState, useCallback, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";

// SecureStore key prefixes - MUST be user-scoped to prevent cross-account pollution
const GUIDE_FRIENDS_ADD_KEY_PREFIX = "guide_friends_add_people_v2";
const GUIDE_CREATE_EVENT_KEY_PREFIX = "guide_create_first_plan_v2";
const GUIDE_FORCE_SHOW_KEY_PREFIX = "guide_force_show_v2";

// Helper to build user-scoped keys (exported for signup flow)
// SecureStore keys must match [A-Za-z0-9._-]+ - sanitize userId to remove invalid chars
export function buildGuideKey(prefix: string, userId: string): string {
  if (!userId || typeof userId !== "string") {
    // Return a fallback key that won't crash but won't persist properly
    console.warn("[buildGuideKey] Invalid userId provided:", userId);
    return `${prefix}_fallback`;
  }
  // Sanitize: replace any character not in [A-Za-z0-9._-] with underscore
  const sanitized = userId.replace(/[^A-Za-z0-9._-]/g, "_");
  return `${prefix}_${sanitized}`;
}

// Export constant for use in signup flow
export const GUIDE_FORCE_SHOW_PREFIX = GUIDE_FORCE_SHOW_KEY_PREFIX;

// Module-level cache for SYNC reads to prevent flash on remount
// Key: userId, Value: { friendsDismissed, createDismissed }
const guideStateCache = new Map<string, { friendsDismissed: boolean; createDismissed: boolean }>();

// Onboarding guide steps - action-based progression
export type OnboardingGuideStep = 
  | "friends_tab"      // Step 1: Tap Friends tab
  | "add_friend"       // Step 2: Send a friend request
  | "create_event"     // Step 3: Create your first event
  | "completed";       // Done

interface OnboardingGuideState {
  currentStep: OnboardingGuideStep;
  isCompleted: boolean;
  isLoading: boolean;
}

/**
 * Hook to manage interactive action-based onboarding
 * Guides new users through: Friends tab → Add Friend → Create Event
 * 
 * CRITICAL: Uses SecureStore with user-scoped versioned keys for permanent dismissal
 * Keys: guide_friends_add_people_v2:<userId>, guide_create_first_plan_v2:<userId>
 * 
 * INVARIANT: loadedOnce must be true before shouldShowStep returns true (prevents flash)
 */
export function useOnboardingGuide() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const userId = session?.user?.id;
  const mountIdRef = useRef(Math.random().toString(36).slice(2));

  // Check module cache SYNCHRONOUSLY on mount to prevent flash
  const cachedState = userId ? guideStateCache.get(userId) : undefined;
  const initialIsCompleted = cachedState 
    ? (cachedState.friendsDismissed && cachedState.createDismissed)
    : true; // Default completed to prevent flash
  const initialLoadedOnce = !!cachedState; // If cache hit, we're already loaded

  const [state, setState] = useState<OnboardingGuideState>({
    currentStep: cachedState 
      ? (cachedState.createDismissed ? "completed" : (cachedState.friendsDismissed ? "add_friend" : "friends_tab"))
      : "friends_tab",
    isCompleted: initialIsCompleted,
    isLoading: !cachedState, // Only loading if no cache
  });
  // Track if SecureStore check has completed (hard render gate)
  const [loadedOnce, setLoadedOnce] = useState(initialLoadedOnce);
  const queryClient = useQueryClient();

  // Load saved state on mount - ONLY after userId is known
  useEffect(() => {
    // Guard: Do not load until we have a userId and are authed
    if (!userId || bootStatus !== "authed") {
      if (__DEV__) console.log("[GUIDE_DECISION] skip load: no userId or not authed", { 
        mountId: mountIdRef.current,
        userId: userId?.substring(0, 8) || 'none', 
        bootStatus 
      });
      setState(prev => ({ ...prev, isLoading: false, isCompleted: true }));
      return;
    }

    // If cache hit, we're already initialized - skip async read
    if (guideStateCache.has(userId)) {
      if (__DEV__) console.log("[GUIDE_DECISION] cache HIT - skip async read", { 
        mountId: mountIdRef.current,
        userId: userId.substring(0, 8),
        cached: guideStateCache.get(userId)
      });
      return;
    }

    const loadState = async () => {
      try {
        // GATE: Only show guide if forceShow was explicitly set (on new account signup)
        // This prevents mature accounts from seeing guide even if dismissal keys changed
        const forceShowKey = buildGuideKey(GUIDE_FORCE_SHOW_KEY_PREFIX, userId);
        const forceShow = await SecureStore.getItemAsync(forceShowKey);
        
        if (forceShow !== "true") {
          // Mature account or forceShow disabled - never show guide
          if (__DEV__) console.log("[GUIDE_DECISION] gate: forceShow disabled -> completed", {
            mountId: mountIdRef.current,
            userId: userId.substring(0, 8),
            forceShowKey,
            forceShowValue: forceShow,
          });
          guideStateCache.set(userId, { friendsDismissed: true, createDismissed: true });
          setState({ currentStep: "completed", isCompleted: true, isLoading: false });
          setLoadedOnce(true);
          return;
        }
        
        // Use user-scoped versioned SecureStore keys
        const friendsKey = buildGuideKey(GUIDE_FRIENDS_ADD_KEY_PREFIX, userId);
        const createKey = buildGuideKey(GUIDE_CREATE_EVENT_KEY_PREFIX, userId);
        
        const [friendsDismissed, createDismissed] = await Promise.all([
          SecureStore.getItemAsync(friendsKey),
          SecureStore.getItemAsync(createKey),
        ]);
        
        const isFriendsDismissed = friendsDismissed === "true";
        const isCreateDismissed = createDismissed === "true";
        
        // Update module cache BEFORE setting state (sync read on next mount)
        guideStateCache.set(userId, { 
          friendsDismissed: isFriendsDismissed, 
          createDismissed: isCreateDismissed 
        });
        
        // Determine current step based on what's dismissed
        let currentStep: OnboardingGuideStep = "friends_tab";
        let isCompleted = false;
        
        if (isFriendsDismissed) {
          currentStep = "add_friend";
          if (isCreateDismissed) {
            currentStep = "completed";
            isCompleted = true;
          }
        }
        
        // If both guides are dismissed, user has completed onboarding
        if (isFriendsDismissed && isCreateDismissed) {
          isCompleted = true;
          currentStep = "completed";
        }
        
        if (__DEV__) console.log("[GUIDE_DECISION] loaded from SecureStore", { 
          mountId: mountIdRef.current,
          userId: userId.substring(0, 8),
          friendsKey,
          createKey,
          dismissed_friends: isFriendsDismissed,
          dismissed_create: isCreateDismissed,
          currentStep,
          isCompleted 
        });
        
        setState({
          currentStep,
          isCompleted,
          isLoading: false,
        });
        setLoadedOnce(true);
      } catch (error) {
        console.error("Failed to load onboarding guide state:", error);
        setState(prev => ({ ...prev, isLoading: false, isCompleted: true }));
        setLoadedOnce(true);
      }
    };
    loadState();
  }, [userId, bootStatus]);

  // Complete a step and advance to the next (persists dismissal with SecureStore)
  const completeStep = useCallback(async (step: OnboardingGuideStep) => {
    if (!userId || state.isCompleted || state.currentStep !== step) return;

    const nextStepMap: Record<OnboardingGuideStep, OnboardingGuideStep> = {
      friends_tab: "add_friend",
      add_friend: "create_event",
      create_event: "completed",
      completed: "completed",
    };

    const nextStep = nextStepMap[step];
    const isNowCompleted = nextStep === "completed";

    try {
      // Build user-scoped keys
      const friendsKey = buildGuideKey(GUIDE_FRIENDS_ADD_KEY_PREFIX, userId);
      const createKey = buildGuideKey(GUIDE_CREATE_EVENT_KEY_PREFIX, userId);
      
      // Persist dismissal to SecureStore based on which step was completed
      if (step === "friends_tab" || step === "add_friend") {
        await SecureStore.setItemAsync(friendsKey, "true");
        // Update module cache immediately
        const cached = guideStateCache.get(userId) || { friendsDismissed: false, createDismissed: false };
        guideStateCache.set(userId, { ...cached, friendsDismissed: true });
        if (__DEV__) console.log("[GUIDE_DECISION] step dismissed", { key: friendsKey, step, userId: userId.substring(0, 8) });
      }
      if (step === "create_event" || isNowCompleted) {
        await SecureStore.setItemAsync(createKey, "true");
        // Update module cache immediately
        const cached = guideStateCache.get(userId) || { friendsDismissed: false, createDismissed: false };
        guideStateCache.set(userId, { ...cached, createDismissed: true });
        if (__DEV__) console.log("[GUIDE_DECISION] step dismissed", { key: createKey, step, userId: userId.substring(0, 8) });
      }
      
      setState({
        currentStep: nextStep,
        isCompleted: isNowCompleted,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to save onboarding guide step:", error);
    }
  }, [userId, state.isCompleted, state.currentStep]);

  // Start the guide for a new user (clears dismissal - mainly for testing)
  const startGuide = useCallback(async () => {
    if (!userId) return;

    try {
      const friendsKey = buildGuideKey(GUIDE_FRIENDS_ADD_KEY_PREFIX, userId);
      const createKey = buildGuideKey(GUIDE_CREATE_EVENT_KEY_PREFIX, userId);
      await SecureStore.deleteItemAsync(friendsKey);
      await SecureStore.deleteItemAsync(createKey);
      guideStateCache.delete(userId); // Clear module cache
      setState({
        currentStep: "friends_tab",
        isCompleted: false,
        isLoading: false,
      });
      if (__DEV__) console.log("[GUIDE_DECISION] guide reset via startGuide", { userId: userId.substring(0, 8) });
    } catch (error) {
      console.error("Failed to start onboarding guide:", error);
    }
  }, [userId]);

  // Dismiss the guide entirely (persists to SecureStore - never shows again)
  const dismissGuide = useCallback(async () => {
    if (!userId) return;

    try {
      const friendsKey = buildGuideKey(GUIDE_FRIENDS_ADD_KEY_PREFIX, userId);
      const createKey = buildGuideKey(GUIDE_CREATE_EVENT_KEY_PREFIX, userId);
      const forceShowKey = buildGuideKey(GUIDE_FORCE_SHOW_KEY_PREFIX, userId);
      // Dismiss both guides permanently and disable forceShow
      await SecureStore.setItemAsync(friendsKey, "true");
      await SecureStore.setItemAsync(createKey, "true");
      await SecureStore.deleteItemAsync(forceShowKey); // Disable forceShow gate - CRITICAL for "Skip guide"
      // Update module cache
      guideStateCache.set(userId, { friendsDismissed: true, createDismissed: true });
      setState(prev => ({ ...prev, isCompleted: true, currentStep: "completed" }));
      if (__DEV__) console.log("[P0_FRIENDS_GUIDE] dismissGuide - permanently disabled", { 
        friendsKey,
        createKey,
        forceShowKey: forceShowKey + " (DELETED)",
        userId: userId.substring(0, 8)
      });
    } catch (error) {
      console.error("Failed to dismiss onboarding guide:", error);
    }
  }, [userId]);

  // Reset guide (for testing only - also enables forceShow to allow guide to appear)
  const resetGuide = useCallback(async () => {
    if (!userId) return;

    try {
      const friendsKey = buildGuideKey(GUIDE_FRIENDS_ADD_KEY_PREFIX, userId);
      const createKey = buildGuideKey(GUIDE_CREATE_EVENT_KEY_PREFIX, userId);
      const forceShowKey = buildGuideKey(GUIDE_FORCE_SHOW_KEY_PREFIX, userId);
      await SecureStore.deleteItemAsync(friendsKey);
      await SecureStore.deleteItemAsync(createKey);
      // Re-enable forceShow to allow guide to appear on next load (DEV testing only)
      await SecureStore.setItemAsync(forceShowKey, "true");
      guideStateCache.delete(userId); // Clear module cache
      setState({
        currentStep: "friends_tab",
        isCompleted: false,
        isLoading: false,
      });
      setLoadedOnce(false);
      if (__DEV__) console.log("[GUIDE_DECISION] guide reset via resetGuide (forceShow re-enabled)", { userId: userId.substring(0, 8) });
    } catch (error) {
      console.error("Failed to reset onboarding guide:", error);
    }
  }, [userId]);

  return {
    ...state,
    loadedOnce,
    completeStep,
    startGuide,
    dismissGuide,
    resetGuide,
    // Helper to check if a specific step should show - gated on loadedOnce to prevent flash
    shouldShowStep: (step: OnboardingGuideStep) => 
      loadedOnce && !state.isCompleted && !state.isLoading && state.currentStep === step,
  };
}

// Step content configuration
export const ONBOARDING_GUIDE_CONTENT = {
  friends_tab: {
    title: "Start by adding a friend",
    description: "Tap the Friends tab to see your network",
    targetTab: "friends",
  },
  add_friend: {
    title: "Search and add someone",
    description: "Find a friend by name or email and send a request",
    targetAction: "add_friend_button",
  },
  create_event: {
    title: "Create your first plan",
    description: "Tap + to create an event and invite friends",
    targetAction: "create_event_button",
  },
  completed: {
    title: "You're all set!",
    description: "Enjoy connecting with friends",
    targetAction: null,
  },
} as const;
