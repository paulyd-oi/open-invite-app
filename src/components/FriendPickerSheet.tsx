/**
 * FriendPickerSheet — bottom sheet for selecting friends in Who's Free.
 * Scrollable list with search bar and checkboxes.
 * Reuses BottomSheet primitive and EntityAvatar.
 */
import React, { useState, useMemo } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import { Search, Check } from "@/ui/icons";
import { useTheme } from "@/lib/ThemeContext";
import { EntityAvatar } from "@/components/EntityAvatar";
import BottomSheet from "@/components/BottomSheet";

interface Friend {
  id: string;
  friendId: string;
  friend: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
}

interface FriendPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  friends: Friend[];
  selectedIds: string[];
  onToggle: (friendId: string) => void;
}

export function FriendPickerSheet({
  visible,
  onClose,
  friends,
  selectedIds,
  onToggle,
}: FriendPickerSheetProps) {
  const { themeColor, isDark, colors } = useTheme();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const valid = friends.filter((f) => f.friend != null);
    if (!query.trim()) return valid;
    const q = query.toLowerCase();
    return valid.filter(
      (f) =>
        f.friend?.name?.toLowerCase().includes(q) ||
        f.friend?.email?.toLowerCase().includes(q),
    );
  }, [friends, query]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Select Friends"
      heightPct={0.7}
      backdropOpacity={0.4}
      keyboardMode="padding"
      headerRight={
        <Text style={{ color: "#5DCAA5", fontSize: 14, fontWeight: "600" }}>
          {selectedIds.length} selected
        </Text>
      }
    >
      {/* Search bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 20,
          marginBottom: 12,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.surface,
          borderWidth: 0.5,
          borderColor: isDark ? "rgba(255,255,255,0.1)" : colors.borderSubtle,
        }}
      >
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search friends..."
          placeholderTextColor={colors.textTertiary}
          style={{
            flex: 1,
            marginLeft: 8,
            fontSize: 14,
            color: colors.text,
            padding: 0,
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Friend list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        {filtered.map((friendship) => {
          const isSelected = selectedIds.includes(friendship.friendId);
          return (
            <Pressable
              key={friendship.id}
              onPress={() => onToggle(friendship.friendId)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                marginBottom: 2,
                backgroundColor: isSelected
                  ? isDark
                    ? "rgba(93,202,165,0.08)"
                    : `${themeColor}08`
                  : "transparent",
              }}
            >
              <EntityAvatar
                photoUrl={friendship.friend?.image ?? null}
                initials={friendship.friend?.name?.[0] ?? "?"}
                size={36}
                backgroundColor={
                  isDark ? "rgba(255,255,255,0.1)" : `${themeColor}15`
                }
                foregroundColor={themeColor}
              />
              <Text
                style={{
                  flex: 1,
                  marginLeft: 12,
                  fontSize: 15,
                  fontWeight: "500",
                  color: colors.text,
                }}
                numberOfLines={1}
              >
                {friendship.friend?.name ?? "Friend"}
              </Text>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected
                    ? "#5DCAA5"
                    : isDark
                      ? "rgba(255,255,255,0.06)"
                      : colors.surface,
                  borderWidth: isSelected ? 0 : 1,
                  borderColor: isDark
                    ? "rgba(255,255,255,0.15)"
                    : colors.border,
                }}
              >
                {isSelected && <Check size={14} color="#fff" />}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}
