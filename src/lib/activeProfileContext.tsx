import React, { createContext, useContext, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { isAuthedForNetwork } from "@/lib/authedGate";
import { api } from "./api";
import type {
  Profile,
  GetProfilesResponse,
  SwitchProfileResponse,
} from "../../shared/contracts";

interface ActiveProfileContextType {
  // Current active profile
  activeProfile: Profile | null;
  activeProfileId: string | null;

  // All available profiles (personal only)
  profiles: Profile[];

  // Loading state
  isLoading: boolean;

  // Switch to a different profile
  switchProfile: (profileId: string | null) => Promise<void>;
  isSwitching: boolean;

  // Refetch profiles
  refetch: () => void;
}

const ActiveProfileContext = createContext<ActiveProfileContextType | null>(null);

export function ActiveProfileProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { status: bootStatus } = useBootAuthority();

  // Fetch all profiles
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      return api.get<GetProfilesResponse>("/api/profile");
    },
    enabled: isAuthedForNetwork(bootStatus, session),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Switch profile mutation
  const switchMutation = useMutation({
    mutationFn: async (profileId: string | null) => {
      return api.post<SwitchProfileResponse>("/api/profile/switch", { profileId });
    },
    onSuccess: () => {
      // Invalidate and refetch profiles
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const { mutateAsync } = switchMutation;

  const switchProfile = useCallback(async (profileId: string | null) => {
    await mutateAsync(profileId);
  }, [mutateAsync]);

  // Derived values
  const profiles = data?.profiles ?? [];
  const activeProfile = data?.activeProfile ?? null;
  const activeProfileId = data?.activeProfileId ?? null;

  const value: ActiveProfileContextType = {
    activeProfile,
    activeProfileId,
    profiles,
    isLoading,
    switchProfile,
    isSwitching: switchMutation.isPending,
    refetch,
  };

  return (
    <ActiveProfileContext.Provider value={value}>
      {children}
    </ActiveProfileContext.Provider>
  );
}

export function useActiveProfile() {
  const context = useContext(ActiveProfileContext);
  if (!context) {
    throw new Error("useActiveProfile must be used within ActiveProfileProvider");
  }
  return context;
}

// Selector hooks for specific pieces of state (prevents unnecessary re-renders)
export function useActiveProfileId() {
  const { activeProfileId } = useActiveProfile();
  return activeProfileId;
}
