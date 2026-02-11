import React, { useEffect } from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { type MotionPreset, MotionPresetConfig } from "@/lib/motionSSOT";

type Props = {
  preset: MotionPreset;
  style?: ViewStyle;
  children: React.ReactNode;
};

/**
 * Reusable motion wrapper — applies a single SSOT animation preset.
 *
 * INVARIANT: Only animates opacity + transform (translateY / scale).
 * No layout properties are touched.
 */
export default function MotionSurface({
  preset,
  style,
  children,
}: Props) {
  const config = MotionPresetConfig[preset];

  const opacity = useSharedValue(config.opacityFrom ?? 1);
  const translateY = useSharedValue(config.translateYFrom ?? 0);
  const scale = useSharedValue(config.scaleFrom ?? 1);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: config.duration });
    translateY.value = withTiming(0, { duration: config.duration });
    scale.value = withTiming(1, { duration: config.duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
