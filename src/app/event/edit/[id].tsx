import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

/**
 * Legacy edit route — redirects to the unified create page in edit mode.
 * Kept as a redirect so existing deep links and back-stack entries still work.
 */
export default function EditEventRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/create?editEventId=${id}`);
  }, [id]);

  return null;
}
