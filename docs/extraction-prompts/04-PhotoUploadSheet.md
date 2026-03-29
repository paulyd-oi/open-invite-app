**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 5322–5368 of `src/app/event/[id].tsx`)**
```tsx
      {/* Event Photo Upload Sheet */}
      <BottomSheet visible={showPhotoSheet} onClose={() => setShowPhotoSheet(false)} title="Event Photo">
        <View className="px-5 pb-6">
          <Pressable
            onPress={async () => {
              setShowPhotoSheet(false);
              // Wait for sheet dismiss animation before opening picker
              // Prevents iOS gesture/touch blocker overlay freeze
              await new Promise(r => setTimeout(r, 300));
              launchEventPhotoPicker();
            }}
            className="flex-row items-center py-3"
          >
            <Camera size={20} color={themeColor} />
            <Text className="ml-3 text-base font-medium" style={{ color: colors.text }}>
              {event?.eventPhotoUrl ? "Replace photo" : "Upload photo"}
            </Text>
            {uploadingPhoto && <ActivityIndicator size="small" className="ml-auto" color={themeColor} />}
          </Pressable>
          {event?.eventPhotoUrl && (
            <Pressable
              onPress={async () => {
                try {
                  setShowPhotoSheet(false);
                  await api.put(`/api/events/${id}/photo`, { remove: true });
                  invalidateEventMedia(queryClient, id ?? undefined);
                  safeToast.success("Photo removed");
                } catch (e: any) {
                  if (__DEV__) devError("[EVENT_PHOTO_REMOVE]", e);
                  safeToast.error("Failed to remove photo");
                }
              }}
              className="flex-row items-center py-3"
            >
              <Trash2 size={20} color="#EF4444" />
              <Text className="ml-3 text-base font-medium" style={{ color: "#EF4444" }}>Remove photo</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setShowPhotoSheet(false)}
            className="flex-row items-center py-3"
          >
            <X size={20} color={colors.textSecondary} />
            <Text className="ml-3 text-base" style={{ color: colors.textSecondary }}>Cancel</Text>
          </Pressable>
        </View>
      </BottomSheet>
```

**TASK**

Extract PhotoUploadSheet from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/PhotoUploadSheet.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/PhotoUploadSheet.tsx`

No other files. If additional files are needed, escalate before widening scope.

**INVARIANTS**

- All hooks MUST remain in `src/app/event/[id].tsx`
- Do NOT move state, mutations, or business logic out of the parent
- Extracted component must be props-only — no useSession/useTheme/useQuery/global hooks
- Type all props narrowly — do NOT pass full parent objects when only a few fields are consumed
- No any types
- No behavior, copy, styling, or timing changes
- Minimal diff only

**PROPS CONTRACT**

Props:
- `visible: boolean` — showPhotoSheet state
- `hasExistingPhoto: boolean` — !!event?.eventPhotoUrl
- `uploadingPhoto: boolean`
- `themeColor: string`
- `colors: { text: string; textSecondary: string }`

Callbacks:
- `onClose: () => void` — setShowPhotoSheet(false)
- `onUploadPhoto: () => void` — closes sheet, waits 300ms, calls launchEventPhotoPicker
- `onRemovePhoto: () => void` — closes sheet, removes photo via API, invalidates cache
- `onCancel: () => void` — setShowPhotoSheet(false)

**IMPLEMENTATION**

Step 1 — Create `src/components/event/PhotoUploadSheet.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 5322–5368)
- Import and render <PhotoUploadSheet />
- Wire all props/callbacks explicitly, narrowest possible

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/PhotoUploadSheet.tsx`
- Parent behavior unchanged
- All hooks/state/mutations in parent
- Props-only with narrow types, no any
- No UI or copy changes
- Typecheck passes

**OUTPUT FORMAT**

SUMMARY
CHANGED FILES — actual vs expected (mismatch = escalate)
IMPLEMENTATION NOTES
PROOF — parent owns state/handlers; component is props-only; props narrowly typed
RISKS

Do not write extra explanation.
