/**
 * themeBuilderStore — Zustand store for the custom theme builder.
 *
 * Holds transient builder state (name, visualStack) while the user
 * composes a custom theme. reset() clears everything on exit.
 */

import { create } from "zustand";
import type { ThemeVisualStack } from "@/lib/eventThemes";

interface ThemeBuilderState {
  name: string;
  visualStack: ThemeVisualStack;
  setName: (name: string) => void;
  setGradient: (colors: string[], speed?: number) => void;
  setShader: (shader: ThemeVisualStack["shader"] | null) => void;
  setParticles: (particles: string | null) => void;
  setFilter: (filter: ThemeVisualStack["filter"] | null) => void;
  setImage: (image: { source: string; opacity?: number } | null) => void;
  hydrate: (name: string, visualStack: ThemeVisualStack) => void;
  reset: () => void;
}

const DEFAULT_VISUAL_STACK: ThemeVisualStack = {
  gradient: { colors: [], speed: 3 },
};

export const useThemeBuilderStore = create<ThemeBuilderState>((set) => ({
  name: "",
  visualStack: { ...DEFAULT_VISUAL_STACK },

  setName: (name) => set({ name: name.slice(0, 30) }),

  setGradient: (colors, speed) =>
    set((s) => ({
      visualStack: {
        ...s.visualStack,
        gradient: { colors, speed: speed ?? s.visualStack.gradient?.speed ?? 3 },
      },
    })),

  setShader: (shader) =>
    set((s) => ({
      visualStack: {
        ...s.visualStack,
        shader: shader ?? undefined,
      },
    })),

  setParticles: (particles) =>
    set((s) => ({
      visualStack: {
        ...s.visualStack,
        particles: particles ?? undefined,
      },
    })),

  setFilter: (filter) =>
    set((s) => ({
      visualStack: {
        ...s.visualStack,
        filter: filter ?? undefined,
      },
    })),

  setImage: (image) =>
    set((s) => ({
      visualStack: {
        ...s.visualStack,
        image: image ?? undefined,
      },
    })),

  hydrate: (name, visualStack) =>
    set({ name, visualStack: { ...visualStack } }),

  reset: () =>
    set({
      name: "",
      visualStack: { ...DEFAULT_VISUAL_STACK },
    }),
}));
