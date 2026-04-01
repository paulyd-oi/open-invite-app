import React, { useState, useEffect } from "react";
import { View, Text, TextInput } from "react-native";

const HOOK_PLACEHOLDERS = [
  "Rooftop views & good vibes",
  "BYOB and board games",
  "Last hangout before summer!",
  "Beginner-friendly, all welcome",
  "Live DJ + potluck dinner",
  "Dress code: all white",
];

interface CreateFormFieldsProps {
  title: string;
  description: string;
  onTitleChange: (text: string) => void;
  onDescriptionChange: (text: string) => void;
  eventHook: string;
  onEventHookChange: (text: string) => void;
  glassSurface: string;
  glassBorder: string;
  glassText: string;
  glassSecondary: string;
  glassTertiary: string;
}

export function CreateFormFields({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  eventHook,
  onEventHookChange,
  glassSurface,
  glassBorder,
  glassText,
  glassSecondary,
  glassTertiary,
}: CreateFormFieldsProps) {
  const [hookPlaceholderIdx, setHookPlaceholderIdx] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setHookPlaceholderIdx((i) => (i + 1) % HOOK_PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Title */}
      <TextInput
        testID="create-input-title"
        value={title}
        onChangeText={onTitleChange}
        placeholder="Event title"
        placeholderTextColor={glassTertiary}
        className="rounded-2xl p-3.5 mb-3"
        style={{ backgroundColor: glassSurface, borderWidth: 0.5, borderColor: glassBorder, color: glassText, fontSize: 16, fontWeight: "600" }}
      />

      {/* Headline (optional) — shown on Discover card */}
      <View className="mb-3">
        <TextInput
          value={eventHook}
          onChangeText={(t) => onEventHookChange(t.slice(0, 60))}
          placeholder={HOOK_PLACEHOLDERS[hookPlaceholderIdx]}
          placeholderTextColor={glassTertiary}
          maxLength={60}
          multiline={false}
          className="rounded-2xl p-3.5"
          style={{ backgroundColor: glassSurface, borderWidth: 0.5, borderColor: glassBorder, color: glassText, fontSize: 14 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginHorizontal: 4 }}>
          <Text style={{ color: glassSecondary, fontSize: 11 }}>Headline (optional) · Shown on the Discover card</Text>
          {eventHook.length > 0 && (
            <Text style={{ color: eventHook.length >= 55 ? "#EF4444" : glassTertiary, fontSize: 11 }}>
              {eventHook.length}/60
            </Text>
          )}
        </View>
      </View>

      {/* Description */}
      <TextInput
        testID="create-input-description"
        value={description}
        onChangeText={onDescriptionChange}
        placeholder="Add some details..."
        placeholderTextColor={glassTertiary}
        multiline
        numberOfLines={3}
        className="rounded-2xl p-3.5 mb-3"
        style={{ backgroundColor: glassSurface, borderWidth: 0.5, borderColor: glassBorder, color: glassText, minHeight: 72, textAlignVertical: "top", fontSize: 14 }}
      />
    </>
  );
}
