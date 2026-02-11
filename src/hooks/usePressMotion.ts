import { useSharedValue, withTiming } from "react-native-reanimated";
import { MotionPresetConfig } from "@/lib/motionSSOT";

/**
 * Reusable press-scale animation hook.
 *
 * Returns { scale, onPressIn, onPressOut } — wire to Pressable
 * and pass scale to an Animated.View transform.
 *
 * INVARIANT: Only animates transform.scale — no layout side-effects.
 */
export function usePressMotion() {
  const scale = useSharedValue(1);

  const onPressIn = () => {
    scale.value = withTiming(
      MotionPresetConfig.press.scaleTo ?? 0.97,
      { duration: MotionPresetConfig.press.duration },
    );
  };

  const onPressOut = () => {
    scale.value = withTiming(1, {
      duration: MotionPresetConfig.press.duration,
    });
  };

  return { scale, onPressIn, onPressOut };
}
