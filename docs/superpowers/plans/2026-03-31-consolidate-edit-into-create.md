# Consolidate Edit Event into Create Event Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the edit-event and create-event UX into a single page so hosts get the full atmosphere preview (themes, effects, cover media) when editing events, not a legacy plain form.

**Architecture:** The existing `src/app/create.tsx` gains an optional `editEventId` route param. When present, the page fetches the event data, pre-populates all form state including theme/effect/cover, and submits via PUT instead of POST. The old edit page (`src/app/event/edit/[id].tsx`) redirects to the create page. Navigation from the host overflow menu changes to route to `/create?editEventId=xxx`.

**Tech Stack:** Expo Router, React Query, React Native, existing `UpdateEventRequest`/`UpdateEventResponse` contracts, existing `useCoverMedia` hook.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/create.tsx` | Modify | Accept `editEventId` param, add edit-mode data fetch, pre-populate state, branch submit handler |
| `src/hooks/useCoverMedia.ts` | Modify | Add `prefill(url)` method to set existing cover without upload |
| `src/hooks/useLocationSearch.ts` | Modify | Add `prefill(location)` method to set existing location string |
| `src/app/event/[id].tsx` | Modify | Change edit navigation from `/event/edit/${id}` to `/create?editEventId=${id}` |
| `src/app/event/edit/[id].tsx` | Modify | Replace with redirect to `/create?editEventId=${id}` |

---

### Task 1: Add `prefill` method to `useCoverMedia` hook

The create page uses `useCoverMedia()` to manage cover state. For edit mode, we need to pre-set an existing cover URL without triggering an upload.

**Files:**
- Modify: `src/hooks/useCoverMedia.ts`

- [ ] **Step 1: Add `prefill` callback to the hook**

Add after `handleCoverSelect` (line ~88):

```typescript
/** Pre-fill with an existing event cover URL (no upload needed). */
const prefillCover = useCallback((url: string) => {
  const item: CoverMediaItem = {
    id: "existing-cover",
    type: "image",
    url,
    thumbnailUrl: url,
    source: "upload",
  };
  setSelectedCoverItem(item);
  setBannerLocalUri(url);
  setBannerUpload({ url, publicId: "" });
  setUploadingBanner(false);
}, []);
```

- [ ] **Step 2: Expose `prefillCover` in the return object**

Add `prefillCover` to the return object (line ~90):

```typescript
return {
  // ... existing properties ...
  prefillCover,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean (no errors)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCoverMedia.ts
git commit -m "feat(create): add prefillCover to useCoverMedia hook for edit mode"
```

---

### Task 2: Add `prefill` method to `useLocationSearch` hook

The create page uses `useLocationSearch()` for location state. For edit mode, we need to pre-set an existing location string.

**Files:**
- Modify: `src/hooks/useLocationSearch.ts`

- [ ] **Step 1: Add `prefillLocation` callback**

Add a `prefillLocation` function that sets the location string without triggering a search:

```typescript
const prefillLocation = useCallback((loc: string) => {
  setLocation(loc);
  setLocationQuery(loc);
}, []);
```

- [ ] **Step 2: Expose `prefillLocation` in the return object**

Add `prefillLocation` to the return statement.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLocationSearch.ts
git commit -m "feat(create): add prefillLocation to useLocationSearch hook for edit mode"
```

---

### Task 3: Add edit-mode support to `create.tsx`

This is the core task. The create page gains an `editEventId` param, fetches the event, pre-populates all state, and branches the submit handler.

**Files:**
- Modify: `src/app/create.tsx`

**Important:** The `emoji` field in create.tsx is currently a `const` derived from route params: `const emoji = templateEmoji ?? "📅"`. This works for edit mode because we'll pass the event's emoji as the `emoji` route param when navigating to `/create?editEventId=xxx&emoji=🎉`.

- [ ] **Step 1: Add `editEventId` to route params**

In the `useLocalSearchParams` call (line ~70), add `editEventId`:

```typescript
const { date, template, emoji: templateEmoji, title: templateTitle, duration, circleId, visibility: visibilityParam, endDate: endDateParam, editEventId } = useLocalSearchParams<{
  date?: string;
  template?: string;
  emoji?: string;
  title?: string;
  duration?: string;
  circleId?: string;
  visibility?: string;
  endDate?: string;
  editEventId?: string;
}>();
```

Add derived flag:

```typescript
const isEditMode = !!editEventId;
```

- [ ] **Step 2: Add edit-mode event data query**

After the existing queries section (~line 93), add a query that fetches the user's events to find the one being edited (same pattern as old edit page):

```typescript
// ── Edit mode: fetch event data ──
const { data: editEventData } = useQuery({
  queryKey: eventKeys.mine(),
  queryFn: () => api.get<GetEventsResponse>("/api/events"),
  enabled: isEditMode && isAuthedForNetwork(bootStatus, session),
});
const editEvent = editEventData?.events.find((e) => e.id === editEventId);
```

Add required imports at the top:

```typescript
import { type UpdateEventRequest, type UpdateEventResponse, type GetEventsResponse } from "@/shared/contracts";
import { eventKeys, invalidateEventKeys, getInvalidateAfterEventCreate, getInvalidateAfterEventEdit } from "@/lib/eventQueryKeys";
```

Note: `GetEventsResponse` and `getInvalidateAfterEventEdit` may need to be added to the existing imports. Check what's already imported and merge.

- [ ] **Step 3: Add edit-mode state pre-population useEffect**

Add a `useEffect` that runs once when `editEvent` loads. Add an `isEditLoaded` state to prevent re-running:

```typescript
const [isEditLoaded, setIsEditLoaded] = useState(false);
```

Then the effect (after existing state declarations, before handlers):

```typescript
// ── Edit mode: pre-populate form state ──
useEffect(() => {
  if (!isEditMode || !editEvent || isEditLoaded) return;

  setTitle(editEvent.title);
  setDescription(editEvent.description ?? "");
  locationSearch.prefillLocation(editEvent.location ?? "");

  setStartDate(new Date(editEvent.startTime));
  if (editEvent.endTime) {
    setEndDate(new Date(editEvent.endTime));
    setUserModifiedEndTime(true);
  }

  // Visibility
  const vis = editEvent.visibility as "all_friends" | "specific_groups" | "circle_only";
  if (vis) setVisibility(vis);
  if (editEvent.groupVisibility) {
    setSelectedGroupIds(editEvent.groupVisibility.map((g) => g.groupId));
  }

  // Capacity
  if (editEvent.capacity != null) {
    setHasCapacity(true);
    setCapacityInput(String(editEvent.capacity));
  }

  // Pitch In
  if (editEvent.pitchInEnabled) {
    setPitchInEnabled(true);
    setPitchInAmount(editEvent.pitchInAmount ?? "");
    setPitchInMethod((editEvent.pitchInMethod as "venmo" | "cashapp" | "paypal" | "other") ?? "venmo");
    setPitchInHandle(editEvent.pitchInHandle ?? "");
    setPitchInNote(editEvent.pitchInNote ?? "");
  }

  // What to Bring
  if (editEvent.bringListEnabled && editEvent.bringListItems?.length) {
    setBringListEnabled(true);
    setBringListItems(editEvent.bringListItems.map((i: { label: string }) => i.label));
  }

  // Theme
  const evtThemeId = (editEvent as any).themeId;
  if (evtThemeId && evtThemeId !== "custom") {
    setSelectedThemeId(evtThemeId);
  }
  if ((editEvent as any).customThemeData) {
    setSelectedCustomTheme({
      id: "custom_existing",
      name: (editEvent as any).customThemeData.name ?? "Custom",
      visualStack: (editEvent as any).customThemeData.visualStack ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Effect
  if ((editEvent as any).effectId) {
    setSelectedEffectId((editEvent as any).effectId);
  }
  if ((editEvent as any).customEffectConfig) {
    setCustomEffectConfig((editEvent as any).customEffectConfig);
  }

  // Cover image
  if (editEvent.eventPhotoUrl) {
    coverMedia.prefillCover(editEvent.eventPhotoUrl);
  }

  setIsEditLoaded(true);
}, [isEditMode, editEvent, isEditLoaded]);
```

- [ ] **Step 4: Add update mutation**

After the existing `createMutation` (~line 288), add:

```typescript
const updateMutation = useMutation({
  mutationFn: (data: UpdateEventRequest) =>
    api.put<UpdateEventResponse>(`/api/events/${editEventId}`, data),
  onSuccess: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidateEventKeys(queryClient, getInvalidateAfterEventEdit(editEventId ?? ""), "event_update");
    queryClient.invalidateQueries({ queryKey: circleKeys.all() });
    safeToast.success("Updated", "Your event has been updated.");
    router.back();
  },
  onError: (error) => {
    safeToast.error("Oops", "That didn't go through. Please try again.");
  },
});
```

- [ ] **Step 5: Branch the submit handler**

In `handleCreate` (line ~398), at the top add an edit-mode branch. Before `createMutation.mutate(createPayload)` (line ~486), add:

```typescript
if (isEditMode) {
  updateMutation.mutate(createPayload as any);
  return;
}
```

Also update the early guard at the top of `handleCreate` to check both mutations:

```typescript
if (createMutation.isPending || updateMutation.isPending) return;
```

- [ ] **Step 6: Update UI labels for edit mode**

Find where the submit button label is set (line ~670). Change:

```typescript
label={createMutation.isPending ? "Creating..." : "Create Invite"}
```

to:

```typescript
label={
  isEditMode
    ? (updateMutation.isPending ? "Saving..." : "Save Changes")
    : (createMutation.isPending ? "Creating..." : "Create Invite")
}
```

Also update the `disabled` and `loading` props:

```typescript
disabled={isEditMode ? updateMutation.isPending : createMutation.isPending}
loading={isEditMode ? updateMutation.isPending : createMutation.isPending}
```

Find where the header title is rendered (likely in `CreateEditorHeader`). If the header component accepts a title prop, pass `isEditMode ? "Edit Event" : "Create Event"`. Check `CreateEditorHeader` props to confirm.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 8: Commit**

```bash
git add src/app/create.tsx
git commit -m "feat(create): add edit mode — pre-populate state and branch submit to PUT"
```

---

### Task 4: Update edit navigation in event detail page

Change the host overflow menu "Edit Event" action to route to the create page instead of the old edit page.

**Files:**
- Modify: `src/app/event/[id].tsx`

- [ ] **Step 1: Change the edit route**

Find the `onEdit` handler (currently `router.push(\`/event/edit/${id}\`)`). Change to:

```typescript
onEdit={() => {
  setShowEventActionsSheet(false);
  Haptics.selectionAsync();
  // Route to create page in edit mode, passing event emoji for hero preview
  router.push(`/create?editEventId=${id}&emoji=${encodeURIComponent(event?.emoji ?? "📅")}` as any);
}}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/app/event/[id].tsx
git commit -m "feat(event-detail): route edit to create page with editEventId param"
```

---

### Task 5: Redirect old edit page

Replace the old edit page with a redirect so any deep links or back-stack entries still work.

**Files:**
- Modify: `src/app/event/edit/[id].tsx`

- [ ] **Step 1: Replace file contents with redirect**

Replace the entire file with:

```typescript
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
    router.replace(`/create?editEventId=${id}` as any);
  }, [id]);

  return null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/app/event/edit/[id].tsx
git commit -m "refactor(edit): replace old edit page with redirect to create?editEventId"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Create a new event from scratch**

Navigate to Create Event, fill in title/description/location/date/theme/effect/cover, tap Create. Confirm event is created and you land on the event detail page. **This is the critical regression check.**

- [ ] **Step 2: Edit an existing event**

From a host event page, tap ··· menu → Edit Event. Confirm:
- Create page opens with "Edit Event" header / "Save Changes" button
- Title, description, location pre-populated
- Start/end dates correct
- Theme and effect render in the atmosphere preview
- Cover image visible in the hero preview
- Visibility setting correct
- Pitch In / What to Bring pre-populated if applicable

- [ ] **Step 3: Save edits**

Change the title, tap Save Changes. Confirm:
- PUT request fires (not POST)
- Toast shows "Updated"
- Navigate back to event detail
- Event detail shows the updated title

- [ ] **Step 4: Verify guest can't access edit mode**

Navigate to someone else's event. Confirm ··· menu does NOT show "Edit Event" (this is already gated by `isMyEvent` in `EventActionsSheet`).

- [ ] **Step 5: Final commit (all changes)**

```bash
git push
```
