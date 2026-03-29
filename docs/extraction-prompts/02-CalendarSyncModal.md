**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 4556–4643 of `src/app/event/[id].tsx`)**
```tsx
      {/* Calendar Sync Modal */}
      <Modal
        visible={showSyncModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSyncModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowSyncModal(false)}
        >
          <Pressable onPress={() => {}} className="mx-4 mb-8">
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface }}>
              {/* Header */}
              <View className="px-5 py-4 border-b" style={{ borderColor: colors.border }}>
                <Text className="text-lg font-bold text-center" style={{ color: colors.text }}>
                  Sync to Calendar
                </Text>
                <Text className="text-sm text-center mt-1" style={{ color: colors.textSecondary }}>
                  Choose where to add this event
                </Text>
              </View>

              {/* Google Calendar Option */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowSyncModal(false);
                  openGoogleCalendar({ ...event, location: locationDisplay ?? null });
                }}
                className="flex-row items-center px-5 py-4 border-b"
                style={{ borderColor: colors.border }}
              >
                <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: "#4285F4" + "15" }}>
                  <Text className="text-2xl">📅</Text>
                </View>
                <View className="flex-1 ml-4">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>
                    Google Calendar
                  </Text>
                  <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                    Opens in browser to add event
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textTertiary} />
              </Pressable>

              {/* Apple Calendar Option */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowSyncModal(false);
                  addToDeviceCalendar({ ...event, location: locationDisplay ?? null }, safeToast);
                }}
                className="flex-row items-center px-5 py-4"
              >
                <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: "#FF3B30" + "15" }}>
                  <Text className="text-2xl">🗓️</Text>
                </View>
                <View className="flex-1 ml-4">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>
                    Apple Calendar
                  </Text>
                  <Text className="text-sm mt-0.5" style={{ color: colors.textSecondary }}>
                    Adds event directly to calendar
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.textTertiary} />
              </Pressable>
            </View>

            {/* Cancel Button */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setShowSyncModal(false);
              }}
              className="rounded-2xl items-center py-4 mt-2"
              style={{ backgroundColor: colors.surface }}
            >
              <Text className="font-semibold text-base" style={{ color: colors.text }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
```

**TASK**

Extract CalendarSyncModal from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/CalendarSyncModal.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/CalendarSyncModal.tsx`

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
- `visible: boolean` — showSyncModal state
- `colors: { text: string; textSecondary: string; textTertiary: string; surface: string; border: string }`

Callbacks:
- `onClose: () => void` — setShowSyncModal(false)
- `onGoogleCalendar: () => void` — closes modal + calls openGoogleCalendar
- `onAppleCalendar: () => void` — closes modal + calls addToDeviceCalendar

**IMPLEMENTATION**

Step 1 — Create `src/components/event/CalendarSyncModal.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 4556–4643)
- Import and render <CalendarSyncModal />
- Wire all props/callbacks explicitly, narrowest possible

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/CalendarSyncModal.tsx`
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
