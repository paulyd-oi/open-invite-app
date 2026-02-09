/**
 * Index Route - Redirect handler for deep links and direct navigation
 * 
 * [P0_INIT_ROUTE_FIX] The app now starts at /welcome directly (initialRouteName='welcome').
 * This route exists to handle:
 * 1. Deep links to "/" that should redirect based on auth status
 * 2. Legacy navigation to index
 * 
 * INVARIANT: Boot decides once.
 * INVARIANT: loggedOut → /welcome (NEVER /login on fresh install)
 * INVARIANT: authed → /calendar (home screen)
 */
import { Redirect } from "expo-router";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { BootLoading } from "@/components/BootLoading";
import { devLog } from "@/lib/devLog";

export default function Index() {
  const { status: bootStatus } = useBootAuthority();
  
  // While boot is loading, show deterministic loading UI
  if (bootStatus === 'loading') {
    return <BootLoading testID="index-boot-loading" context="index-route" />;
  }
  
  // Authed users go to calendar
  if (bootStatus === 'authed') {
    if (__DEV__) devLog('[P12_NAV_INVAR] action="to_app" reason="boot_authed" to="/calendar"');
    return <Redirect href="/calendar" />;
  }
  
  // All other states (loggedOut, onboarding, error, degraded) → welcome
  if (__DEV__) devLog(`[P12_NAV_INVAR] action="to_welcome" reason="boot_${bootStatus}" to="/welcome"`);
  return <Redirect href="/welcome" />;
}
