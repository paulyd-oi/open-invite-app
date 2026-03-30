import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from "react-native";
import BottomSheet from "@/components/BottomSheet";
import { Button } from "@/ui/Button";
import { RADIUS } from "@/ui/layout";

interface PollOption {
  id: string;
  label: string;
  count: number;
  votedByMe: boolean;
}

interface CirclePollSheetProps {
  visible: boolean;
  title: string;
  options: PollOption[] | undefined;
  isLocked: boolean;
  isHost: boolean;
  colors: { text: string; textSecondary: string; textTertiary: string; border: string };
  isDark: boolean;
  themeColor: string;
  onClose: () => void;
  onVote: (optionId: string) => void;
  onLockWithWinner: (winnerLabel: string) => void;
}

export function CirclePollSheet({
  visible,
  title,
  options,
  isLocked,
  isHost,
  colors,
  isDark,
  themeColor,
  onClose,
  onVote,
  onLockWithWinner,
}: CirclePollSheetProps) {
  const detailWinner = isLocked && options
    ? options.reduce((best, o) => (o.count > best.count ? o : best), options[0])
    : null;
  const detailWinnerId = detailWinner && detailWinner.count > 0 ? detailWinner.id : null;

  // Bridge button logic
  const totalVotes = options?.reduce((s, o) => s + o.count, 0) ?? 0;
  const bridgeWinner = isHost && options && totalVotes > 0
    ? options.reduce((best, o) => o.count > best.count ? o : best, options[0])
    : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      maxHeightPct={0.6}
      backdropOpacity={0.5}
      title={title}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {options?.map((opt) => {
          const isVoted = opt.votedByMe;
          const isDetailWinner = detailWinnerId === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onVote(opt.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 14,
                paddingHorizontal: 14,
                marginBottom: 8,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : colors.border,
                backgroundColor: isDetailWinner ? (isDark ? "rgba(52,199,89,0.12)" : "rgba(48,161,78,0.08)") : isVoted ? (themeColor + "12") : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"),
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 10 }}>
                <View style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : colors.textTertiary,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : "transparent",
                }}>
                  {(isVoted || isDetailWinner) && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                </View>
                <Text style={{ fontSize: 15, fontWeight: (isVoted || isDetailWinner) ? "600" : "400", color: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : colors.text, flex: 1 }}>{opt.label}</Text>
                {isDetailWinner && <Text style={{ fontSize: 11, fontWeight: "700", color: isDark ? "#34C759" : "#30A14E" }}>WINNER</Text>}
              </View>
              <View style={{
                paddingHorizontal: 10,
                paddingVertical: 3,
                borderRadius: 10,
                backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
              }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: isDetailWinner ? (isDark ? "#34C759" : "#30A14E") : isVoted ? themeColor : colors.textSecondary }}>{opt.count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Poll finalization context */}
      {isLocked && (
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
          <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: "center", fontStyle: "italic" }}>
            This poll finalized the plan.
          </Text>
        </View>
      )}

      {/* Lock plan with winning option */}
      {bridgeWinner && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          <Button
            variant="primary"
            label={`🔒 Lock plan with "${bridgeWinner.label}"`}
            onPress={() => onLockWithWinner(bridgeWinner.label)}
            style={{ borderRadius: RADIUS.md }}
          />
        </View>
      )}
    </BottomSheet>
  );
}
