/**
 * Motion SSOT — single source of truth for animation presets.
 *
 * INVARIANT: Only opacity + transform properties are animated.
 * No layout animation (flex, height, margin, padding).
 * No navigation / state coupling.
 */

export const MotionDurations = {
  instant: 90,
  fast: 140,
  normal: 180,
  hero: 280,
} as const;

export const MotionEasing = {
  standard: [0.2, 0.8, 0.2, 1],
} as const;

export type MotionPreset =
  | "hero"
  | "card"
  | "press"
  | "media";

export const MotionPresetConfig: Record<
  MotionPreset,
  {
    duration: number;
    opacityFrom?: number;
    translateYFrom?: number;
    scaleFrom?: number;
    scaleTo?: number;
  }
> = {
  hero: {
    duration: MotionDurations.hero,
    opacityFrom: 0,
    translateYFrom: 6,
  },

  card: {
    duration: MotionDurations.normal,
    opacityFrom: 0,
    scaleFrom: 0.98,
  },

  press: {
    duration: MotionDurations.instant,
    scaleTo: 0.97,
  },

  media: {
    duration: MotionDurations.fast,
    opacityFrom: 0,
  },
};
