import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";

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
 * CRITICAL: Uses user-scoped AsyncStorage keys to prevent guide showing on established accounts
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
  const queryClient = useQueryClient();

  // Load saved state on mount - ONLY after userId is known
  useEffect(() => {
    // Guard: Do not load until we have a userId and are authed
    if (!userId || bootStatus !== "authed") {
      setState(prev => ({ ...prev, isLoading: false, isCompleted: true }));
      return;
    }

    const loadState = async () => {
      try {
        const ONBOARDING_GUIDE_KEY = `onboarding_guide_step:${userId}`;
        const ONBOARDING_GUIDE_COMPLETED_KEY = `onboarding_guide_completed:${userId}`;

        const [completedStr, stepStr] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_GUIDE_COMPLETED_KEY),
          AsyncStorage.getItem(ONBOARDING_GUIDE_KEY),
        ]);
        
        const isCompleted = completedStr === "true";
        const currentStep = (stepStr as OnboardingGuideStep) || "friends_tab";
        
        setState({
          currentStep,
          isCompleted,
          isLoading: false,
        });
      } catch (error) {
        console.error("Failed to load onboarding guide state:", error);
        setState(prev => ({ ...prev, isLoading: false, isCompleted: true }));
      }
    };
    loadState();
  }, [userId, bootStatus]);

  // Complete a step and advance to the next
  const completeStep = useCallback(async (step: OnboardingGuideStep) => {
    if (!userId || state.isCompleted || state.currentStep !== step) return;

    const ONBOARDING_GUIDE_KEY = `onboarding_guide_step:${userId}`;
    const ONBOARDING_GUIDE_COMPLETED_KEY = `onboarding_guide_completed:${userId}`;

    const nextStepMap: Record<OnboardingGuideStep, OnboardingGuideStep> = {
      friends_tab: "add_friend",
      add_friend: "create_event",
      create_event: "completed",
      completed: "completed",
    };

    const nextStep = nextStepMap[step];
    const isNowCompleted = nextStep === "completed";

    try {
      await AsyncStorage.setItem(ONBOARDING_GUIDE_KEY, nextStep);
      if (isNowCompleted) {
        await AsyncStorage.setItem(ONBOARDING_GUIDE_COMPLETED_KEY, "true");
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

  // Start the guide for a new user
  const startGuide = useCallback(async () => {
    if (!userId) return;

    const ONBOARDING_GUIDE_KEY = `onboarding_guide_step:${userId}`;
    const ONBOARDING_GUIDE_COMPLETED_KEY = `onboarding_guide_completed:${userId}`;

    try {
      await AsyncStorage.setItem(ONBOARDING_GUIDE_KEY, "friends_tab");
      await AsyncStorage.removeItem(ONBOARDING_GUIDE_COMPLETED_KEY);
      setState({
        currentStep: "friends_tab",
        isCompleted: false,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to start onboarding guide:", error);
    }
  }, [userId]);

  // Dismiss the guide entirely
  const dismissGuide = useCallback(async () => {
    if (!userId) return;

    const ONBOARDING_GUIDE_COMPLETED_KEY = `onboarding_guide_completed:${userId}`;

    try {
      await AsyncStorage.setItem(ONBOARDING_GUIDE_COMPLETED_KEY, "true");
      setState(prev => ({ ...prev, isCompleted: true }));
    } catch (error) {
      console.error("Failed to dismiss onboarding guide:", error);
    }
  }, [userId]);

  // Reset guide (for testing)
  const resetGuide = useCallback(async () => {
    if (!userId) return;

    const ONBOARDING_GUIDE_KEY = `onboarding_guide_step:${userId}`;
    const ONBOARDING_GUIDE_COMPLETED_KEY = `onboarding_guide_completed:${userId}`;

    try {
      await AsyncStorage.removeItem(ONBOARDING_GUIDE_KEY);
      await AsyncStorage.removeItem(ONBOARDING_GUIDE_COMPLETED_KEY);
      setState({
        currentStep: "friends_tab",
        isCompleted: false,
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to reset onboarding guide:", error);
    }
  }, [userId]);

  return {
    ...state,
    completeStep,
    startGuide,
    dismissGuide,
    resetGuide,
    // Helper to check if a specific step should show
    shouldShowStep: (step: OnboardingGuideStep) => 
      !state.isCompleted && !state.isLoading && state.currentStep === step,
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
