/**
 * Index Route - Entry point placeholder
 * 
 * INVARIANT: Boot decides once.
 * This route renders nothing - BootRouter in _layout.tsx handles all routing decisions.
 * The Redirect to /calendar is a fallback if BootRouter has already routed (authed user).
 */
import { View } from "react-native";
import { useBootAuthority } from "@/hooks/useBootAuthority";

export default function Index() {
  const { status: bootStatus } = useBootAuthority();
  
  // While boot is loading, render nothing (splash is shown by layout)
  // BootRouter will handle the actual routing once bootStatus resolves
  if (bootStatus === 'loading') {
    return null;
  }
  
  // If we're here and boot resolved, return empty view
  // BootRouter already navigated to the correct screen
  return <View />;
}
