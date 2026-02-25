/**
 * useFirstPaintStable — opacity-gate for first-paint stabilization.
 *
 * Returns `isStable: boolean`. Stays `false` until:
 *   1. The first `onLayout` callback fires, AND
 *   2. Two rAF ticks pass (ensures safe-area / font reflows have settled).
 *
 * Usage: wrap the screen root content in `<View style={{ opacity: isStable ? 1 : 0 }}>`.
 * This eliminates any visible "render then jump up" snap caused by async
 * safe-area inset measurement, font loading, or StatusBar reflow.
 *
 * DEV proof tag: [P1_ONBOARD_STABLE]
 */
import { useState, useCallback, useRef } from "react";
import { LayoutChangeEvent } from "react-native";
import { devLog } from "@/lib/devLog";

export function useFirstPaintStable(): {
  isStable: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
} {
  const [isStable, setIsStable] = useState(false);
  const firedRef = useRef(false);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (firedRef.current) return;
    firedRef.current = true;

    const { height, y } = e.nativeEvent.layout;
    if (__DEV__) {
      devLog("[P1_ONBOARD_STABLE] onLayout", { height: Math.round(height), y: Math.round(y) });
    }

    // Wait two rAF ticks for any pending reflows (safe-area, fonts, status bar)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsStable(true);
        if (__DEV__) {
          devLog("[P1_ONBOARD_STABLE] stable=true");
        }
      });
    });
  }, []);

  return { isStable, onLayout };
}
