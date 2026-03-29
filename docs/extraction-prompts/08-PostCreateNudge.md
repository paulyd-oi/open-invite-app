**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 2764–2856 of `src/app/event/[id].tsx`)**
```tsx
        {/* ═══ POST-CREATE INVITE ACTIONS ═══ */}
        {showCreateNudge && isMyEvent && (
          <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
            <View style={{
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: RADIUS.xl,
              backgroundColor: isDark ? `${themeColor}18` : `${themeColor}10`,
              borderWidth: 0.5,
              borderColor: isDark ? `${themeColor}30` : `${themeColor}20`,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Your event is live</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>Invite people to get responses</Text>
                </View>
                <Pressable
                  onPress={() => setShowCreateNudge(false)}
                  style={{ padding: 6 }}
                  hitSlop={8}
                >
                  <X size={14} color={colors.textTertiary} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {/* Copy Link */}
                <Pressable
                  onPress={async () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    trackShareTriggered({ eventId: event.id, method: "copy", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                    const link = getEventUniversalLink(event.id);
                    await Clipboard.setStringAsync(link);
                    safeToast.success("Link copied");
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 10,
                    borderRadius: RADIUS.lg,
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  }}
                >
                  <Copy size={14} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Copy Link</Text>
                </Pressable>
                {/* SMS */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    trackShareTriggered({ eventId: event.id, method: "sms", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                    const body = buildEventSmsBody(buildShareInput({ ...event, location: locationDisplay ?? null }));
                    Linking.openURL(`sms:&body=${encodeURIComponent(body)}`);
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 10,
                    borderRadius: RADIUS.lg,
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  }}
                >
                  <MessageCircle size={14} color={colors.text} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text, marginLeft: 5 }}>Text</Text>
                </Pressable>
                {/* Share Sheet */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    trackShareTriggered({ eventId: event.id, method: "native", userId: session?.user?.id ?? null, isCreator: isMyEvent });
                    shareEvent({ ...event, location: locationDisplay ?? null });
                  }}
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 10,
                    borderRadius: RADIUS.lg,
                    backgroundColor: themeColor,
                  }}
                >
                  <Share2 size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", marginLeft: 5 }}>More</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        )}
```

**TASK**

Extract PostCreateNudge from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/PostCreateNudge.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/PostCreateNudge.tsx`

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
- `visible: boolean` — showCreateNudge && isMyEvent
- `isDark: boolean`
- `themeColor: string`
- `colors: { text: string; textSecondary: string; textTertiary: string }`

Callbacks:
- `onDismiss: () => void` — setShowCreateNudge(false)
- `onCopyLink: () => void` — trackShareTriggered(copy) + copy universal link + toast
- `onSendSms: () => void` — trackShareTriggered(sms) + open SMS with SSOT body
- `onShareSheet: () => void` — trackShareTriggered(native) + shareEvent

**IMPLEMENTATION**

Step 1 — Create `src/components/event/PostCreateNudge.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 2764–2856)
- Import and render <PostCreateNudge />
- Wire all props/callbacks explicitly, narrowest possible
- Parent pre-computes all callback logic (tracking, link building, SMS body)

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/PostCreateNudge.tsx`
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
