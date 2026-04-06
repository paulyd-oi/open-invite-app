/**
 * PostHog Client — thin module-level export for non-React callers.
 *
 * Used by global error handlers (ErrorUtils, promise rejection tracking)
 * that run outside React component tree and can't use usePostHog() hook.
 *
 * The instance is set once by PostHogLifecycle in _layout.tsx via setPostHogRef().
 */

import { getPostHogRef } from "@/analytics/posthogSSOT";

const posthogClient = {
  capture(event: string, properties?: Record<string, any>): void {
    try {
      const ph = getPostHogRef();
      if (ph) ph.capture(event, properties);
    } catch {
      // Never crash the app for analytics
    }
  },
};

export default posthogClient;
