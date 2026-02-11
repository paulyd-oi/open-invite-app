/**
 * Motion SSOT — single source of truth for animation presets.
 *
 * INVARIANT: Only opacity + transform properties are animated.
 * No layout animation (flex, height, margin, padding).
 * No navigation / state coupling.
 *
 * INVARIANT: All easing is defined here. MotionSurface / usePressMotion
 * must consume config.easing — no ad-hoc Easing calls in screens.
 */

import { Easing, type EasingFunction, type EasingFunctionFactory } from "react-native-reanimated";

export const MotionDurations = {
  instant: 90,
  fast: 140,
  normal: 180,
  hero: 280,
} as const;

/** SSOT easing curves — screens must NOT call Easing.* directly. */
export const MotionEasings = {
  /** Standard decelerate curve used by most presets. */
  standard: Easing.bezier(0.2, 0.8, 0.2, 1),
  /** Snappy press feel. */
  press: Easing.out(Easing.ease),
} as const;

export type MotionPreset =
  | "hero"
  | "card"
  | "press"
  | "media";

export interface MotionPresetConfigEntry {
  duration: number;
  easing: EasingFunction | EasingFunctionFactory;
  opacityFrom?: number;
  translateYFrom?: number;
  scaleFrom?: number;
  scaleTo?: number;
}

export const MotionPresetConfig: Record<MotionPreset, MotionPresetConfigEntry> = {
  hero: {
    duration: MotionDurations.hero,
    easing: MotionEasings.standard,
    opacityFrom: 0,
    translateYFrom: 6,
  },

  card: {
    duration: MotionDurations.normal,
    easing: MotionEasings.standard,
    opacityFrom: 0,
    scaleFrom: 0.98,
  },

  press: {
    duration: MotionDurations.instant,
    easing: MotionEasings.press,
    scaleTo: 0.97,
  },

  media: {
    duration: MotionDurations.fast,
    easing: MotionEasings.standard,
    opacityFrom: 0,
  },
};
