# Friend Discovery (Find Friends)

> Unified friend discovery surface: search, People You May Know, contacts import + invite.
> Owner: `src/app/add-friends.tsx`, `src/components/FriendDiscoverySurface.tsx`, `src/lib/contactsMatch.ts`
> Backend: `my-app-backend/src/routes/contacts.ts` (POST `/api/contacts/match`)

---

## Sections (top → bottom on the Find Friends screen)

| Section | Source | Purpose |
|---------|--------|---------|
| Add Friend (search + import) | `FriendDiscoverySurface` | Type-to-search by name/email/phone |
| People You May Know | `GET /api/friends/suggestions` | On-platform suggestions (mutuals etc.) |
| {N} friends already on Open Invite | `matchContacts().matches` filtered by `!isFriend` | Contact-matched OI users you haven't friended |
| Already connected | `matchContacts().matches` filtered by `isFriend` | Contact-matched OI users already your friends |
| **Invite your friends** | `matchContacts().unmatched` | **Off-platform contacts only** — SMS/share invite |

The "Invite your friends" section is the SSOT for off-platform invite candidates. Its contract is strict — see below.

---

## Invite-Candidate Contract — `[CONTACTS_INVITE_HASH_ECHO_V1]`

A device contact appears in **Invite your friends** only if **all** of these hold:

1. At least one normalized phone number (required for SMS invite).
2. **None** of the contact's phone/email hashes appear in the backend's `matchedPhoneHashes ∪ matchedEmailHashes` echo from `/api/contacts/match`.

That second condition transitively excludes:

- The current user (backend echoes the viewer's own phone/email hashes separately; self is not in the candidate set but `/api/contacts/match` still checks its hash).
- Any existing Open Invite friend reachable by hash.
- Any user with a pending friend request (sent or received) reachable by hash.
- Any on-platform user surfaced in the "already on Open Invite" or "Already connected" rows above.
- Any suggestion-candidate reachable by contact hash.

Hash-based subtraction replaces the prior name-based dedup, which was fragile (case/alias differences, nicknames, single-word names).

---

## Backend Contract

`POST /api/contacts/match`

**Request:**
```json
{ "phoneHashes": ["sha256(...)", ...], "emailHashes": ["sha256(...)", ...] }
```

**Response (current — `[CONTACTS_INVITE_HASH_ECHO_V1]`):**
```json
{
  "matches": [{ "id", "name", "image", "handle", "avatarUrl", "matchType", "isFriend", "isPending" }],
  "matchedPhoneHashes": ["..."],
  "matchedEmailHashes": ["..."]
}
```

The server hashes its own stored phone/email values at query time (raw contacts never persist). `matchedPhoneHashes` / `matchedEmailHashes` are the subset of incoming hashes that resolved to ANY Open Invite user (including the viewer themselves). The client uses them as the authoritative "on-platform" set.

Clients older than `[CONTACTS_INVITE_HASH_ECHO_V1]` receive a response without the echo fields; `matchContacts()` falls back to a name-based exclusion in that case.

---

## Privacy Invariants

- Raw contact data never leaves the device. Only SHA-256 hashes.
- The server never logs or persists incoming hashes beyond the request lifetime.
- `matchedPhoneHashes` / `matchedEmailHashes` echo back only hashes the client already sent — no new information about other users is leaked.

---

## Invariants

- The invite list MUST subtract by hash, not by name. Name-based dedup is a fallback for legacy servers only.
- Self MUST NOT appear in Invite your friends. Backend checks the viewer's own phone/email against incoming hashes and echoes them alongside candidate matches.
- Existing friends and pending-request users MUST NOT appear in Invite your friends — they will be in `matches` with `isFriend` or `isPending` set, and their hash will be in the echo.
- A contact without a phone number MUST NOT appear in Invite your friends — SMS invite requires a phone.
- Contact extraction MUST dedupe by normalized phone + lowercased email to keep hash sets small and match the server's hashing.
