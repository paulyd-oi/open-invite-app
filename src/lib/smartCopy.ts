/**
 * smartCopy.ts — SSOT for human-friendly copy strings.
 *
 * Pure functions only. No hooks, no side effects, no imports beyond types.
 * Every UI surface that needs "smart" labels should call these helpers
 * rather than inlining logic.
 */

// ── Availability ─────────────────────────────────────────────────

export function getAvailabilityLabel(input: {
  availableCount: number;
  totalMembers: number;
}): string | null {
  const { availableCount, totalMembers } = input;
  if (totalMembers <= 0) return null;
  if (availableCount === totalMembers) return "Everyone free";
  if (availableCount / totalMembers >= 0.7) return "Great overlap";
  if (availableCount === 1) return "Only 1 free";
  return null;
}

export function getAvailabilitySubLabel(input: {
  slotsCount: number;
}): string | null {
  const { slotsCount } = input;
  if (slotsCount <= 0) return null;
  return `${slotsCount} time${slotsCount !== 1 ? "s" : ""}`;
}

// ── Empty-state copy ─────────────────────────────────────────────

type EmptyStateContext =
  | { kind: "circle_schedule_no_overlap" }
  | { kind: "no_events" }
  | { kind: "no_friends" };

export function getEmptyStateCopy(context: EmptyStateContext): string {
  switch (context.kind) {
    case "circle_schedule_no_overlap":
      return "No perfect overlap yet \u2014 try expanding the window";
    case "no_events":
      return "Create your first invite";
    case "no_friends":
      return "Add a friend to start coordinating";
  }
}

// ── RSVP phrasing ────────────────────────────────────────────────

export function getRsvpPhrase(input: {
  attending: number;
  maybe?: number;
  declined?: number;
  pending?: number;
  total?: number;
}): { headline: string; sub?: string | null } {
  const { attending, maybe = 0, declined = 0, total } = input;

  // Derive pending from total when not explicitly provided
  const pending =
    input.pending ??
    (typeof total === "number" ? Math.max(0, total - attending - maybe - declined) : 0);

  // Headline
  let headline: string;
  if (typeof total === "number" && total > 0 && attending === total) {
    headline = "Everyone\u2019s confirmed";
  } else if (attending > 0) {
    headline = `${attending} are in`;
  } else {
    headline = "No one\u2019s in yet";
  }

  // Sub
  const sub = pending > 0 ? `Waiting on ${pending}` : null;

  return { headline, sub };
}
