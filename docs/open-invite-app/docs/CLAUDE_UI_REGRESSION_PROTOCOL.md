# Claude UI Regression Protocol (P0/P1)

**Purpose:**
Eliminate recurring UI regressions permanently by enforcing **structural fixes with proof**, not cosmetic patches.

This protocol is mandatory whenever an issue has:

* Reappeared more than once
* Been “fixed” previously but still shows up
* Involves loading-state flashes, overlays, onboarding popups, entitlement gates, or navigation errors

---

## Core Doctrine

> **No fix is accepted unless it is provable, instrumented, and structurally impossible to regress.**

---

## Mandatory Requirements (Non-Negotiable)

### 1. Exact Code Path Identification

Claude must locate the *real* source of the UI behavior.

Deliverable:

* File path
* Component name
* Function/effect name
* Trigger condition

Example:

* `src/app/calendar.tsx → checkFirstLogin() → useEffect → showGuide`

No patching “nearby” components.

---

### 2. DEV-Only Proof Logs

Claude must add diagnostic logs to expose decision inputs.

Example pattern:

```ts
if (__DEV__) {
  console.log("[GUIDE_DECISION]", {
    userId,
    dismissed,
    friendsFetched,
    eventsFetched,
    friendsCount,
    eventsCount,
    shouldShow,
  });
}
```

Rules:

* Logs must be DEV-only
* Logs must show full decision state
* Logs must be referenced in HANDOFF PACKET

---

### 3. Structural Loading Invariant (Loaded-Once Rule)

Recurring regressions almost always come from placeholder/empty states.

Invariant:

```ts
if (!isFetched) return;
```

Or canonical gating:

```ts
shouldShow = loadedOnce && count===0 && !dismissed;
```

**No onboarding, paywalls, overlays, or gates may render while queries are still loading.**

---

### 4. Cold-Start Proof Test (Required)

Claude must validate fixes under worst-case conditions.

Proof sequence:

1. Kill app completely
2. Relaunch cold
3. Immediately spam navigation + actions
4. Confirm:

   * No flash of regression UI
   * No guide/paywall/overlay appears
   * Logs show correct gating

Results must be included in HANDOFF.

---

### 5. HANDOFF PACKET Proof Section

Every regression fix must include:

* Root cause trace (exact file/function)
* Structural invariant applied
* Proof logs sample output
* Cold-start test confirmation

No HANDOFF is complete without proof.

---

## Acceptance Standard

A fix is only accepted if:

* The correct source code path was identified
* Decision logic is instrumented in DEV
* Placeholder/loading flashes are impossible
* Cold-start test passes
* Regression cannot reappear under timing variance

---

## Canonical Phrase

> **Contract first. Invariants enforced. Proofs shipped.**

---

## Applies To

* Onboarding guides
* Subscription gates
* Modal overlays
* Activity notifications
* Feed flicker/read-state
* Any repeated UI trust-breaker

---

**This protocol is mandatory for App Store-level polish and long-term stability.**
