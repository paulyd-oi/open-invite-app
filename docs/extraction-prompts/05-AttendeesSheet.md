**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 5112–5221 of `src/app/event/[id].tsx`)**
```tsx
      {/* Attendees Modal - P0: View all attendees (uses shared BottomSheet) */}
      <BottomSheet
        visible={showAttendeesModal}
        onClose={() => {
          setShowAttendeesModal(false);
          if (__DEV__) devLog('[P1_WHO_COMING_SHEET]', 'close', { eventId: id });
        }}
        heightPct={0.65}
        backdropOpacity={0.5}
      >
        {/* Custom title row — uses effectiveGoingCount (SSOT) */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <UserCheck size={20} color="#22C55E" />
            <Text style={{ fontSize: 18, fontWeight: "600", color: colors.text, marginLeft: 8 }}>
              Who's Coming
            </Text>
            <View style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.md, marginLeft: 8 }}>
              <Text style={{ color: "#166534", fontSize: 12, fontWeight: "700" }}>
                {effectiveGoingCount}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setShowAttendeesModal(false)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Attendees List - P0: guarded for loading / empty / list */}
        <KeyboardAwareScrollView
          style={{ flex: 1, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingBottom: 36 }}
        >
                {isLoadingAttendees ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <ActivityIndicator size="large" color={themeColor} />
                    <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSecondary }}>Loading attendees…</Text>
                  </View>
                ) : attendeesError && !attendeesPrivacyDenied && attendeesList.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <AlertTriangle size={32} color={colors.textTertiary} />
                    <Text style={{ marginTop: 12, fontSize: 15, fontWeight: "600", color: colors.text, textAlign: "center" }}>
                      Couldn't load guest list
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 13, color: colors.textSecondary, textAlign: "center" }}>
                      Something went wrong — tap to try again
                    </Text>
                    <Pressable
                      onPress={() => attendeesQuery.refetch()}
                      style={{
                        marginTop: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: themeColor,
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                        borderRadius: 20,
                        gap: 6,
                      }}
                    >
                      <RefreshCw size={14} color="#FFFFFF" />
                      <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>Retry</Text>
                    </Pressable>
                  </View>
                ) : attendeesList.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <Users size={32} color={colors.textTertiary} />
                    <Text style={{ marginTop: 12, fontSize: 14, color: colors.textSecondary, textAlign: "center" }}>
                      No attendees yet
                    </Text>
                  </View>
                ) : (
                  <>
                {__DEV__ && attendeesList.length > 0 && once('P0_USERROW_SHEET_SOT_event') && void devLog('[P0_USERROW_SHEET_SOT]', { screen: 'event_attendees_sheet', showChevron: false, usesPressedState: true, rowsSampled: attendeesList.length })}
                {attendeesList.map((attendee) => (
                  <View
                    key={attendee.id}
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <UserListRow
                      handle={null}
                      displayName={attendee.name ?? "Guest"}
                      bio={null}
                      avatarUri={attendee.imageUrl}
                      badgeText={(attendee.isHost || attendee.id === event?.user?.id) ? "Host" : null}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setShowAttendeesModal(false);
                        router.push(`/user/${attendee.id}` as any);
                      }}
                    />
                  </View>
                ))}
                  </>
                )}
              </KeyboardAwareScrollView>
      </BottomSheet>
```

**TASK**

Extract AttendeesSheet from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/AttendeesSheet.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/AttendeesSheet.tsx`

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
- `visible: boolean` — showAttendeesModal state
- `isLoading: boolean` — isLoadingAttendees
- `hasError: boolean` — !!attendeesError
- `isPrivacyDenied: boolean` — attendeesPrivacyDenied
- `attendees: Array<{ id: string; name: string | null; imageUrl: string | null; isHost?: boolean }>` — attendeesList
- `effectiveGoingCount: number`
- `hostUserId: string | undefined` — event?.user?.id
- `isDark: boolean`
- `themeColor: string`
- `colors: { text: string; textSecondary: string; textTertiary: string; border: string }`

Callbacks:
- `onClose: () => void` — setShowAttendeesModal(false)
- `onRetry: () => void` — attendeesQuery.refetch()
- `onPressAttendee: (userId: string) => void` — closes sheet + router.push to user profile

**IMPLEMENTATION**

Step 1 — Create `src/components/event/AttendeesSheet.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 5112–5221)
- Import and render <AttendeesSheet />
- Wire all props/callbacks explicitly, narrowest possible

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/AttendeesSheet.tsx`
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
