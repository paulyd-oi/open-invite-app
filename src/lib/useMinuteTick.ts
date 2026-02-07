import { useState, useEffect, useRef } from "react";

/**
 * Returns a tick number that increments every minute.
 * Use as a dependency in useMemo to force periodic recalculation.
 *
 * @param enabled - If false, returns stable tick and does not set interval
 * @returns tick number that increments every 60 seconds
 */
export function useMinuteTick(enabled: boolean = true): number {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    intervalRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, 60_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);

  return tick;
}
