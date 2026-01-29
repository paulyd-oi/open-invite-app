import { useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";

// Versioned SecureStore keys for coachmark persistence
const GUIDE_FRIENDS_ADD_KEY = "guide_friends_add_people_v1";
const GUIDE_CREATE_EVENT_KEY = "guide_create_first_plan_v1";

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
 * CRITICAL: Uses SecureStore with versioned keys for permanent dismissal
 * Keys: guide_friends_add_people_v1, guide_create_first_plan_v1
 */
export function useOnboardingGuide() {
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();
  const userId = session?.user?.id;

  const [state, setState] = useState<OnboardingGuideState>({
    currentStep: "friends_tab",
    isCompleted: true, // Default to completed to prevent flash
    isLoading: true,
  });
  // Track if SecureStore check has completed (hard render gate)
  const [loadedOnce, setLoadedOnce] = useState(false);
  const queryClient = useQueryClient();

  // Load saved state on mount - ONLY after userId is known
  useEffect(() => {
    // Guard: Do not load until we have a userId and are authed
    if (!userId || bootStatus !== "authed") {
      if (__DEV__) console.log("[DEV_DECISION] guide skip: no userId or not authed", { userId: !!userId, bootStatus });
      setState(prev => ({ ...prev, isLoading: false, isCompleted: true }));
      return;
    }

    const loadState = async () => {
      try {
        // Use versioned SecureStore keys (global, not per-user - dismiss once = never show again)
        const [friendsDismissed, createDismissed] = await Promise.all([
          SecureStore.getItemAsync(GUIDE_FRIENDS_ADD_KEY),
          SecureStore.getItemAsync(GUIDE_CREATE_EVENT_KEY),
        ]);
        
        // Determine current step based on what's dismissed
        let currentStep: OnboardingGuideStep = "friends_tab";
        let isCompleted = false;
        
        if (friendsDismissed === "true") {
          currentStep = "add_friend";
          // Check if add_friend was also dismissed (implicitly via friends key)
          if (createDismissed === "true") {
            currentStep = "completed";
            isCompleted = true;
          }
        }
        
        // If both guides are dismissed, user has completed onboarding
        if (friendsDismissed === "true" && createDismissed === "true") {
          isCompleted = true;
          currentStep = "completed";
        }
        
        if (__DEV__) console.log("[DEV_DECISION] guide show/hide", { 
          key_friends: GUIDE_FRIENDS_ADD_KEY, 
          key_create: GUIDE_CREATE_EVENT_KEY,
          dismissed_friends: friendsDismissed === "true",
          dismissed_create: createDismissed === "true",
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
      // Persist dismissal to SecureStore based on which step was completed
      if (step === "friends_tab" || step === "add_friend") {
        await SecureStore.setItemAsync(GUIDE_FRIENDS_ADD_KEY, "true");
        if (__DEV__) console.log("[DEV_DECISION] guide dismiss", { key: GUIDE_FRIENDS_ADD_KEY, dismissed: true, step });
      }
      if (step === "create_event" || isNowCompleted) {
        await SecureStore.setItemAsync(GUIDE_CREATE_EVENT_KEY, "true");
        if (__DEV__) console.log("[DEV_DECISION] guide dismiss", { key: GUIDE_CREATE_EVENT_KEY, dismissed: true, step });
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
      await SecureStore.deleteItemAsync(GUIDE_FRIENDS_ADD_KEY);
      await SecureStore.deleteItemAsync(GUIDE_CREATE_EVENT_KEY);
      setState({
        currentStep: "friends_tab",
        isCompleted: false,
        isLoading: false,
      });
      if (__DEV__) console.log("[DEV_DECISION] guide reset via startGuide");
    } catch (error) {
      console.error("Failed to start onboarding guide:", error);
    }
  }, [userId]);

  // Dismiss the guide entirely (persists to SecureStore - never shows again)
  const dismissGuide = useCallback(async () => {
    if (!userId) return;

    try {
      // Dismiss both guides permanently
      await SecureStore.setItemAsync(GUIDE_FRIENDS_ADD_KEY, "true");
      await SecureStore.setItemAsync(GUIDE_CREATE_EVENT_KEY, "true");
      setState(prev => ({ ...prev, isCompleted: true }));
      if (__DEV__) console.log("[DEV_DECISION] guide dismissed entirely", { 
        key_friends: GUIDE_FRIENDS_ADD_KEY, 
        key_create: GUIDE_CREATE_EVENT_KEY,
        dismissed: true 
      });
    } catch (error) {
      console.error("Failed to dismiss onboarding guide:", error);
    }
  }, [userId]);

  // Reset guide (for testing only)
  const resetGuide = useCallback(async () => {
    if (!userId) return;

    try {
      await SecureStore.deleteItemAsync(GUIDE_FRIENDS_ADD_KEY);
      await SecureStore.deleteItemAsync(GUIDE_CREATE_EVENT_KEY);
      setState({
        currentStep: "friends_tab",
        isCompleted: false,
        isLoading: false,
      });
      setLoadedOnce(false);
      if (__DEV__) console.log("[DEV_DECISION] guide reset via resetGuide");
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
