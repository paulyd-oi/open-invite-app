/**
 * Contact Matching — Normalize, hash, and match device contacts against backend users.
 *
 * Privacy: raw contact data never leaves the device. Only SHA-256 hashes are sent
 * to the backend for matching. The contactMap is kept locally to display names
 * for invite flows.
 *
 * [GROWTH_P4]
 */

import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import { api } from "./api";
import { devLog } from "./devLog";

// ── Types ────────────────────────────────────────────────────────────────

export interface ContactMatchUser {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
  avatarUrl: string | null;
  matchType: "phone" | "email";
  isFriend: boolean;
  isPending: boolean;
}

export interface UnmatchedContact {
  name: string;
  phone: string | null;
  email: string | null;
}

export interface ContactMatchResult {
  matches: ContactMatchUser[];
  unmatched: UnmatchedContact[];
}

// ── Normalization ────────────────────────────────────────────────────────

/**
 * Normalize a phone number to E.164-like format (digits only, with leading +1 for US).
 * Strips all non-digit characters, adds US country code if 10 digits.
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return null; // Too short to be valid
}

/**
 * SHA-256 hash a string. Must match the backend implementation.
 */
async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

// ── Core ─────────────────────────────────────────────────────────────────

/**
 * Per-contact hash bundle. Tracks every phone + email hash we derived from a
 * single device contact so we can subtract on-platform matches by hash rather
 * than by fragile name equality.
 * [CONTACTS_INVITE_HASH_ECHO_V1]
 */
interface ContactHashes {
  name: string;
  phone: string | null;
  email: string | null;
  phoneHashes: string[];
  emailHashes: string[];
}

/**
 * Extract, normalize, and hash contacts from the device.
 * Returns hashes for the API call + a per-contact hash bundle used locally
 * to build the unmatched (invite) list after the backend response.
 */
export async function extractAndHashContacts(contacts: Contacts.Contact[]): Promise<{
  phoneHashes: string[];
  emailHashes: string[];
  /** One entry per device contact, carrying every hash derived from it. Never sent to backend. */
  contactHashes: ContactHashes[];
}> {
  const phoneHashes: string[] = [];
  const emailHashes: string[] = [];
  const contactHashes: ContactHashes[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const contact of contacts) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
    let primaryPhone: string | null = null;
    let primaryEmail: string | null = null;
    const perContactPhoneHashes: string[] = [];
    const perContactEmailHashes: string[] = [];

    // Hash phone numbers
    if (contact.phoneNumbers) {
      for (const pn of contact.phoneNumbers) {
        if (!pn.number) continue;
        const normalized = normalizePhone(pn.number);
        if (!normalized || seenPhones.has(normalized)) continue;
        seenPhones.add(normalized);
        if (!primaryPhone) primaryPhone = pn.number;
        const hash = await sha256(normalized);
        phoneHashes.push(hash);
        perContactPhoneHashes.push(hash);
      }
    }

    // Hash emails
    if (contact.emails) {
      for (const em of contact.emails) {
        if (!em.email) continue;
        const lower = em.email.toLowerCase();
        if (seenEmails.has(lower)) continue;
        seenEmails.add(lower);
        if (!primaryEmail) primaryEmail = em.email;
        const hash = await sha256(lower);
        emailHashes.push(hash);
        perContactEmailHashes.push(hash);
      }
    }

    // Skip contacts that produced zero hashes — nothing to send, nothing to invite.
    if (perContactPhoneHashes.length === 0 && perContactEmailHashes.length === 0) continue;

    contactHashes.push({
      name,
      phone: primaryPhone,
      email: primaryEmail,
      phoneHashes: perContactPhoneHashes,
      emailHashes: perContactEmailHashes,
    });
  }

  if (__DEV__) {
    devLog(`[CONTACTS_MATCH] extracted ${phoneHashes.length} phones, ${emailHashes.length} emails from ${contacts.length} contacts`);
  }

  return { phoneHashes, emailHashes, contactHashes };
}

/**
 * Full pipeline: fetch contacts, hash, match against backend, return results.
 * Caller must have already obtained contacts permission.
 *
 * Invite-candidate filtering rules — [CONTACTS_INVITE_HASH_ECHO_V1]:
 * A device contact appears in `unmatched` (the "Invite your friends" list)
 * only if NONE of its phone/email hashes matched any Open Invite user.
 * The backend echoes matched hashes (including the viewer's own), so this
 * subtraction is strict and captures:
 *   - existing friends (their phone/email hash matches → excluded)
 *   - pending friend requests (same — still appear in matches)
 *   - on-platform suggestion candidates reachable via contacts
 *   - the viewer themselves (own phone/email hash echoed separately)
 */
export async function matchContacts(): Promise<ContactMatchResult> {
  // Fetch device contacts
  const { data: contacts } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.FirstName, Contacts.Fields.LastName],
    sort: Contacts.SortTypes.FirstName,
  });

  if (!contacts.length) {
    return { matches: [], unmatched: [] };
  }

  // Extract and hash
  const { phoneHashes, emailHashes, contactHashes } = await extractAndHashContacts(contacts);

  if (phoneHashes.length === 0 && emailHashes.length === 0) {
    return { matches: [], unmatched: [] };
  }

  // Call backend — expects matched-hash echo ([CONTACTS_INVITE_HASH_ECHO_V1]).
  // Older server response (missing the echo fields) is tolerated via the
  // name-based fallback below.
  const response = await api.post<{
    matches: ContactMatchUser[];
    matchedPhoneHashes?: string[];
    matchedEmailHashes?: string[];
  }>("/api/contacts/match", {
    phoneHashes,
    emailHashes,
  });

  const matches = response.matches ?? [];
  const matchedPhoneSet = new Set(response.matchedPhoneHashes ?? []);
  const matchedEmailSet = new Set(response.matchedEmailHashes ?? []);
  const hasHashEcho = matchedPhoneSet.size + matchedEmailSet.size > 0
    || Array.isArray(response.matchedPhoneHashes)
    || Array.isArray(response.matchedEmailHashes);

  // Name-based fallback set (defense against older servers missing the hash
  // echo — do NOT rely on this as the primary filter; it's fragile).
  const matchedNames = new Set(
    matches.map((m) => m.name?.toLowerCase()).filter(Boolean) as string[],
  );

  const unmatchedByName = new Map<string, UnmatchedContact>();
  for (const ch of contactHashes) {
    // Need a phone to SMS-invite. Skip contacts with no phone.
    if (!ch.phone) continue;

    // Strict: any hash belonging to this contact matched an Open Invite user
    // (friend, pending, suggestion, or self) → exclude from invite list.
    const anyHashMatched =
      ch.phoneHashes.some((h) => matchedPhoneSet.has(h)) ||
      ch.emailHashes.some((h) => matchedEmailSet.has(h));
    if (anyHashMatched) continue;

    // Fallback for pre-[CONTACTS_INVITE_HASH_ECHO_V1] servers: drop contacts
    // whose name matches a returned user. Once every client has updated and
    // the server always echoes, this branch becomes a no-op.
    if (!hasHashEcho && matchedNames.has(ch.name.toLowerCase())) continue;

    // Dedupe by display name, preferring first-seen (contacts are pre-sorted
    // by first name so first-seen is the most canonical entry).
    if (!unmatchedByName.has(ch.name)) {
      unmatchedByName.set(ch.name, { name: ch.name, phone: ch.phone, email: ch.email });
    }
  }

  const unmatched: UnmatchedContact[] = Array.from(unmatchedByName.values());

  if (__DEV__) {
    devLog(
      `[CONTACTS_MATCH] matches=${matches.length} unmatched=${unmatched.length} hashEcho=${hasHashEcho} matchedPhoneHashes=${matchedPhoneSet.size} matchedEmailHashes=${matchedEmailSet.size}`,
    );
  }

  return { matches, unmatched };
}
