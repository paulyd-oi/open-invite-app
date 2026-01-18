import React from "react";
import { Ionicons } from "@expo/vector-icons";
import type { ViewStyle } from "react-native";

export type LucideIcon = React.ComponentType<{
  color?: string;
  size?: number;
  style?: ViewStyle | ViewStyle[];
}>;

// Helper factory: Ionicons -> "Lucide-like" component signature
function ion(name: React.ComponentProps<typeof Ionicons>["name"]): LucideIcon {
  return function Icon({ color = "currentColor", size = 24, style }: any) {
    // RN doesn't understand "currentColor", so fall back safely.
    const resolvedColor = color === "currentColor" ? undefined : color;
    return <Ionicons name={name} size={size} color={resolvedColor as any} style={style} />;
  };
}

/**
 * Primary exports (match names you used from lucide icons (shim))
 * Add more as needed if build complains about a missing export.
 */
export const Calendar = ion("calendar-outline");
export const Plus = ion("add-outline");
export const Sparkles = ion("sparkles-outline");
export const Users = ion("people-outline");
export const User = ion("person-outline");
export const UserPlus = ion("person-add-outline");
export const UserMinus = ion("person-remove-outline");
export const Bell = ion("notifications-outline");
export const BellOff = ion("notifications-off-outline");
export const Check = ion("checkmark-outline");
export const CheckCircle = ion("checkmark-circle-outline");
export const X = ion("close-outline");
export const Star = ion("star-outline");
export const Gift = ion("gift-outline");
export const Crown = ion("trophy-outline");
export const Zap = ion("flash-outline");
export const Compass = ion("compass-outline");

export const AlertCircle = ion("alert-circle-outline");
export const RefreshCw = ion("refresh-outline");
export const Trash2 = ion("trash-outline");

export const ChevronLeft = ion("chevron-back");
export const ChevronRight = ion("chevron-forward");
export const ChevronDown = ion("chevron-down");
export const ChevronUp = ion("chevron-up");

export const Clock = ion("time-outline");
export const MapPin = ion("location-outline");
export const Tag = ion("pricetag-outline");

export const Camera = ion("camera-outline");
export const ImagePlus = ion("image-outline");
export const Download = ion("download-outline");

export const Share2 = ion("share-social-outline");
export const Copy = ion("copy-outline");
export const MessageCircle = ion("chatbubble-outline");
export const Mail = ion("mail-outline");

/**
 * Not exact matches in Ionicons — best-effort equivalents
 */
export const Building2 = ion("business-outline");
export const Briefcase = ion("briefcase-outline");
export const Filter = ion("filter-outline");
export const Search = ion("search-outline");
export const Lock = ion("lock-closed-outline");
export const ShieldCheck = ion("shield-checkmark-outline");
export const PartyPopper = ion("sparkles-outline");
export const Eye = ion("eye-outline");
export const EyeOff = ion("eye-off-outline");
export const ArrowLeft = ion("arrow-back-outline");
export const StickyNote = ion("document-text-outline");
export const Trophy = ion("trophy-outline");
export const Medal = ion("medal-outline");
export const Flame = ion("flame-outline");
export const Cloud = ion("cloud-outline");
export const WifiOff = ion("wifi-outline");

/**
 * Escape hatch (use when something imports a dynamic icon name)
 * Example: <LucideFallback name="calendar-outline" />
 */
export const LucideFallback: React.FC<{
  name: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
  size?: number;
  style?: any;
}> = ({ name, color = "currentColor", size = 24, style }) => {
  const resolvedColor = color === "currentColor" ? undefined : color;
  return <Ionicons name={name} size={size} color={resolvedColor as any} style={style} />;
};
