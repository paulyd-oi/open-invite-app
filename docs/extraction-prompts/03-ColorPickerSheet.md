**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 5223–5320 of `src/app/event/[id].tsx`)**
```tsx
      {/* Color Picker (uses shared BottomSheet) */}
      <BottomSheet
        visible={showColorPicker}
        onClose={() => setShowColorPicker(false)}
        heightPct={0}
        backdropOpacity={0.5}
        title="Block Color"
      >
              <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  Customize how this event appears on your calendar
                </Text>
              </View>

              {/* Color Palette Grid */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {COLOR_PALETTE.map((color) => {
                    const isSelected = currentColorOverride === color;
                    return (
                      <Pressable
                        key={color}
                        onPress={async () => {
                          if (!id) return;
                          // Busy blocks cannot be recolored [P0_EVENT_COLOR_UI]
                          if (isBusyBlock) {
                            if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'blocked_busy', { eventId: id, isBusyBlock });
                            return;
                          }
                          if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'color_pick', { eventId: id, color, isMyEvent });
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          try {
                            await setOverrideColor(id, color);
                            if (__DEV__) {
                              devLog("[EventColorPicker] Color set:", { eventId: id, color });
                            }
                          } catch (error) {
                            safeToast.error("Save Failed", "Failed to save color");
                          }
                        }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: color,
                          borderWidth: isSelected ? 3 : 0,
                          borderColor: colors.text,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isSelected && (
                          <Check size={24} color="#FFFFFF" />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Reset to Default */}
              {currentColorOverride && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                  <Button
                    variant="secondary"
                    label="Reset to Default"
                    onPress={async () => {
                      if (!id) return;
                      // Busy blocks cannot be reset [P0_EVENT_COLOR_UI]
                      if (isBusyBlock) {
                        if (__DEV__) devLog('[P0_EVENT_COLOR_UI]', 'blocked_reset_busy', { eventId: id, isBusyBlock });
                        return;
                      }
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      try {
                        await resetColor(id);
                        if (__DEV__) {
                          devLog("[EventColorPicker] Color reset to default:", { eventId: id });
                        }
                      } catch (error) {
                        safeToast.error("Save Failed", "Failed to reset color");
                      }
                    }}
                    style={{ borderRadius: RADIUS.md }}
                  />
                </View>
              )}

              {/* Done Button */}
              <View style={{ paddingHorizontal: 20 }}>
                <Button
                  variant="primary"
                  label="Done"
                  onPress={() => setShowColorPicker(false)}
                  style={{ borderRadius: RADIUS.md, paddingVertical: 14 }}
                />
              </View>
      </BottomSheet>
```

**TASK**

Extract ColorPickerSheet from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/ColorPickerSheet.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/ColorPickerSheet.tsx`

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
- `visible: boolean` — showColorPicker state
- `currentColorOverride: string | null`
- `isBusyBlock: boolean`
- `eventId: string | undefined` — id param
- `colors: { text: string; textSecondary: string }`

Callbacks:
- `onClose: () => void` — setShowColorPicker(false)
- `onSelectColor: (color: string) => Promise<void>` — setOverrideColor
- `onResetColor: () => Promise<void>` — resetColor

**IMPLEMENTATION**

Step 1 — Create `src/components/event/ColorPickerSheet.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 5223–5320)
- Import and render <ColorPickerSheet />
- Wire all props/callbacks explicitly, narrowest possible

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/ColorPickerSheet.tsx`
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
