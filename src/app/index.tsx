/**
 * Index Route - Entry point placeholder
 * 
 * INVARIANT: Boot decides once.
 * This route renders a loading UI while boot resolves - BootRouter handles routing.
 * INVARIANT: No null renders - always show BootLoading during loading state.
 */
import { View } from "react-native";
import { useBootAuthority } from "@/hooks/useBootAuthority";
import { BootLoading } from "@/components/BootLoading";
import { devLog } from "@/lib/devLog";

export default function Index() {
  const { status: bootStatus } = useBootAuthority();
  
  // DEV-only proof log
  if (__DEV__) {
    devLog("[P0_BOOT_INDEX]", "Index route render, bootStatus:", bootStatus);
  }
  
  // INVARIANT: Always render something - never null
  // While boot is loading, show deterministic loading UI
  if (bootStatus === 'loading') {
    return <BootLoading testID="index-boot-loading" context="index-route" />;
  }
  
  // If we're here and boot resolved, return empty view
  // BootRouter already navigated to the correct screen
  return <View testID="index-resolved" />;
}
