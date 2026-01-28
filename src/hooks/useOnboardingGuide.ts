import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";

// Onboarding guide steps - action-based progression
export type OnboardingGuideStep = 
  | "friends_tab"      // Step 1: Tap Friends tab
  | "add_friend"       // Step 2: Send a friend request
  | "create_event"     // Step 3: Create your first event
  | "completed";       // Done

const ONBOARDING_GUIDE_KEY = "onboarding_guide_step";
const ONBOARDING_GUIDE_COMPLETED_KEY = "onboarding_guide_completed";

interface OnboardingGuideState {
  currentStep: OnboardingGuideStep;
  isCompleted: boolean;
  isLoading: boolean;
}

/**
 * Hook to manage interactive action-based onboarding
 * Guides new users through: Friends tab → Add Friend → Create Event
 */
export function useOnboardingGuide() {
  const [state, setState] = useState<OnboardingGuideState>({
    currentStep: "friends_tab",
    isCompleted: true, // Default to completed to prevent flash
    isLoading: true,
  });
  const queryClient = useQueryClient();

  // Load saved state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
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
  }, []);

  // Complete a step and advance to the next
  const completeStep = useCallback(async (step: OnboardingGuideStep) => {
    if (state.isCompleted || state.currentStep !== step) return;

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
  }, [state.isCompleted, state.currentStep]);

  // Start the guide for a new user
  const startGuide = useCallback(async () => {
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
  }, []);

  // Dismiss the guide entirely
  const dismissGuide = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_GUIDE_COMPLETED_KEY, "true");
      setState(prev => ({ ...prev, isCompleted: true }));
    } catch (error) {
      console.error("Failed to dismiss onboarding guide:", error);
    }
  }, []);

  // Reset guide (for testing)
  const resetGuide = useCallback(async () => {
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
  }, []);

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
