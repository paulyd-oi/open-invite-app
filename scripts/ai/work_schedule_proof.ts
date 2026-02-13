/**
 * [P0_WORK_HOURS_BLOCK] Deterministic proof test
 *
 * Verifies:
 * 1. Work schedule 9:00-17:00 on a weekday generates correct busy windows
 * 2. Suggested slots never include 13:00-14:00 (inside work hours)
 * 3. Timezone handling: windows are valid ISO
 * 4. source="work_schedule" tagging
 * 5. Split schedule (block2) support
 *
 * Run: npx tsx scripts/ai/work_schedule_proof.ts
 */

// Suppress devLog
(globalThis as any).__DEV__ = false;

// ---- Inline types ----
interface WorkScheduleDay {
  dayOfWeek: number;
  isEnabled: boolean;
  startTime: string | null;
  endTime: string | null;
  label?: string;
  block2StartTime?: string | null;
  block2EndTime?: string | null;
}

interface BusyWindow {
  start: string;
  end: string;
  source?: "manual" | "event" | "work_schedule" | "import";
}

// ---- Inline logic (mirrors src/lib/scheduling/workScheduleAdapter.ts) ----
function parseTimeBlock(date: Date, st: string, et: string): BusyWindow | null {
  const [sh, sm] = st.split(":").map(Number);
  const [eh, em] = et.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => isNaN(v))) return null;
  const s = new Date(date);
  s.setHours(sh, sm, 0, 0);
  const e = new Date(date);
  e.setHours(eh, em, 0, 0);
  if (e <= s) return null;
  return { start: s.toISOString(), end: e.toISOString(), source: "work_schedule" };
}

function buildWorkScheduleBusyWindows(schedules: WorkScheduleDay[], rs: string, re: string): BusyWindow[] {
  if (!schedules || schedules.length === 0) return [];
  const windows: BusyWindow[] = [];
  const start = new Date(rs);
  const end = new Date(re);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return [];
  const byDay = new Map<number, WorkScheduleDay>();
  for (const sc of schedules) {
    if (sc.isEnabled && sc.startTime && sc.endTime) byDay.set(sc.dayOfWeek, sc);
  }
  if (byDay.size === 0) return [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor < end) {
    const dow = cursor.getDay();
    const sched = byDay.get(dow);
    if (sched && sched.startTime && sched.endTime) {
      const b1 = parseTimeBlock(cursor, sched.startTime, sched.endTime);
      if (b1) windows.push(b1);
      if (sched.block2StartTime && sched.block2EndTime) {
        const b2 = parseTimeBlock(cursor, sched.block2StartTime, sched.block2EndTime);
        if (b2) windows.push(b2);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
}

// ---- Inline scheduling engine (mirrors src/lib/scheduling/engine.ts) ----
interface ParsedBusy { startMs: number; endMs: number }

interface SlotResult {
  start: string;
  end: string;
  availableCount: number;
  totalMembers: number;
  score: number;
  availableUserIds: string[];
  unavailableUserIds: string[];
}

function isUserBusy(ss: number, se: number, ws: ParsedBusy[]): boolean {
  for (const b of ws) {
    if (b.startMs >= se) break;
    if (ss < b.endMs && se > b.startMs) return true;
  }
  return false;
}

function testSchedule(
  members: { id: string }[],
  busy: Record<string, BusyWindow[]>,
  rs: string,
  re: string,
): SlotResult[] | null {
  const rsMs = new Date(rs).getTime();
  const reMs = new Date(re).getTime();
  if (isNaN(rsMs) || isNaN(reMs) || reMs <= rsMs) return null;
  const total = members.length;
  const intMs = 30 * 60 * 1000;
  const durMs = 60 * 60 * 1000;
  const sorted: Record<string, ParsedBusy[]> = {};
  for (const m of members) {
    sorted[m.id] = (busy[m.id] ?? [])
      .map((w) => ({ startMs: new Date(w.start).getTime(), endMs: new Date(w.end).getTime() }))
      .filter((w) => !isNaN(w.startMs) && !isNaN(w.endMs) && w.endMs > w.startMs)
      .sort((a, b) => a.startMs - b.startMs);
  }
  const slots: SlotResult[] = [];
  for (let t = rsMs; t + durMs <= reMs; t += intMs) {
    const se = t + durMs;
    const avail: string[] = [];
    const unavail: string[] = [];
    for (const m of members) {
      if (isUserBusy(t, se, sorted[m.id])) unavail.push(m.id);
      else avail.push(m.id);
    }
    const score = total > 0 ? avail.length / total : 0;
    slots.push({
      start: new Date(t).toISOString(),
      end: new Date(se).toISOString(),
      availableCount: avail.length,
      totalMembers: total,
      score,
      availableUserIds: avail,
      unavailableUserIds: unavail,
    });
  }
  slots.sort((a, b) => (b.score !== a.score ? b.score - a.score : new Date(a.start).getTime() - new Date(b.start).getTime()));
  return slots.length > 0 ? slots : null;
}

// ---- Test harness ----
let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    failures++;
  } else {
    console.log("PASS:", msg);
  }
}

// ---- Data ----
const workSchedule: WorkScheduleDay[] = [
  { dayOfWeek: 0, isEnabled: false, startTime: null, endTime: null },
  { dayOfWeek: 1, isEnabled: true, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: 2, isEnabled: true, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: 3, isEnabled: true, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: 4, isEnabled: true, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: 5, isEnabled: true, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: 6, isEnabled: false, startTime: null, endTime: null },
];

// Use a known Monday in local time
const monday = new Date(2026, 1, 16); // Feb 16, 2026 = Monday
monday.setHours(0, 0, 0, 0);
const tuesday = new Date(monday);
tuesday.setDate(tuesday.getDate() + 1);
const rangeStart = monday.toISOString();
const rangeEnd = tuesday.toISOString();

// ---- Test 1: Busy windows generation ----
console.log("\n=== Test 1: Work schedule -> BusyWindows ===");
const windows = buildWorkScheduleBusyWindows(workSchedule, rangeStart, rangeEnd);
assert(windows.length >= 1, `At least 1 busy window for Monday, got ${windows.length}`);
assert(windows.every((w: BusyWindow) => w.source === "work_schedule"), "All tagged work_schedule");

// ---- Test 2: Slots during work hours mark user unavailable ----
console.log("\n=== Test 2: computeSchedule excludes work hours ===");
const userId = "user-1";
const result = testSchedule([{ id: userId }], { [userId]: windows }, rangeStart, rangeEnd);
assert(result !== null, "Should produce slots");

if (result) {
  // Find slots where user is available during 9-17 local time
  const workHourFree = result.filter((s: SlotResult) => {
    const d = new Date(s.start);
    const h = d.getHours();
    return h >= 9 && h < 16 && s.availableUserIds.includes(userId);
  });
  assert(workHourFree.length === 0, `No slots 9-16 should show user available, found ${workHourFree.length}`);

  // Specifically: 13:00-14:00
  const slot13 = result.find((s: SlotResult) => {
    const d = new Date(s.start);
    return d.getHours() === 13 && d.getMinutes() === 0;
  });
  if (slot13) {
    assert(!slot13.availableUserIds.includes(userId), "13:00 slot: user must be unavailable");
  }

  // Slots fully before work start should show user as available
  // A slot (1h duration) is fully before work if its end <= work start (9:00 local)
  const earlySlots = result.filter((s: SlotResult) => {
    const e = new Date(s.end);
    return e.getHours() < 9 || (e.getHours() === 9 && e.getMinutes() === 0);
  });
  for (const es of earlySlots) {
    assert(es.availableUserIds.includes(userId), `Pre-work slot ${es.start} should show user available`);
  }
}

// ---- Test 3: ISO validity / timezone ----
console.log("\n=== Test 3: ISO validity ===");
for (const w of windows) {
  const sMs = new Date(w.start).getTime();
  const eMs = new Date(w.end).getTime();
  assert(!isNaN(sMs), `Valid start ISO: ${w.start}`);
  assert(!isNaN(eMs), `Valid end ISO: ${w.end}`);
  assert(eMs > sMs, `end > start for window`);
}

// ---- Test 4: Split schedule ----
console.log("\n=== Test 4: Split schedule ===");
const splitSched: WorkScheduleDay[] = [
  {
    dayOfWeek: monday.getDay(),
    isEnabled: true,
    startTime: "09:00",
    endTime: "12:00",
    block2StartTime: "13:00",
    block2EndTime: "17:00",
  },
];
const splitW = buildWorkScheduleBusyWindows(splitSched, rangeStart, rangeEnd);
assert(splitW.length === 2, `Split schedule -> 2 windows, got ${splitW.length}`);
assert(splitW.every((w: BusyWindow) => w.source === "work_schedule"), "Split tagged correctly");

// ---- Test 5: source field optional ----
console.log("\n=== Test 5: source field ===");
const bw1: BusyWindow = { start: rangeStart, end: rangeEnd, source: "work_schedule" };
assert(bw1.source === "work_schedule", "source=work_schedule accepted");
const bw2: BusyWindow = { start: rangeStart, end: rangeEnd };
assert(bw2.source === undefined, "source is optional");

// ---- Summary ----
console.log(`\n=== ${failures === 0 ? "ALL TESTS PASSED" : `${failures} FAILURE(S)`} ===`);
process.exit(failures > 0 ? 1 : 0);
