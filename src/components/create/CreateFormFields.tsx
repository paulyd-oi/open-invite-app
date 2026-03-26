import React from "react";
import { TextInput } from "react-native";

interface CreateFormFieldsProps {
  title: string;
  description: string;
  onTitleChange: (text: string) => void;
  onDescriptionChange: (text: string) => void;
  glassSurface: string;
  glassBorder: string;
  glassText: string;
  glassTertiary: string;
}

export function CreateFormFields({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  glassSurface,
  glassBorder,
  glassText,
  glassTertiary,
}: CreateFormFieldsProps) {
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
