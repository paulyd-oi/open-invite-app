**CONTEXT**

Run first:
`git branch --show-current && git rev-parse --short HEAD && git status --short`

Record output as base state.

Read ONLY: `docs/SYSTEMS/event-page-extraction.md`

This is a SURGICAL TASK. No subagents. Sequential only. Only touch specified files.

**TARGET JSX (lines 4730–5001 of `src/app/event/[id].tsx`)**
```tsx
      {/* Event Actions Bottom Sheet (uses shared BottomSheet) */}
      <BottomSheet
        visible={showEventActionsSheet}
        onClose={() => setShowEventActionsSheet(false)}
        heightPct={0}
        backdropOpacity={0.5}
        title="Event Options"
      >
              {/* Actions */}
              <View style={{ paddingHorizontal: 20 }}>
                {/* Owner Actions (app-created, non-busy only) */}
                {isMyEvent && !event?.isBusy && (
                  <>
                    <Pressable
                      testID="event-detail-menu-edit"
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => {
                        setShowEventActionsSheet(false);
                        Haptics.selectionAsync();
                        router.push(`/event/edit/${id}`);
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                      >
                        <Pencil size={20} color={themeColor} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 16 }}>Edit Event</Text>
                    </Pressable>

                    <Pressable
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => {
                        setShowEventActionsSheet(false);
                        handleDuplicateEvent();
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                      >
                        <Copy size={20} color={themeColor} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 16 }}>Duplicate Event</Text>
                    </Pressable>

                    <Pressable
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                      onPress={() => {
                        setShowEventActionsSheet(false);
                        Haptics.selectionAsync();
                        setTimeout(() => launchEventPhotoPicker(), 350);
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                      >
                        <Camera size={20} color={themeColor} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: 16 }}>
                        {event?.eventPhotoUrl ? "Change Banner Photo" : "Add Banner Photo"}
                      </Text>
                    </Pressable>
                  </>
                )}

                {/* Share - available to everyone (unless busy block) */}
                {!event?.isBusy && (
                  <Pressable
                    className="flex-row items-center py-4"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => {
                      setShowEventActionsSheet(false);
                      Haptics.selectionAsync();
                      shareEvent({ ...event, location: locationDisplay ?? null });
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <Share2 size={20} color={themeColor} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 16 }}>Share Event</Text>
                  </Pressable>
                )}

                {/* Lock Screen Updates — iOS live activity toggle (hidden until native check resolves) */}
                {Platform.OS === "ios" && liveActivityActive !== null && !event?.isBusy && (isMyEvent || myRsvpStatus === "going") && (() => {
                  const startMs = new Date(event.startTime).getTime();
                  const endMs = event.endTime ? new Date(event.endTime).getTime() : startMs + 3600000;
                  const now = Date.now();
                  const hasEnded = now > endMs;
                  if (hasEnded) return null;
                  const startsWithin4h = startMs - now < 4 * 3600000;
                  // Can toggle = native module available + within 4h window
                  const canToggle = liveActivitySupported && startsWithin4h;
                  const subtitle = liveActivityActive
                    ? "On — tracking countdown"
                    : canToggle
                      ? "Off — tap to start"
                      : !liveActivitySupported
                        ? "Requires latest app update"
                        : "Available closer to event start";
                  return (
                    <Pressable
                      className="flex-row items-center py-4"
                      style={{ borderBottomWidth: 1, borderBottomColor: colors.border, opacity: canToggle || liveActivityActive ? 1 : 0.55 }}
                      disabled={!canToggle && !liveActivityActive}
                      onPress={async () => {
                        if (!canToggle && !liveActivityActive) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        if (liveActivityActive) {
                          await endLiveActivity(event.id);
                          setLiveActivityActive(false);
                          liveActivityManuallyDismissed.current = true;
                          safeToast.success("Stopped", "Lock Screen updates off");
                        } else {
                          const ok = await startLiveActivity({
                            eventId: event.id,
                            eventTitle: event.title,
                            startTime: event.startTime,
                            endTime: event.endTime,
                            locationName: locationDisplay,
                            rsvpStatus: isMyEvent ? "going" : (myRsvpStatus ?? "going"),
                            emoji: event.emoji,
                            goingCount: effectiveGoingCount,
                            themeAccentColor: resolveEventTheme(event.themeId).backAccent,
                          });
                          if (ok) {
                            setLiveActivityActive(true);
                            liveActivityManuallyDismissed.current = false;
                            safeToast.success("Started", "Tracking on Lock Screen");
                          } else {
                            safeToast.error("Couldn't start", "Check Live Activities in Settings");
                          }
                        }
                        setShowEventActionsSheet(false);
                      }}
                    >
                      <View
                        className="w-10 h-10 rounded-full items-center justify-center mr-3"
                        style={{ backgroundColor: liveActivityActive ? `${STATUS.going.fg}12` : (isDark ? "#2C2C2E" : "#F3F4F6") }}
                      >
                        <Bell size={20} color={liveActivityActive ? STATUS.going.fg : themeColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 16 }}>Lock Screen Updates</Text>
                        <Text style={{ color: liveActivityActive ? STATUS.going.fg : colors.textTertiary, fontSize: 12, marginTop: 1 }}>
                          {subtitle}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })()}

                {/* Report - only for non-owners, non-busy */}
                {!isMyEvent && !event?.isBusy && (
                  <Pressable
                    className="flex-row items-center py-4"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                    onPress={() => {
                      setShowEventActionsSheet(false);
                      handleReportEvent();
                    }}
                  >
                    <View
                      className="w-10 h-10 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                    >
                      <AlertTriangle size={20} color={colors.textSecondary} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: 16 }}>Report Event</Text>
                  </Pressable>
                )}

                {/* Block Color - host-only invariant [P0_EVENT_COLOR_GATE] */}
                {isMyEvent && !isBusyBlock && (
                <Pressable
                  className="flex-row items-center py-4"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                    // [P0_MODAL_GUARD] Close actions sheet FIRST, then open color picker
                    // after a short delay. Two simultaneous Modals freeze iOS touch handling.
                    if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_start", { from: "event_actions", to: "color", ms: 350 });
                    setShowEventActionsSheet(false);
                    Haptics.selectionAsync();
                    setTimeout(() => {
                      setShowColorPicker(true);
                      if (__DEV__) devLog("[P0_MODAL_GUARD]", "transition_open_child", { from: "event_actions", to: "color", ms: 350 });
                    }, 350);
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
                  >
                    <Palette size={20} color={themeColor} />
                  </View>
                  <View className="flex-1 flex-row items-center justify-between">
                    <Text style={{ color: colors.text, fontSize: 16 }}>Block Color</Text>
                    {currentColorOverride && (
                      <View
                        className="w-6 h-6 rounded-full mr-2"
                        style={{ backgroundColor: currentColorOverride, borderWidth: 2, borderColor: colors.border }}
                      />
                    )}
                  </View>
                </Pressable>
                )}

                {/* Delete Event - host-only destructive action (app-created only) */}
                {isMyEvent && !event?.isBusy && !event?.isImported && (
                <Pressable
                  testID="event-detail-menu-delete"
                  className="flex-row items-center py-4"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                    setShowEventActionsSheet(false);
                    Haptics.selectionAsync();
                    setTimeout(() => setShowDeleteEventConfirm(true), 350);
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
                  >
                    <Trash2 size={20} color={STATUS.destructive.fg} />
                  </View>
                  <Text style={{ color: STATUS.destructive.fg, fontSize: 16, fontWeight: "500" }}>Delete Event</Text>
                </Pressable>
                )}

                {/* [IMPORTED_EVENT] Remove from Open Invite — imported events only */}
                {isMyEvent && !!event?.isImported && (
                <Pressable
                  testID="event-detail-menu-remove-imported"
                  className="flex-row items-center py-4"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                    if (__DEV__) devLog("[IMPORTED_EVENT]", "remove_pressed", { eventId: id });
                    setShowEventActionsSheet(false);
                    Haptics.selectionAsync();
                    setTimeout(() => setShowRemoveImportedConfirm(true), 350);
                  }}
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: "rgba(239,68,68,0.12)" }}
                  >
                    <Trash2 size={20} color={STATUS.destructive.fg} />
                  </View>
                  <Text style={{ color: STATUS.destructive.fg, fontSize: 16, fontWeight: "500" }}>Remove from Open Invite</Text>
                </Pressable>
                )}

                {/* Cancel */}
                <Pressable
                  className="flex-row items-center justify-center py-4 mt-2"
                  onPress={() => setShowEventActionsSheet(false)}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "500" }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
      </BottomSheet>
```

**TASK**

Extract EventActionsSheet from `src/app/event/[id].tsx` into a pure presentational component at `src/components/event/EventActionsSheet.tsx`.

Pure refactor. Do NOT change product behavior. Minimal diff only.

**EXPECTED CHANGED FILES**

- `src/app/event/[id].tsx`
- `src/components/event/EventActionsSheet.tsx`

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
- `visible: boolean` — showEventActionsSheet
- `isMyEvent: boolean`
- `isBusy: boolean` — event?.isBusy
- `isImported: boolean` — !!event?.isImported
- `hasEventPhoto: boolean` — !!event?.eventPhotoUrl
- `isBusyBlock: boolean`
- `currentColorOverride: string | null`
- `myRsvpStatus: string | null`
- `effectiveGoingCount: number`
- `liveActivityActive: boolean | null`
- `liveActivitySupported: boolean`
- `eventId: string` — id
- `eventTitle: string` — event.title
- `eventEmoji: string` — event.emoji
- `eventStartTime: string` — event.startTime
- `eventEndTime: string | null` — event.endTime
- `eventThemeId: string | null` — event.themeId
- `locationDisplay: string | null`
- `isDark: boolean`
- `themeColor: string`
- `colors: { text: string; textSecondary: string; textTertiary: string; border: string }`

Callbacks:
- `onClose: () => void` — setShowEventActionsSheet(false)
- `onEdit: () => void` — closes sheet + navigates to edit
- `onDuplicate: () => void` — closes sheet + handleDuplicateEvent
- `onChangePhoto: () => void` — closes sheet + launchEventPhotoPicker after delay
- `onShare: () => void` — closes sheet + shareEvent
- `onToggleLiveActivity: () => Promise<void>` — start/end live activity logic
- `onReport: () => void` — closes sheet + handleReportEvent
- `onOpenColorPicker: () => void` — closes sheet + opens color picker after delay
- `onDelete: () => void` — closes sheet + setShowDeleteEventConfirm after delay
- `onRemoveImported: () => void` — closes sheet + setShowRemoveImportedConfirm after delay

**IMPLEMENTATION**

Step 1 — Create `src/components/event/EventActionsSheet.tsx`
- Pure presentational component
- Explicit Props interface with narrow types
- All data + callbacks via props
- No business logic, no parent-scope reach-through

Step 2 — Replace inline JSX in parent
- Remove the inline JSX block (lines 4730–5001)
- Import and render <EventActionsSheet />
- Wire all props/callbacks explicitly, narrowest possible

Step 3 — Confirm structural equivalence
- JSX output matches original block exactly
- Prop wiring covers all consumed values
- No conditional logic altered, omitted, or reordered
- Runtime QA done on-device by operator

Step 4 — Scope guard
Do NOT: extract other sections, clean up unrelated code, rename handlers unless required, move utilities, restyle anything.

**ACCEPTANCE CRITERIA**

- Component extracted to `src/components/event/EventActionsSheet.tsx`
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
