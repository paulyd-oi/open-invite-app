# Open Invite Visual System

Single source of truth for Open Invite visual direction.

---

## Core Principle

Open Invite should feel like receiving an invitation, not browsing a feed.

---

## Design Personality

**Be:** warm, social, anticipatory, calm

**Avoid:** sterile, corporate, chaotic, loud

---

## Visual Hierarchy Doctrine

Every screen must prioritize in this order:

1. **Emotion** — how does this moment feel?
2. **Action** — what can the user do right now?
3. **Context** — where are they, what's around them?

---

## Color Doctrine

| Semantic meaning | Color  | Rule                                      |
| ---------------- | ------ | ----------------------------------------- |
| Interested       | Pink   | Always pink. No exceptions.               |
| Going            | Green  | Always green. No exceptions.              |
| Soon             | Orange | Time-pressure indicator.                  |

**Rule:** Never mix emotional colors on one surface. One emotion per card, per row, per moment.

---

## Surface Language

| Surface    | Character                                  |
| ---------- | ------------------------------------------ |
| Swipe card | Cinematic. Minimal overlays. Emotional.    |
| Feed card  | Functional. Fast to scan. Neutral palette. |
| Shortlist  | Tactile. Warm. Decision-driven.            |
| Event page | Immersive. Invitation-first.               |

---

## Background System

| Context  | Treatment                                  |
| -------- | ------------------------------------------ |
| Event    | Photo + blur + gradient overlay            |
| Discover | Soft gradient + subtle atmosphere          |

**Rule:** Never busy backgrounds. The content is the hero, not the backdrop.

---

## Elevation Rules

| Element | Shadow     |
| ------- | ---------- |
| Cards   | Soft       |
| Modals  | Deep       |
| Lists   | Flat       |

**Rule:** Never stack shadows. One elevation layer per element.

---

## Typography Rules

- Maximum 3 text sizes per screen.
- Titles are calm, never cramped.
- Metadata is quiet — small, muted, out of the way.

---

## Motion Doctrine

- **Slow in** — elements arrive gently.
- **Fast out** — elements leave quickly and decisively.
- No playful bounce. Motion communicates intent, not personality.

---

## Anti-Rules

Never:

- Hardcode emotional colors (use semantic tokens)
- Invent gradients per screen
- Use decorative backgrounds
- Over-layer blur
- Use emoji as UI icons
- Create one-off shadows
- Add new border radii casually

---

## Implementation Doctrine

All visuals must:

- Use tokens
- Remain minimal
- Support dark mode
- Preserve readability first

Rules for token and style files:

- Clear language — name tokens by meaning, not appearance
- No hex soup — raw color values live in one place only
- Readable by humans first, machines second
