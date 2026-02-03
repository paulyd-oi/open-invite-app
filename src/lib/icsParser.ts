/**
 * Simple .ics (iCalendar) parser for importing calendar events
 * Parses basic event properties without external dependencies
 *
 * Supported fields:
 * - SUMMARY (event title)
 * - DTSTART (start date/time)
 * - DTEND (end date/time)
 * - LOCATION (location)
 * - DESCRIPTION (notes/description)
 */

import { devLog, devWarn, devError } from "./devLog";

export interface ParsedICSEvent {
  title: string;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  notes: string | null;
}

/**
 * Parse an .ics file content and extract the first event
 * Returns null if parsing fails or no event found
 */
export function parseICS(icsContent: string): ParsedICSEvent | null {
  try {
    // Normalize line endings
    const normalized = icsContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Find VEVENT block
    const veventMatch = normalized.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/);
    if (!veventMatch) {
      devError('[ICS Parser] No VEVENT found in .ics content');
      return null;
    }

    const eventContent = veventMatch[1];

    // Extract fields
    const title = extractField(eventContent, 'SUMMARY');
    const startTimeStr = extractField(eventContent, 'DTSTART');
    const endTimeStr = extractField(eventContent, 'DTEND');
    const location = extractField(eventContent, 'LOCATION');
    const description = extractField(eventContent, 'DESCRIPTION');

    if (!title || !startTimeStr) {
      devError('[ICS Parser] Missing required fields (SUMMARY or DTSTART)');
      return null;
    }

    // Parse dates
    const startTime = parseICSDate(startTimeStr);
    const endTime = endTimeStr ? parseICSDate(endTimeStr) : null;

    if (!startTime) {
      devError('[ICS Parser] Failed to parse DTSTART:', startTimeStr);
      return null;
    }

    return {
      title: unescapeICSText(title),
      startTime,
      endTime,
      location: location ? unescapeICSText(location) : null,
      notes: description ? unescapeICSText(description) : null,
    };
  } catch (error) {
    devError('[ICS Parser] Error parsing .ics file:', error);
    return null;
  }
}

/**
 * Extract a field value from .ics content
 * Handles multi-line folding (lines starting with space/tab)
 */
function extractField(content: string, fieldName: string): string | null {
  // Match field with optional parameters (e.g., DTSTART;TZID=...)
  const regex = new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)$`, 'm');
  const match = content.match(regex);

  if (!match) return null;

  let value = match[1];

  // Handle line folding (continuation lines start with space or tab)
  const lines = content.split('\n');
  const fieldIndex = lines.findIndex(line => line.match(regex));

  if (fieldIndex !== -1) {
    // Collect continuation lines
    for (let i = fieldIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith(' ') || line.startsWith('\t')) {
        value += line.substring(1);
      } else {
        break;
      }
    }
  }

  return value.trim();
}

/**
 * Parse .ics date format to JavaScript Date
 * Supports formats:
 * - 20240315T140000 (local time)
 * - 20240315T140000Z (UTC)
 * - 20240315 (all-day event)
 */
function parseICSDate(dateStr: string): Date | null {
  try {
    // Remove TZID and VALUE parameters (we'll use simplified parsing)
    const cleanDate = dateStr.split(':').pop()?.trim() || dateStr;

    // Format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
    if (cleanDate.includes('T')) {
      const [datePart, timePart] = cleanDate.split('T');
      const year = parseInt(datePart.substring(0, 4), 10);
      const month = parseInt(datePart.substring(4, 6), 10) - 1; // 0-indexed
      const day = parseInt(datePart.substring(6, 8), 10);

      const timeClean = timePart.replace('Z', '');
      const hour = parseInt(timeClean.substring(0, 2), 10);
      const minute = parseInt(timeClean.substring(2, 4), 10);
      const second = parseInt(timeClean.substring(4, 6), 10) || 0;

      if (cleanDate.endsWith('Z')) {
        // UTC time
        return new Date(Date.UTC(year, month, day, hour, minute, second));
      } else {
        // Local time
        return new Date(year, month, day, hour, minute, second);
      }
    } else {
      // All-day event (YYYYMMDD)
      const year = parseInt(cleanDate.substring(0, 4), 10);
      const month = parseInt(cleanDate.substring(4, 6), 10) - 1;
      const day = parseInt(cleanDate.substring(6, 8), 10);

      return new Date(year, month, day, 0, 0, 0);
    }
  } catch (error) {
    devError('[ICS Parser] Failed to parse date:', dateStr, error);
    return null;
  }
}

/**
 * Unescape .ics text encoding
 * Handles: \n \, \; \\
 */
function unescapeICSText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Validate that a string looks like .ics content
 */
export function isValidICSContent(content: string): boolean {
  return content.includes('BEGIN:VCALENDAR') && content.includes('BEGIN:VEVENT');
}
