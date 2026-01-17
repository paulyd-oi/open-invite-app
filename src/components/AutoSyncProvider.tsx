/**
 * AutoSyncProvider
 *
 * Background provider that triggers automatic calendar sync for Pro users.
 * Runs silently in the background without affecting UI.
 */

import { useAutoSync } from "@/hooks/useAutoSync";
import { useSubscription } from "@/lib/useSubscription";

interface AutoSyncProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that enables auto-sync for Pro users
 *
 * Place this inside QueryClientProvider and SessionProvider
 * so it has access to Pro status.
 */
export function AutoSyncProvider({ children }: AutoSyncProviderProps) {
  // Get Pro status from subscription hook
  const { isPro } = useSubscription();

  // Enable auto-sync for Pro users
  useAutoSync({ isPro });

  return <>{children}</>;
}
