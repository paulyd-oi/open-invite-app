import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { devLog } from "@/lib/devLog";

const VERIFICATION_DEFERRED_KEY = "verification_deferred";

/**
 * Hook to check if email verification was deferred during onboarding
 * and provide helpers for gating social actions.
 *
 * Usage:
 * const { isVerificationDeferred, showVerificationGate, clearDeferredStatus } = useVerificationGate();
 *
 * // Before a social action:
 * if (isVerificationDeferred) {
 *   showVerificationGate();
 *   return; // Block the action
 * }
 */
export function useVerificationGate() {
  const [isVerificationDeferred, setIsVerificationDeferred] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check deferred status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const deferred = await AsyncStorage.getItem(VERIFICATION_DEFERRED_KEY);
        setIsVerificationDeferred(deferred === "true");
      } catch (error) {
        devLog("Failed to check verification status:", error);
      } finally {
        setIsLoading(false);
      }
    };
    checkStatus();
  }, []);

  // Show the verification gate modal
  const showVerificationGate = useCallback(() => {
    setShowModal(true);
  }, []);

  // Hide the verification gate modal
  const hideVerificationGate = useCallback(() => {
    setShowModal(false);
  }, []);

  // Clear deferred status (after successful verification)
  const clearDeferredStatus = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(VERIFICATION_DEFERRED_KEY);
      setIsVerificationDeferred(false);
    } catch (error) {
      devLog("Failed to clear deferred status:", error);
    }
  }, []);

  // Check if action should be blocked and show modal if so
  // Returns true if the action should be blocked
  const checkAndGate = useCallback((): boolean => {
    if (isVerificationDeferred) {
      showVerificationGate();
      return true;
    }
    return false;
  }, [isVerificationDeferred, showVerificationGate]);

  return {
    isVerificationDeferred,
    isLoading,
    showModal,
    showVerificationGate,
    hideVerificationGate,
    clearDeferredStatus,
    checkAndGate,
  };
}

export default useVerificationGate;
