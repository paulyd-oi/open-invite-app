import { Linking, Platform, Share } from "react-native";
import * as ExpoCalendar from "expo-calendar";
import { openMaps } from "@/utils/openMaps";
import { buildEventSharePayload, buildEventSmsBody, generateShareSlug, getEventShareLink, type ShareMethod } from "@/lib/shareSSOT";
import { trackInviteShared, trackEventShareCompleted } from "@/analytics/analyticsEventsSSOT";
import { devError } from "@/lib/devLog";
import { safeToast } from "@/lib/safeToast";

// ── Pure helpers (no React state) ──

/** Open event location in native maps app */
export const openEventLocation = (query: string, event?: any, eventId?: string) => {
  try {
    const lat = event?.lat ?? event?.latitude;
    const lng = event?.lng ?? event?.longitude;

    if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
      openMaps({ lat: Number(lat), lng: Number(lng), label: query });
    } else {
      openMaps({ query });
    }
  } catch (error: any) {
    if (__DEV__) {
      devError("[P0_EVENT_LOCATION_OPEN_FAIL]", { eventId, locationQuery: query, error: error?.message ?? error });
    }
  }
};

/** Format date for Google Calendar URL params */
export const formatDateForCalendar = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
};

/** Open Google Calendar with pre-filled event details */
export const openGoogleCalendar = (event: { title: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }) => {
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatDateForCalendar(startDate)}/${formatDateForCalendar(endDate)}`,
  });

  if (event.description) {
    params.append("details", event.description);
  }
  if (event.location) {
    params.append("location", event.location);
  }

  const url = `https://calendar.google.com/calendar/render?${params.toString()}`;
  Linking.openURL(url);
};

/** Add event to device calendar (Apple Calendar on iOS) */
export const addToDeviceCalendar = async (event: { title: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }, showToast: typeof safeToast) => {
  try {
    const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();

    if (status !== "granted") {
      showToast.warning("Permission Required", "Please allow calendar access in Settings to add events.");
      Linking.openSettings();
      return;
    }

    const startDate = new Date(event.startTime);
    const endDate = event.endTime ? new Date(event.endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);

    const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);

    let targetCalendar: typeof calendars[0] | undefined;

    if (Platform.OS === "ios") {
      try {
        const defaultCalendar = await ExpoCalendar.getDefaultCalendarAsync();
        if (defaultCalendar?.id) {
          targetCalendar = calendars.find(c => c.id === defaultCalendar.id);
        }
      } catch (e) {
      }
    }

    if (!targetCalendar) {
      targetCalendar = calendars.find(
        (cal) => cal.allowsModifications && cal.source?.name === "iCloud"
      );
    }

    if (!targetCalendar) {
      targetCalendar = calendars.find(
        (cal) => cal.allowsModifications && cal.isPrimary
      );
    }

    if (!targetCalendar) {
      targetCalendar = calendars.find((cal) => cal.allowsModifications);
    }

    if (!targetCalendar) {
      showToast.error("No Calendar Found", "Please set up at least one calendar on your device.");
      return;
    }

    const eventId = await ExpoCalendar.createEventAsync(targetCalendar.id, {
      title: event.title,
      startDate: startDate,
      endDate: endDate,
      location: event.location ?? undefined,
      notes: event.description ?? undefined,
      alarms: [{ relativeOffset: -30 }],
    });

    showToast.success("Event Added!", `Added to your ${targetCalendar.title} calendar.`);
  } catch (error: any) {
    devError("Error adding to calendar:", error);

    if (error?.message?.includes("permission") || error?.code === "E_MISSING_PERMISSION") {
      showToast.warning("Permission Required", "Calendar access is required. Please enable it in Settings.");
      Linking.openSettings();
    } else {
      showToast.error("Oops", "That didn't go through. Please try again.");
    }
  }
};

/** Build EventShareInput from raw event data */
export const buildShareInput = (event: { id: string; title: string; emoji: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null }) => {
  const startDate = new Date(event.startTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const dateStr = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeStr = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
  return { id: event.id, title: event.title, emoji: event.emoji, dateStr, timeStr, location: event.location, description: event.description };
};

/** Share event via native share sheet with slug-based attribution */
export const shareEvent = async (
  event: { id: string; title: string; emoji: string; description?: string | null; location?: string | null; startTime: string; endTime?: string | null; visibility?: string | null },
  options?: { hostUserId?: string | null; shareSurface?: "event_page" | "post_create" | "host_tools" }
) => {
  try {
    const slug = await generateShareSlug(event.id, "other");
    const shareLink = getEventShareLink(event.id, slug);
    const input = buildShareInput(event);
    const msg = `${input.title} ${input.dateStr} at ${input.timeStr}\n\nJoin us\n\n${shareLink}`;

    trackInviteShared({ entity: "event", sourceScreen: "event_detail" });
    const result = await Share.share({ message: msg, title: event.title });

    if (result.action === Share.sharedAction) {
      const method: ShareMethod = inferShareMethod(result.activityType);
      trackEventShareCompleted({
        event_id: event.id,
        host_user_id: options?.hostUserId ?? null,
        share_method: method,
        visibility: event.visibility ?? null,
        share_surface: options?.shareSurface ?? "event_page",
        share_slug: slug,
        created_at_iso: new Date().toISOString(),
      });
    }
  } catch (error) {
    devError("Error sharing event:", error);
  }
};

function inferShareMethod(activityType?: string | null): ShareMethod {
  if (!activityType) return "other";
  const a = activityType.toLowerCase();
  if (a.includes("copytopasteBoard") || a.includes("copy")) return "copy_link";
  if (a.includes("message") || a.includes("sms")) return "sms";
  if (a.includes("whatsapp")) return "whatsapp";
  if (a.includes("instagram")) return "instagram";
  if (a.includes("airdrop")) return "airdrop";
  return "other";
}

/** Format relative time (e.g. "5m ago", "2h ago") */
export const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// ── Derived values (pure functions, no hooks) ──

/** Normalize event location fields into display + query strings */
export function deriveLocationDisplay(event: any): { locationDisplay: string | null; locationQuery: string | null } {
  const _str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const _rawLocation  = _str(event.location);
  const _rawName      = _str(event.locationName);
  const _rawAddress   = _str(event.address);
  const _rawPlace     = _str(event.placeName);
  const _rawVenue     = _str(event.venueName);

  const _clean = (s: string): string =>
    s.replace(/,{2,}/g, ",").replace(/\s{2,}/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");

  let locationDisplay: string | null = null;

  const _name = _rawName ?? _rawPlace ?? _rawVenue;
  const _addr = _rawAddress;

  if (_name && _addr) {
    const nameLC = _name.toLowerCase();
    const addrLC = _addr.toLowerCase();
    if (addrLC.includes(nameLC)) {
      locationDisplay = _clean(_addr);
    } else if (nameLC.includes(addrLC)) {
      locationDisplay = _clean(_name);
    } else {
      locationDisplay = _clean(`${_name} \u2014 ${_addr}`);
    }
  } else if (_rawLocation) {
    locationDisplay = _clean(_rawLocation);
  } else {
    locationDisplay = _name ? _clean(_name) : _addr ? _clean(_addr) : null;
  }

  const locationQuery = _addr ?? locationDisplay;

  return { locationDisplay, locationQuery };
}

/** Derive date labels and countdown from event data */
export function deriveDateLabels(event: any): {
  originalStartDate: Date;
  startDate: Date;
  endDate: Date | null;
  dateLabel: string;
  timeLabel: string;
  countdownLabel: string;
} {
  const originalStartDate = new Date(event.startTime);
  const displayStartTime = event.nextOccurrence ?? event.startTime;
  const startDate = new Date(displayStartTime);
  const endDate = event.endTime ? new Date(event.endTime) : null;
  const dateLabel = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timeLabel = endDate
    ? `${startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : startDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

  const countdownLabel = (() => {
    const now = new Date();
    const duration = endDate ? endDate.getTime() - originalStartDate.getTime() : 2 * 60 * 60 * 1000;
    const eventEnd = new Date(startDate.getTime() + duration);
    if (now > eventEnd && !event.nextOccurrence) return "Ended";
    if (now > eventEnd) return "";
    if (now >= startDate && now <= eventEnd) return "Happening now";
    const diffMs = startDate.getTime() - now.getTime();
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const isToday = startDate.toDateString() === now.toDateString();
    if (isToday) {
      if (hours > 0) return `Today \u2022 Starts in ${hours}h ${minutes}m`;
      return `Today \u2022 Starts in ${minutes}m`;
    }
    if (days > 0 && hours > 0) return `Starts in ${days}d ${hours}h`;
    if (days > 0) return `Starts in ${days}d`;
    return `Starts in ${hours}h ${minutes}m`;
  })();

  return { originalStartDate, startDate, endDate, dateLabel, timeLabel, countdownLabel };
}
