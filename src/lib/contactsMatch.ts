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
 * Extract, normalize, and hash contacts from the device.
 * Returns hashes for the API call + a local map for displaying unmatched contacts.
 */
export async function extractAndHashContacts(contacts: Contacts.Contact[]): Promise<{
  phoneHashes: string[];
  emailHashes: string[];
  /** Maps hash → contact info for unmatched display. Never sent to backend. */
  contactMap: Map<string, UnmatchedContact>;
}> {
  const phoneHashes: string[] = [];
  const emailHashes: string[] = [];
  const contactMap = new Map<string, UnmatchedContact>();
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const contact of contacts) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
    let primaryPhone: string | null = null;
    let primaryEmail: string | null = null;

    // Hash phone numbers
    if (contact.phoneNumbers) {
      for (const pn of contact.phoneNumbers) {
        if (!pn.number) continue;
        const normalized = normalizePhone(pn.number);
        if (!normalized || seenPhones.has(normalized)) continue;
        seenPhones.add(normalized);
        if (!primaryPhone) primaryPhone = normalized;
        const hash = await sha256(normalized);
        phoneHashes.push(hash);
        contactMap.set(hash, { name, phone: pn.number, email: null });
      }
    }

    // Hash emails
    if (contact.emails) {
      for (const em of contact.emails) {
        if (!em.email) continue;
        const lower = em.email.toLowerCase();
        if (seenEmails.has(lower)) continue;
        seenEmails.add(lower);
        if (!primaryEmail) primaryEmail = lower;
        const hash = await sha256(lower);
        emailHashes.push(hash);
        if (!contactMap.has(hash)) {
          contactMap.set(hash, { name, phone: primaryPhone, email: em.email });
        }
      }
    }

    // If contact had phone but no email entry in map, ensure we have a display entry
    if (primaryPhone && !primaryEmail) {
      // Already added via phone hash above
    }
  }

  if (__DEV__) {
    devLog(`[CONTACTS_MATCH] extracted ${phoneHashes.length} phones, ${emailHashes.length} emails from ${contacts.length} contacts`);
  }

  return { phoneHashes, emailHashes, contactMap };
}

/**
 * Full pipeline: fetch contacts, hash, match against backend, return results.
 * Caller must have already obtained contacts permission.
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
  const { phoneHashes, emailHashes, contactMap } = await extractAndHashContacts(contacts);

  if (phoneHashes.length === 0 && emailHashes.length === 0) {
    return { matches: [], unmatched: [] };
  }

  // Call backend
  const response = await api.post<{ matches: ContactMatchUser[] }>("/api/contacts/match", {
    phoneHashes,
    emailHashes,
  });

  const matches = response.matches ?? [];

  // Build unmatched list: all hashed contacts minus those that matched
  const matchedHashes = new Set<string>();
  // We don't get back which hash matched, so exclude by userId presence
  // Build unmatched from contacts that have phone numbers (for SMS invite)
  const matchedUserIds = new Set(matches.map((m) => m.id));

  // Collect unique unmatched contacts (by name, prefer phone for SMS)
  const unmatchedByName = new Map<string, UnmatchedContact>();
  for (const [, contact] of contactMap) {
    if (!unmatchedByName.has(contact.name) && contact.phone) {
      unmatchedByName.set(contact.name, contact);
    }
  }

  // Remove contacts whose name matches a matched user (best-effort dedup)
  const matchedNames = new Set(matches.map((m) => m.name?.toLowerCase()).filter(Boolean));
  const unmatched: UnmatchedContact[] = [];
  for (const [name, contact] of unmatchedByName) {
    if (!matchedNames.has(name.toLowerCase())) {
      unmatched.push(contact);
    }
  }

  if (__DEV__) {
    devLog(`[CONTACTS_MATCH] matches=${matches.length} unmatched=${unmatched.length}`);
  }

  return { matches, unmatched };
}
