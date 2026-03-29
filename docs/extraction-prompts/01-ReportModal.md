**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 5003–5110 of `src/app/event/[id].tsx`)**
```tsx
      {/* Report Event Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onPress={() => setShowReportModal(false)}
        >
          <Pressable
            className="rounded-t-3xl p-6 pb-10"
            style={{ backgroundColor: colors.background }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
              Report Event
            </Text>
            <Text className="text-sm mb-4" style={{ color: colors.textSecondary }}>
              Select a reason for your report
            </Text>

            {(["spam", "inappropriate", "safety", "other"] as const).map((reason) => {
              const labels: Record<typeof reason, string> = {
                spam: "Spam",
                inappropriate: "Inappropriate Content",
                safety: "Safety Concern",
                other: "Other",
              };
              const isSelected = selectedReportReason === reason;
              return (
                <Pressable
                  key={reason}
                  className="flex-row items-center py-3 px-4 rounded-xl mb-2"
                  style={{
                    backgroundColor: isSelected ? themeColor + "20" : colors.surface,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? themeColor : colors.border,
                  }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedReportReason(reason);
                  }}
                >
                  <View
                    className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
                    style={{ borderColor: isSelected ? themeColor : colors.border }}
                  >
                    {isSelected && (
                      <View
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: themeColor }}
                      />
                    )}
                  </View>
                  <Text style={{ color: colors.text }}>{labels[reason]}</Text>
                </Pressable>
              );
            })}

            {selectedReportReason === "other" && (
              <TextInput
                className="rounded-xl p-4 mt-2"
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.text,
                  minHeight: 80,
                  textAlignVertical: "top",
                }}
                placeholder="Please describe the issue..."
                placeholderTextColor={colors.textTertiary}
                multiline
                value={reportDetails}
                onChangeText={setReportDetails}
              />
            )}

            <View className="flex-row mt-4 gap-3">
              <Pressable
                className="flex-1 py-4 rounded-xl items-center"
                style={{ backgroundColor: colors.surface }}
                onPress={() => {
                  setShowReportModal(false);
                  setSelectedReportReason(null);
                  setReportDetails("");
                }}
              >
                <Text className="text-base font-medium" style={{ color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>

              <Button
                variant="primary"
                label={isSubmittingReport ? "Submitting..." : "Submit Report"}
                onPress={submitEventReport}
                disabled={!selectedReportReason || isSubmittingReport}
                loading={isSubmittingReport}
                style={{ flex: 1, borderRadius: RADIUS.md }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
```

**TASK**

Extract ReportModal from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/ReportModal.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/ReportModal.tsx`

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
- `visible: boolean` — showReportModal state
- `selectedReportReason: "spam" | "inappropriate" | "safety" | "other" | null`
- `reportDetails: string`
- `isSubmittingReport: boolean`
- `themeColor: string`
- `colors: { background: string; text: string; textSecondary: string; textTertiary: string; surface: string; border: string }`

Callbacks:
- `onClose: () => void` — sets showReportModal(false)
- `onSelectReason: (reason: "spam" | "inappropriate" | "safety" | "other") => void` — setSelectedReportReason
- `onChangeDetails: (text: string) => void` — setReportDetails
- `onSubmit: () => void` — submitEventReport
- `onCancel: () => void` — resets all report state and closes

**IMPLEMENTATION**

Step 1 — Create `src/components/event/ReportModal.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 5003–5110)
- Import and render <ReportModal />
- Wire all props/callbacks explicitly, narrowest possible

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/ReportModal.tsx`
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
