import React from "react";
import { Ionicons } from "@expo/vector-icons";
import type { TextStyle } from "react-native";

/**
 * We keep the existing "LucideIcon" naming to minimize refactors,
 * but these are Ionicons-backed components.
 */
export type LucideIcon = React.ComponentType<{
  color?: string;
  size?: number;
  style?: TextStyle | TextStyle[];
}>;

type IonName = React.ComponentProps<typeof Ionicons>["name"];

function ion(name: IonName): LucideIcon {
  const Icon: LucideIcon = ({ color, size = 24, style }) => {
    const resolvedColor = color === "currentColor" ? undefined : color;
    return <Ionicons name={name} size={size} color={resolvedColor as any} style={style as any} />;
  };
  return Icon;
}

export const LucideFallback: React.FC<{
  name: IonName;
  color?: string;
  size?: number;
  style?: any;
}> = ({ name, color, size = 24, style }) => {
  const resolvedColor = color === "currentColor" ? undefined : color;
  return <Ionicons name={name} size={size} color={resolvedColor as any} style={style} />;
};

/**
 * Safe wrapper:
 * If an icon import is undefined, we render a fallback icon instead of crashing.
 */
export function SafeIcon({
  Icon,
  fallbackName = "help-circle-outline",
  color,
  size = 24,
  style,
}: {
  Icon: LucideIcon | undefined | null;
  fallbackName?: IonName;
  color?: string;
  size?: number;
  style?: any;
}) {
  if (!Icon) {
    return <LucideFallback name={fallbackName} color={color} size={size} style={style} />;
  }
  return <Icon color={color} size={size} style={style} />;
}

/**
 * Primary exports (match names previously used from lucide-react-native).
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
export const Crown = ion("ribbon-outline");
export const Zap = ion("flash-outline");
export const Compass = ion("compass-outline");

export const AlertCircle = ion("alert-circle-outline");
export const AlertTriangle = ion("alert-outline"); // used by ErrorBoundary
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

export const Briefcase = ion("briefcase-outline");
export const Filter = ion("filter-outline");
export const Search = ion("search-outline");
export const Lock = ion("lock-closed-outline");
export const ShieldCheck = ion("shield-checkmark-outline");
export const PartyPopper = ion("sparkles-outline");
export const Eye = ion("eye-outline");
export const EyeOff = ion("eye-off-outline");
export const ArrowLeft = ion("arrow-back-outline");
export const ArrowRight = ion("arrow-forward-outline");
export const StickyNote = ion("document-text-outline");
// Trophy REMOVED: Badges are pill-only. Use Award icon instead if needed.
export const Medal = ion("medal-outline");
export const Flame = ion("flame-outline");
export const Cloud = ion("cloud-outline");
export const WifiOff = ion("wifi-outline");
// Additional icons for quick event templates
export const Coffee = ion("cafe-outline");
export const UtensilsCrossed = ion("restaurant-outline");
export const Dumbbell = ion("barbell-outline");
export const Gamepad2 = ion("game-controller-outline");
export const Beer = ion("beer-outline");
export const BookOpen = ion("book-outline");
export const Film = ion("film-outline");
export const Music = ion("musical-notes-outline");
export const ShoppingBag = ion("bag-outline");
export const NotebookPen = ion("document-outline");
export const CalendarCheck = ion("calendar-outline");

// Additional icons for common UI
export const Settings = ion("settings-outline");
export const Shield = ion("shield-outline");
export const LogOut = ion("log-out-outline");
export const BadgeCheck = ion("medal-outline");
export const UserX = ion("person-remove-outline");
export const Phone = ion("call-outline");
export const List = ion("list-outline");
export const LayoutGrid = ion("grid-outline");
export const Send = ion("send-outline");
export const Cake = ion("gift-outline");
export const Palette = ion("color-palette-outline");
export const Navigation = ion("navigate-outline");
export const UserCheck = ion("checkmark-circle-outline");
export const CalendarPlus = ion("calendar-outline");
export const Repeat = ion("repeat-outline");
export const Award = ion("ribbon-outline");
export const History = ion("time-outline");
export const ExternalLink = ion("open-outline");
export const Heart = ion("heart-outline");
export const Play = ion("play-outline");
export const Bookmark = ion("bookmark-outline");
export const Headphones = ion("headset-outline");
export const TrendingUp = ion("trending-up-outline");
export const Sun = ion("sunny-outline");
export const Moon = ion("moon-outline");

// Additional icons for various screens
export const Layers = ion("layers-outline");
export const AlignJustify = ion("shuffle-outline");
export const RotateCcw = ion("arrow-undo-outline");
export const XCircle = ion("close-circle-outline");
export const Map = ion("map-outline");
export const Home = ion("home-outline");
export const CreditCard = ion("card-outline");
export const ListChecks = ion("checkmark-done-outline");
export const CalendarClock = ion("calendar-outline");
export const Pencil = ion("pencil-outline");
export const CloudDownload = ion("cloud-download-outline");

// Additional icons for friends, settings, etc.
export const Contact = ion("person-circle-outline");
export const FlaskConical = ion("flask-outline");
export const Activity = ion("pulse-outline");
export const Pin = ion("pin-outline");
export const CalendarDays = ion("calendar-outline");
export const Upload = ion("cloud-upload-outline");
export const UsersRound = ion("people-circle-outline");
export const CalendarSync = ion("calendar-outline");
export const Ticket = ion("ticket-outline");
export const Info = ion("information-circle-outline");
export const HelpCircle = ion("help-circle-outline");
export const Smartphone = ion("phone-portrait-outline");
export const FileText = ion("document-text-outline");
export const Scale = ion("scale-outline");
export const Volume2 = ion("volume-high-outline");
export const VolumeX = ion("volume-mute-outline");
export const BarChart3 = ion("bar-chart-outline");
export const Loader2 = ion("reload-outline");





export const Building2 = ion("business-outline");
