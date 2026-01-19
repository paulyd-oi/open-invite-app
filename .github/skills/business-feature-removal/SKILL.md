---
name: business-feature-removal
description: Safely remove business-related UI/routes without breaking navigation or runtime.
---

# Business Feature Removal Playbook

## Objective
Remove business-only UI/routes/screens while keeping app stable.

## Steps
1) Remove route files under `src/app/business*` and any `Stack.Screen` entries referencing them.
2) Remove navigation actions routing to deleted paths.
3) Remove business-only components and UI toggles.
4) Leave backend untouched unless explicitly asked.
5) Leave data-model fields and defensive checks if backend may still return them.

## Safety checks
- Search for route strings: "/business", "business-event", "create-business"
- Search for component names: "BusinessProfile", "BusinessCard", "BusinessDashboard"
- Confirm no remaining imports point to deleted files

## Validation
- App boots to welcome/feed without runtime errors.
- Navigating core tabs does not crash.
- No broken routes in stack.

## Mandatory output
Always end with HANDOFF PACKET.
