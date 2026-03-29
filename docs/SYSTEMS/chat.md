# Chat (Circles)

> Circle-based group messaging with realtime support.
> Owner: `src/app/circle/[id].tsx`, `src/components/circle/*`

---

## Architecture

Circles are persistent group chats tied to friend groups. Each circle has members, messages, and optional linked events.

---

## Message Model

```typescript
CircleMessage {
  id, circleId, userId, content, imageUrl?,
  createdAt, clientMessageId?,
  user: { id, name?, email?, image? },
  reply?: { messageId, userId, userName, snippet }
}
```

---

## Realtime

| Hook | Purpose |
|------|---------|
| `useCircleRealtime(id, bootStatus, session)` | WebSocket subscription for live messages |
| `useTypingRealtime(id, userId)` | Typing indicator broadcast/receive |
| `useReadHorizonReceiver()` | Read receipt signals |

**Polling fallback:** `refetchInterval: 10000` (10s) when backgrounded or WS unavailable.

---

## Mutations

### Send Message
- `POST /api/circles/${id}/messages`
- Uses `postIdempotent()` for dedup on retry
- Optimistic insert into `circleKeys.single(id)` cache
- Bumps `lastMessageAt` in `circleKeys.all()` for chat list reordering

### System Messages
- Format: `__system:event_created:{JSON}`, `__system:member_left:{JSON}`
- Parsed into rich cards in message list

---

## Query Keys

| Key | Purpose |
|-----|---------|
| `circleKeys.single(id)` | Circle detail + messages |
| `circleKeys.all()` | Circle list + unread counts |
| `circleKeys.unreadCount()` | Badge counts |

---

## Input Bar

- Raw `TextInput` (multiline, maxHeight 80)
- Typing state triggers WS broadcast
- Send button: enabled when `message.trim()` && `!isPending`
- Reply preview bar above input when `replyTarget` set
- Bottom spacing: dynamic via `insets.bottom` from safe area

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app/circle/[id].tsx` | Full chat screen |
| `src/components/circle/CircleChatSection.tsx` | Message bubble rendering |
| `src/components/friends/FriendsChatsPane.tsx` | Circle list in friends tab |

---

## Invariants

- Messages use `postIdempotent()` — no duplicate sends on retry.
- Optimistic cache updates for instant message appearance.
- System messages are content-encoded strings, not separate message types.
- Chat bottom spacing handled dynamically (not via layoutSpacing.ts constants).
