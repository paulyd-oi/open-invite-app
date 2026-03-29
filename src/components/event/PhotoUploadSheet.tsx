import React from "react";
import { Pressable, View, Text, ActivityIndicator } from "react-native";
import { Camera, Trash2, X } from "@/ui/icons";
import BottomSheet from "@/components/BottomSheet";

interface PhotoUploadSheetColors {
  text: string;
  textSecondary: string;
}

interface PhotoUploadSheetProps {
  visible: boolean;
  hasExistingPhoto: boolean;
  uploadingPhoto: boolean;
  themeColor: string;
  colors: PhotoUploadSheetColors;
  onClose: () => void;
  onUploadPhoto: () => void;
  onRemovePhoto: () => void;
}

export function PhotoUploadSheet({
  visible,
  hasExistingPhoto,
  uploadingPhoto,
  themeColor,
  colors,
  onClose,
  onUploadPhoto,
  onRemovePhoto,
}: PhotoUploadSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Event Photo">
      <View className="px-5 pb-6">
        <Pressable
          onPress={onUploadPhoto}
          className="flex-row items-center py-3"
        >
          <Camera size={20} color={themeColor} />
          <Text className="ml-3 text-base font-medium" style={{ color: colors.text }}>
            {hasExistingPhoto ? "Replace photo" : "Upload photo"}
          </Text>
          {uploadingPhoto && <ActivityIndicator size="small" className="ml-auto" color={themeColor} />}
        </Pressable>
        {hasExistingPhoto && (
          <Pressable
            onPress={onRemovePhoto}
            className="flex-row items-center py-3"
          >
            <Trash2 size={20} color="#EF4444" />
            <Text className="ml-3 text-base font-medium" style={{ color: "#EF4444" }}>Remove photo</Text>
          </Pressable>
        )}
        <Pressable
          onPress={onClose}
          className="flex-row items-center py-3"
        >
          <X size={20} color={colors.textSecondary} />
          <Text className="ml-3 text-base" style={{ color: colors.textSecondary }}>Cancel</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
