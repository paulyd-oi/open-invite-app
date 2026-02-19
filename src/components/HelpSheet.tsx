/**
 * HelpSheet — contextual ⓘ help bottom-sheet for top-level tabs.
 *
 * Usage:
 *   <HelpSheet screenKey="discover" config={HELP_SHEETS.discover} />
 *
 * Renders a tappable ⓘ icon. On press, opens a BottomSheet with
 * "How it works" + "Visibility & privacy" bullets + FAQ CTA.
 *
 * After first open per screen, icon opacity is reduced (persisted via AsyncStorage).
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import BottomSheet from "@/components/BottomSheet";
import { useTheme } from "@/lib/ThemeContext";
import { Info } from "@/ui/icons";
import { devLog } from "@/lib/devLog";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HelpSheetConfig {
  title: string;
  howItWorks: string[];
  eventControls?: string[];
  visibility: string[];
}

interface HelpSheetProps {
  screenKey: string;
  config: HelpSheetConfig;
}

/* ------------------------------------------------------------------ */
/*  Copy registry                                                      */
/* ------------------------------------------------------------------ */

export const HELP_SHEETS: Record<string, HelpSheetConfig> = {
  discover: {
    title: "Discover shows events happening around you",
    howItWorks: [
      "Browse public events shared by friends and the community",
      "Find things to join, explore, or plan ahead",
      "RSVP updates your calendar instantly",
    ],
    visibility: [
      "Your private schedule never appears here",
      "Only events shared publicly are shown",
    ],
  },
  calendar: {
    title: "Your calendar is your personal event hub",
    howItWorks: [
      "See events you\u2019re hosting or attending",
      "Track invites and RSVP status in one place",
      "Everything updates in real time",
    ],
    eventControls: [
      "Press and hold an event to customize its color, share it, or mark it as Busy",
      "Busy events automatically update your availability",
      "Busy blocks are private and only visible to you",
    ],
    visibility: [
      "Only friends can see your shared availability",
      "Private and busy events hide their details",
    ],
  },
  social: {
    title: "Social shows activity from your network",
    howItWorks: [
      "View friends\u2019 public RSVPs and events",
      "Stay updated on what people are doing",
      "Discover shared plans and momentum",
    ],
    visibility: [
      "Private events are never displayed",
      "Your settings control what appears",
    ],
  },
  friends: {
    title: "Friends connect your shared availability",
    howItWorks: [
      "Add friends to see each other\u2019s open schedules",
      "Coordinate plans more easily",
      "Stay connected through events",
    ],
    visibility: [
      "Only friends can see your shared calendar",
      "Private and busy details stay protected",
    ],
  },
  circles: {
    title: "Circles are private group spaces",
    howItWorks: [
      "Create events inside trusted groups",
      "Share plans with teams, families, or crews",
      "Everything stays organized per circle",
    ],
    visibility: [
      "Circle activity is visible only to members",
      "Events never leak outside the group",
      "\u201CEveryone\u2019s free\u201D is based on availability shared in the app and may not always be exact",
      "Suggested times respect your \u2018Suggested hours\u2019 setting (change it in Best time to meet)",
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_PREFIX = "hasSeenHelp_";

export function HelpSheet({ screenKey, config }: HelpSheetProps) {
  const { colors, themeColor } = useTheme();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [hasSeen, setHasSeen] = useState(false);

  // Load persisted "has seen" state
  useEffect(() => {
    AsyncStorage.getItem(`${STORAGE_PREFIX}${screenKey}`).then((v) => {
      if (v === "1") setHasSeen(true);
    }).catch(() => {});
  }, [screenKey]);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setVisible(true);
    if (!hasSeen) {
      setHasSeen(true);
      AsyncStorage.setItem(`${STORAGE_PREFIX}${screenKey}`, "1").catch(() => {});
    }
    if (__DEV__) devLog("[HELP_SHEET]", { action: "open", screenKey });
  }, [screenKey, hasSeen]);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  const handleFAQ = useCallback(() => {
    setVisible(false);
    router.push("/help-faq");
  }, [router]);

  return (
    <>
      {/* ⓘ trigger icon */}
      <Pressable
        onPress={handleOpen}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={`Info about ${screenKey}`}
        accessibilityRole="button"
        style={{ marginLeft: 8 }}
      >
        <Info size={20} color={colors.textTertiary} style={{ opacity: hasSeen ? 0.45 : 0.8 }} />
      </Pressable>

      {/* Bottom sheet */}
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        heightPct={0}
        maxHeightPct={0.7}
        backdropOpacity={0.4}
        enableBackdropClose
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          {/* Title */}
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 20, lineHeight: 24 }}>
            {config.title}
          </Text>

          {/* How it works */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>
            How it works
          </Text>
          {config.howItWorks.map((item, i) => (
            <View key={`h${i}`} style={{ flexDirection: "row", marginBottom: 6, paddingRight: 12 }}>
              <Text style={{ color: colors.textSecondary, marginRight: 8, fontSize: 14 }}>{"\u2022"}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, flex: 1 }}>{item}</Text>
            </View>
          ))}

          {/* Event controls (calendar only) */}
          {config.eventControls && config.eventControls.length > 0 && (
            <>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textTertiary, letterSpacing: 0.5, marginTop: 16, marginBottom: 8, textTransform: "uppercase" }}>
                Event controls
              </Text>
              {config.eventControls.map((item, i) => (
                <View key={`e${i}`} style={{ flexDirection: "row", marginBottom: 6, paddingRight: 12 }}>
                  <Text style={{ color: colors.textSecondary, marginRight: 8, fontSize: 14 }}>{"\u2022"}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, flex: 1 }}>{item}</Text>
                </View>
              ))}
            </>
          )}

          {/* Visibility & privacy */}
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textTertiary, letterSpacing: 0.5, marginTop: 16, marginBottom: 8, textTransform: "uppercase" }}>
            Visibility & privacy
          </Text>
          {config.visibility.map((item, i) => (
            <View key={`v${i}`} style={{ flexDirection: "row", marginBottom: 6, paddingRight: 12 }}>
              <Text style={{ color: colors.textSecondary, marginRight: 8, fontSize: 14 }}>{"\u2022"}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, flex: 1 }}>{item}</Text>
            </View>
          ))}

          {/* FAQ CTA */}
          <Pressable
            onPress={handleFAQ}
            style={({ pressed }) => ({
              marginTop: 20,
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: pressed ? `${themeColor}25` : `${themeColor}15`,
              alignItems: "center",
            })}
          >
            <Text style={{ color: themeColor, fontWeight: "600", fontSize: 15 }}>
              Learn more in FAQ
            </Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
}
