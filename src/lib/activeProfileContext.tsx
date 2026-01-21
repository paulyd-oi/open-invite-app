import React, { createContext, useContext, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/useSession";
import { useBootAuthority } from "@/hooks/useBootAuthority";
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

  // All available profiles
  profiles: Profile[];

  // Business profiles only
  businessProfiles: Profile[];

  // Whether the active profile is a business
  isBusinessProfile: boolean;

  // Loading state
  isLoading: boolean;

  // Switch to a different profile
  switchProfile: (profileId: string | null) => Promise<void>;
  isSwitching: boolean;

  // Refetch profiles
  refetch: () => void;

  // Check if user can manage active business (for showing edit buttons etc.)
  canManageActiveBusiness: boolean;

  // Check if user is owner of active business
  isOwnerOfActiveBusiness: boolean;

  // Get role for active business profile
  activeBusinessRole: "owner" | "admin" | "manager" | null;
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
    enabled: bootStatus === 'authed',
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
      // Also invalidate any profile-dependent queries
      queryClient.invalidateQueries({ queryKey: ["businesses", "owned"] });
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

  const businessProfiles = useMemo(() =>
    profiles.filter((p: Profile): p is Profile & { type: "business" } => p.type === "business"),
    [profiles]
  );

  const isBusinessProfile = activeProfile?.type === "business";

  const canManageActiveBusiness = useMemo(() => {
    if (!activeProfile || activeProfile.type !== "business") return false;
    // All roles can manage (create events, etc.)
    return true;
  }, [activeProfile]);

  const isOwnerOfActiveBusiness = useMemo(() => {
    if (!activeProfile || activeProfile.type !== "business") return false;
    return activeProfile.isOwner;
  }, [activeProfile]);

  const activeBusinessRole = useMemo(() => {
    if (!activeProfile || activeProfile.type !== "business") return null;
    return activeProfile.role;
  }, [activeProfile]);

  const value: ActiveProfileContextType = {
    activeProfile,
    activeProfileId,
    profiles,
    businessProfiles,
    isBusinessProfile,
    isLoading,
    switchProfile,
    isSwitching: switchMutation.isPending,
    refetch,
    canManageActiveBusiness,
    isOwnerOfActiveBusiness,
    activeBusinessRole,
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

export function useIsBusinessProfile() {
  const { isBusinessProfile } = useActiveProfile();
  return isBusinessProfile;
}

export function useActiveBusinessRole() {
  const { activeBusinessRole } = useActiveProfile();
  return activeBusinessRole;
}
