**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 3228–3317 of `src/app/event/[id].tsx`)**
```tsx
        {/* ═══ HOST TOOLS V2 — turnout tools + host guidance ═══ */}
        {isMyEvent && !event?.isBusy && (() => {
          const hasBringList = event?.bringListEnabled && (event?.bringListItems ?? []).length > 0;
          const bringItems = event?.bringListItems ?? [];
          const bringClaimed = bringItems.filter((i) => !!i.claimedByUserId).length;
          const hasPitchIn = event?.pitchInEnabled && event?.pitchInHandle;

          // ── Build reminder text (SSOT) ──
          const reminderText = buildEventReminderText(buildShareInput({ ...event, location: locationDisplay ?? null }));

          return (
            <Animated.View entering={FadeInDown.delay(85).springify()} style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
              {/* ── Compact action row ── */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                {/* Share */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    trackInviteShared({ entity: "event", sourceScreen: "host_tools" });
                    trackShareTriggered({ eventId: event.id, method: "native", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                    shareEvent({ ...event, location: locationDisplay ?? null });
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: RADIUS.md,
                    backgroundColor: themeColor,
                  }}
                >
                  <Share2 size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 6 }}>Share</Text>
                </Pressable>
                {/* Copy reminder */}
                <Pressable
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    try { await Clipboard.setStringAsync(reminderText); } catch {}
                    safeToast.success("Reminder copied");
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: RADIUS.md,
                    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  }}
                >
                  <Copy size={14} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 6 }}>Reminder</Text>
                </Pressable>
                {/* Edit */}
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push(`/event/edit/${id}`);
                  }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    paddingVertical: 10, borderRadius: RADIUS.md,
                    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  }}
                >
                  <Pencil size={14} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 6 }}>Edit</Text>
                </Pressable>
              </View>

              {/* ── Coordination summaries ── */}
              {(hasBringList || hasPitchIn) && (
                <View style={{ marginTop: 10 }}>
                  {hasBringList && (
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                      <ListChecks size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                        What to bring: {bringClaimed}/{bringItems.length} claimed
                      </Text>
                    </View>
                  )}
                  {hasPitchIn && (
                    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
                      <HandCoins size={13} color={colors.textSecondary} />
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 6 }}>
                        Pitch In: {event.pitchInMethod === "venmo" ? "Venmo" : event.pitchInMethod === "cashapp" ? "Cash App" : event.pitchInMethod === "paypal" ? "PayPal" : ""} @{event.pitchInHandle}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </Animated.View>
          );
        })()}

        {/* Live Activity CTA moved to overflow menu — see Event Options sheet */}
```

**TASK**

Extract HostToolsRow from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/HostToolsRow.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/HostToolsRow.tsx`

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
- `isMyEvent: boolean`
- `isBusy: boolean` — event?.isBusy
- `reminderText: string` — pre-built by parent via buildEventReminderText
- `bringListEnabled: boolean` — event?.bringListEnabled
- `bringListItems: Array<{ claimedByUserId?: string | null }>` — event?.bringListItems
- `pitchInEnabled: boolean` — event?.pitchInEnabled
- `pitchInHandle: string | null` — event?.pitchInHandle
- `pitchInMethod: string | null` — event?.pitchInMethod
- `eventId: string` — id
- `isDark: boolean`
- `themeColor: string`
- `colors: { text: string; textSecondary: string }`

Callbacks:
- `onShare: () => void` — trackInviteShared + trackShareTriggered + shareEvent
- `onCopyReminder: () => void` — copies reminderText to clipboard + toast
- `onEdit: () => void` — router.push to edit page

**IMPLEMENTATION**

Step 1 — Create `src/components/event/HostToolsRow.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through
- Convert the IIFE `(() => { ... })()` pattern to normal component body

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 3228–3317)
- Import and render <HostToolsRow />
- Wire all props/callbacks explicitly, narrowest possible
- Parent computes `reminderText` and passes it as a prop

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/HostToolsRow.tsx`
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
