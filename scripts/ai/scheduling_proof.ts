/**
 * Scheduling Engine v1 — Proof Harness
 *
 * Run: npx tsx scripts/ai/scheduling_proof.ts
 *
 * Validates all SCHED_ENGINE invariants without new dependencies.
 * Uses the real computeSchedule() from the SSOT engine module.
 */

// Shim __DEV__ for Node (engine guards proof logs behind it)
(globalThis as any).__DEV__ = true;

// Use tsx path alias resolution via tsconfig — import via @/ alias
import { computeSchedule } from "../../src/lib/scheduling/engine";
import { buildBusyWindowsFromMemberEvents } from "../../src/lib/scheduling/adapters";
import type { SchedulingComputeInput } from "../../src/lib/scheduling/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Helper: fixed date range for deterministic tests
// ---------------------------------------------------------------------------
const BASE = "2026-03-01T09:00:00.000Z";
const BASE_END = "2026-03-02T21:00:00.000Z"; // 36h range

function makeMembers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `user-${i}` }));
}

// ===== TEST 1: INV-S3 — Always returns at least 1 slot =====
console.log("\n[TEST 1] INV-S3: at least 1 slot for valid range");
{
  const input: SchedulingComputeInput = {
    members: makeMembers(3),
    busyWindowsByUserId: {},
    rangeStart: BASE,
    rangeEnd: BASE_END,
  };
  const result = computeSchedule(input);
  assert(result !== null, "result is not null");
  assert(result!.topSlots.length >= 1, "topSlots.length >= 1");
  assert(result!.topSlots.length <= 3, "topSlots.length <= 3");
}

// ===== TEST 2: hasPerfectOverlap when no busy windows =====
console.log("\n[TEST 2] hasPerfectOverlap = true when all members are free");
{
  const input: SchedulingComputeInput = {
    members: makeMembers(5),
    busyWindowsByUserId: {},
    rangeStart: BASE,
    rangeEnd: BASE_END,
  };
  const result = computeSchedule(input)!;
  assert(result.hasPerfectOverlap === true, "hasPerfectOverlap is true");
  assert(result.bestSlot.availableCount === 5, "bestSlot.availableCount === 5");
  assert(result.bestSlot.score === 1, "bestSlot.score === 1");
  assert(result.bestSlot.availabilityPercent === 100, "bestSlot.availabilityPercent === 100");
}

// ===== TEST 3: INV-S2 — Determinism =====
console.log("\n[TEST 3] INV-S2: deterministic output for same input");
{
  const input: SchedulingComputeInput = {
    members: makeMembers(4),
    busyWindowsByUserId: {
      "user-0": [{ start: "2026-03-01T10:00:00.000Z", end: "2026-03-01T12:00:00.000Z" }],
      "user-2": [{ start: "2026-03-01T14:00:00.000Z", end: "2026-03-01T16:00:00.000Z" }],
    },
    rangeStart: BASE,
    rangeEnd: BASE_END,
    intervalMinutes: 30,
    slotDurationMinutes: 60,
  };
  const r1 = computeSchedule(input)!;
  const r2 = computeSchedule(input)!;
  assert(r1.topSlots.length === r2.topSlots.length, "same topSlots count");
  const same = r1.topSlots.every(
    (s, i) => s.start === r2.topSlots[i].start && s.end === r2.topSlots[i].end && s.score === r2.topSlots[i].score
  );
  assert(same, "identical topSlots ordering and values");
  assert(r1.hasPerfectOverlap === r2.hasPerfectOverlap, "same hasPerfectOverlap");
}

// ===== TEST 4: Overlap detection correctness =====
console.log("\n[TEST 4] Overlap detection: known busy window blocks user");
{
  // user-0 busy 10:00-12:00, user-1 free
  const input: SchedulingComputeInput = {
    members: makeMembers(2),
    busyWindowsByUserId: {
      "user-0": [{ start: "2026-03-01T10:00:00.000Z", end: "2026-03-01T12:00:00.000Z" }],
    },
    rangeStart: "2026-03-01T10:00:00.000Z",
    rangeEnd: "2026-03-01T12:00:00.000Z",
    intervalMinutes: 30,
    slotDurationMinutes: 60,
  };
  const result = computeSchedule(input)!;
  assert(result !== null, "result is not null");
  // The slot 10:00-11:00 should show user-0 unavailable
  const slot10 = result.topSlots.find((s) => s.start === "2026-03-01T10:00:00.000Z");
  assert(slot10 !== undefined, "found slot at 10:00");
  assert(slot10!.unavailableUserIds.includes("user-0"), "user-0 is unavailable at 10:00");
  assert(slot10!.availableUserIds.includes("user-1"), "user-1 is available at 10:00");
  assert(slot10!.availableCount === 1, "availableCount === 1");
  assert(result.hasPerfectOverlap === false, "hasPerfectOverlap is false (user-0 busy)");
}

// ===== TEST 5: Quorum correctness =====
console.log("\n[TEST 5] Quorum: quorumMet field correctness");
{
  // 3 members, user-0 busy entire range => only 2 free
  const input: SchedulingComputeInput = {
    members: makeMembers(3),
    busyWindowsByUserId: {
      "user-0": [{ start: BASE, end: BASE_END }],
    },
    rangeStart: BASE,
    rangeEnd: BASE_END,
    intervalMinutes: 60,
    slotDurationMinutes: 60,
    quorumCount: 3,
  };
  const result = computeSchedule(input)!;
  assert(result !== null, "result not null");
  // All slots have only 2 available, quorum=3 so quorumMet should be false
  assert(result.bestSlot.quorumMet === false, "quorumMet=false when only 2/3 available (quorum=3)");
  assert(result.bestSlot.availableCount === 2, "availableCount === 2");

  // Now with quorum=2 → should pass
  const input2: SchedulingComputeInput = { ...input, quorumCount: 2 };
  const result2 = computeSchedule(input2)!;
  assert(result2.bestSlot.quorumMet === true, "quorumMet=true when 2/3 available (quorum=2)");
}

// ===== TEST 6: Safety clamp — NaN dates =====
console.log("\n[TEST 6] Safety clamp: NaN dates return null");
{
  const result = computeSchedule({
    members: makeMembers(2),
    busyWindowsByUserId: {},
    rangeStart: "not-a-date",
    rangeEnd: BASE_END,
  });
  assert(result === null, "NaN rangeStart → null");

  const result2 = computeSchedule({
    members: makeMembers(2),
    busyWindowsByUserId: {},
    rangeStart: BASE,
    rangeEnd: "garbage",
  });
  assert(result2 === null, "NaN rangeEnd → null");
}

// ===== TEST 7: Safety clamp — reversed range =====
console.log("\n[TEST 7] Safety clamp: reversed range returns null");
{
  const result = computeSchedule({
    members: makeMembers(2),
    busyWindowsByUserId: {},
    rangeStart: BASE_END,
    rangeEnd: BASE,
  });
  assert(result === null, "reversed range → null");
}

// ===== TEST 8: Safety clamp — huge range clamped to 30 days =====
console.log("\n[TEST 8] Safety clamp: 365-day range clamped to 30 days");
{
  const farEnd = new Date(new Date(BASE).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const result = computeSchedule({
    members: makeMembers(1),
    busyWindowsByUserId: {},
    rangeStart: BASE,
    rangeEnd: farEnd,
    intervalMinutes: 60,
    slotDurationMinutes: 60,
  });
  assert(result !== null, "result is not null");
  // 30 days * 24 hours = 720 slots max at 60-min interval
  assert(result!.topSlots.length <= 3, "topSlots capped at 3");
  // Verify the last slot doesn't exceed 30 days from start
  const lastSlotEnd = new Date(result!.topSlots[result!.topSlots.length - 1].end).getTime();
  const maxEnd = new Date(BASE).getTime() + 30 * 24 * 60 * 60 * 1000;
  assert(lastSlotEnd <= maxEnd, "last slot within 30-day clamp");
}

// ===== TEST 9: Safety clamp — tiny interval floored to 5 min =====
console.log("\n[TEST 9] Safety clamp: interval < 5 min floored to 5");
{
  const result = computeSchedule({
    members: makeMembers(1),
    busyWindowsByUserId: {},
    rangeStart: "2026-03-01T09:00:00.000Z",
    rangeEnd: "2026-03-01T10:00:00.000Z",
    intervalMinutes: 1, // should be clamped to 5
    slotDurationMinutes: 15,
  });
  assert(result !== null, "result is not null");
  // 60 min range, 5 min interval, 15 min duration → slots at 0,5,10,...,45 = 10 slots
  // (only slots where t+15 <= 60, i.e. t <= 45 → 0..45 step 5 = 10)
  // topSlots capped at 3
  assert(result!.topSlots.length === 3, "topSlots.length === 3");
}

// ===== TEST 10: No caller mutation =====
console.log("\n[TEST 10] Perf guard: caller busy windows are not mutated");
{
  const original = [
    { start: "2026-03-01T14:00:00.000Z", end: "2026-03-01T15:00:00.000Z" },
    { start: "2026-03-01T10:00:00.000Z", end: "2026-03-01T11:00:00.000Z" },
  ];
  const copy = JSON.parse(JSON.stringify(original));
  computeSchedule({
    members: [{ id: "u1" }],
    busyWindowsByUserId: { u1: original },
    rangeStart: BASE,
    rangeEnd: BASE_END,
  });
  const unchanged = original.every(
    (w, i) => w.start === copy[i].start && w.end === copy[i].end
  );
  assert(unchanged, "caller busy windows array not mutated");
  assert(original.length === copy.length, "caller array length preserved");
}

// ===== TEST 11: Empty members =====
console.log("\n[TEST 11] Edge case: zero members returns null");
{
  const result = computeSchedule({
    members: [],
    busyWindowsByUserId: {},
    rangeStart: BASE,
    rangeEnd: BASE_END,
  });
  assert(result === null, "zero members → null");
}

// ===== TEST 12: INV-S4 transparent participation =====
console.log("\n[TEST 12] INV-S4: transparent participation fields");
{
  const result = computeSchedule({
    members: makeMembers(3),
    busyWindowsByUserId: {
      "user-1": [{ start: BASE, end: BASE_END }],
    },
    rangeStart: BASE,
    rangeEnd: BASE_END,
    intervalMinutes: 60,
    slotDurationMinutes: 60,
  })!;
  const slot = result.bestSlot;
  assert(slot.totalMembers === 3, "totalMembers === 3");
  assert(slot.availableCount === 2, "availableCount === 2 (user-1 busy)");
  assert(Array.isArray(slot.availableUserIds), "availableUserIds is array");
  assert(Array.isArray(slot.unavailableUserIds), "unavailableUserIds is array");
  assert(slot.availableUserIds.length + slot.unavailableUserIds.length === 3, "ids sum to totalMembers");
  assert(slot.unavailableUserIds.includes("user-1"), "user-1 in unavailableUserIds");
}

// ===== TEST 13: Adapter — valid events produce correct busy windows =====
console.log("\n[TEST 13] Adapter: valid events → correct busy windows");
{
  const memberEvents = [
    {
      userId: "u1",
      events: [
        { startTime: "2026-03-01T10:00:00.000Z", endTime: "2026-03-01T11:00:00.000Z" },
        { startTime: "2026-03-01T14:00:00.000Z", endTime: "2026-03-01T15:30:00.000Z" },
      ],
    },
    {
      userId: "u2",
      events: [
        { startTime: "2026-03-01T09:00:00.000Z", endTime: null }, // null end → default 1h
      ],
    },
  ];
  const result = buildBusyWindowsFromMemberEvents(memberEvents);
  assert(result["u1"].length === 2, "u1 has 2 busy windows");
  assert(result["u1"][0].start === "2026-03-01T10:00:00.000Z", "u1 window 0 start correct");
  assert(result["u1"][0].end === "2026-03-01T11:00:00.000Z", "u1 window 0 end correct");
  assert(result["u1"][1].start === "2026-03-01T14:00:00.000Z", "u1 window 1 start correct");
  assert(result["u1"][1].end === "2026-03-01T15:30:00.000Z", "u1 window 1 end correct");
  assert(result["u2"].length === 1, "u2 has 1 busy window");
  assert(result["u2"][0].start === "2026-03-01T09:00:00.000Z", "u2 window start correct");
  assert(result["u2"][0].end === "2026-03-01T10:00:00.000Z", "u2 null end → default +1h");
}

// ===== TEST 14: Adapter — invalid events are ignored =====
console.log("\n[TEST 14] Adapter: invalid events ignored");
{
  const memberEvents = [
    {
      userId: "u1",
      events: [
        { startTime: "not-a-date", endTime: "2026-03-01T11:00:00.000Z" },       // NaN start
        { startTime: "2026-03-01T12:00:00.000Z", endTime: "garbage" },           // NaN end
        { startTime: "2026-03-01T14:00:00.000Z", endTime: "2026-03-01T13:00:00.000Z" }, // end < start
        { startTime: "2026-03-01T15:00:00.000Z", endTime: "2026-03-01T15:00:00.000Z" }, // end == start
        { startTime: "2026-03-01T16:00:00.000Z", endTime: "2026-03-01T17:00:00.000Z" }, // valid
      ],
    },
  ];
  const result = buildBusyWindowsFromMemberEvents(memberEvents);
  assert(result["u1"].length === 1, "only 1 valid window survives");
  assert(result["u1"][0].start === "2026-03-01T16:00:00.000Z", "valid window is the correct one");
}

// ===== TEST 15: Adapter — does not mutate input =====
console.log("\n[TEST 15] Adapter: does not mutate input");
{
  const events = [
    { startTime: "2026-03-01T10:00:00.000Z", endTime: "2026-03-01T11:00:00.000Z" },
    { startTime: "2026-03-01T14:00:00.000Z", endTime: null },
  ];
  const memberEvents = [{ userId: "u1", events }];
  const copy = JSON.parse(JSON.stringify(memberEvents));
  buildBusyWindowsFromMemberEvents(memberEvents);
  const unchanged = JSON.stringify(memberEvents) === JSON.stringify(copy);
  assert(unchanged, "input memberEvents not mutated");
  assert(events[1].endTime === null, "null endTime preserved on original");
}

// ===== RESULTS =====
console.log(`\n========================================`);
console.log(`SCHEDULING ENGINE PROOF HARNESS RESULTS`);
console.log(`========================================`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);
if (failed > 0) {
  console.error(`\n*** ${failed} ASSERTION(S) FAILED ***`);
  process.exit(1);
} else {
  console.log(`\nAll assertions passed. Engine invariants hold.`);
  process.exit(0);
}
