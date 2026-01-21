HANDOFF PACKET - Product Ontology Refactor (Groups / Proposed Events)
======================================================================

SUMMARY
-------
Completed product ontology consolidation:
- User-facing "Circles" renamed to "Groups" (internal code remains "circle")
- User-facing "Event Requests" renamed to "Proposed Events" (internal code remains "event-requests")
- Added Settings button to Group header with Group Settings modal
- Navigation architecture preserved, no auth/premium code touched, no new dependencies

PRODUCT BEHAVIOR CHECKLIST
--------------------------
[x] All user-facing text shows "Groups" not "Circles"
[x] All user-facing text shows "Proposed Events" not "Event Requests"
[x] Group screen has Settings button in header (left of Add Member)
[x] Group Settings modal has: group info, Members option, Leave Group option
[x] Internal API routes still use /api/circles and /api/event-requests
[x] Calendar proposed events section updated
[x] Help/FAQ content updated for new terminology
[x] Freemium limits display updated for Groups terminology
[x] Paywall prompts updated for Groups terminology
[x] Navigation architecture unchanged
[x] Auth/login/logout code untouched
[x] Premium/entitlements code untouched
[x] No new dependencies added
[x] TypeScript compilation passes (0 errors)

FILES CHANGED
-------------
1. src/app/circles.tsx - "Circles" title/subtitle/empty state -> "Groups"
2. src/app/friends.tsx - "Create a Circle" -> "Create a Group"
3. src/components/CreateCircleModal.tsx - "New Circle" -> "New Group"
4. src/app/circle/[id].tsx - Added Settings button + Group Settings Modal
5. src/app/calendar.tsx - "Event Requests" section -> "Proposed Events"
6. src/app/create-event-request.tsx - Title -> "Propose Event"
7. src/app/event-request/[id].tsx - All titles -> "Proposed Event"
8. src/app/_layout.tsx - Route header titles updated
9. src/app/notification-settings.tsx - Section renamed
10. src/app/help-faq.tsx - Full help sections updated for Groups and Proposed Events
11. src/lib/freemiumLimits.ts - "Unlimited Circles" -> "Unlimited Groups"
12. src/components/paywall/PaywallModal.tsx - Circle limit copy -> Groups

KEY DIFFS
---------
circles.tsx: "Circles" -> "Groups" (title, subtitle, loading text, empty state)
CreateCircleModal.tsx: "New Circle" -> "New Group", "Circle Name" -> "Group Name"
calendar.tsx: "Event Requests" -> "Proposed Events", "New" button -> "Propose"
circle/[id].tsx: Added showGroupSettings state + Settings icon button + Modal:
  - Modal header: "Group Settings"
  - Group info: emoji, name, member count
  - Members option: opens add members modal
  - Leave Group: navigates back with toast

COMMANDS RUN
------------
npx tsc --noEmit --project tsconfig.frontend.json  (Result: 0 errors)
git status (Result: 12 modified files)
git add -A && git commit (Result: commit 8717bbf)

RUNTIME STATUS
--------------
Not tested at runtime - TypeScript compilation verified clean

NEXT STEPS
----------
1. Test on simulator/device:
   - Open Groups tab, verify "Groups" title
   - Tap into a group, verify Settings button in header
   - Open Group Settings, verify Members and Leave options work
   - Open Calendar, verify "Proposed Events" section
   - Create proposed event, verify flow titles
   - Open Help/FAQ, verify Groups and Proposed Events content

2. Optional: Push to origin/main when ready

COMMIT INFO
-----------
Branch: main (ahead by 1 commit)
Commit: 8717bbf
Message: refactor: collapse product ontology - Circles to Groups, Event Requests to Proposed Events
