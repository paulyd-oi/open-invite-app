import React, { useState, useRef, useCallback } from "react";
import { View, Text, Pressable, Share, Dimensions, ActivityIndicator } from "react-native";
import ViewShot from "react-native-view-shot";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system";
import BottomSheet from "@/components/BottomSheet";
import { EventFlyer, type EventFlyerData } from "./EventFlyer";
import { safeToast } from "@/lib/safeToast";
import { devError } from "@/lib/devLog";

const FLYER_WIDTH = Dimensions.get("window").width - 64;

interface ShareFlyerSheetProps {
  visible: boolean;
  onClose: () => void;
  flyerData: EventFlyerData;
  hasCoverImage: boolean;
  isDark: boolean;
  themeColor: string;
}

export function ShareFlyerSheet({
  visible,
  onClose,
  flyerData,
  hasCoverImage,
  isDark,
  themeColor,
}: ShareFlyerSheetProps) {
  const [variant, setVariant] = useState<"cover" | "typography">(hasCoverImage ? "cover" : "typography");
  const [isCapturing, setIsCapturing] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

  const handleShare = useCallback(async () => {
    if (!viewShotRef.current?.capture) {
      safeToast.error("Flyer error", "Could not generate flyer image");
      return;
    }
    setIsCapturing(true);
    try {
      const uri = await viewShotRef.current.capture();
      // Copy to a stable path for sharing
      const destPath = `${FileSystem.cacheDirectory}open-invite-flyer.png`;
      await FileSystem.copyAsync({ from: uri, to: destPath });

      await Share.share({
        url: destPath,
      });
      onClose();
    } catch (error: any) {
      if (error?.message?.includes("User did not share")) {
        // User cancelled — not an error
        return;
      }
      devError("[ShareFlyer] capture/share failed", error);
      safeToast.error("Share failed", "Could not share the flyer. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  }, [onClose]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={0}
      backdropOpacity={0.5}
      title="Share Flyer"
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        {/* Style toggle — only show if cover image exists */}
        {hasCoverImage && (
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setVariant("cover"); }}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: variant === "cover" ? `${themeColor}18` : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
                borderWidth: 1.5,
                borderColor: variant === "cover" ? themeColor : "transparent",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: variant === "cover" ? themeColor : (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)") }}>
                Cover
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setVariant("typography"); }}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: variant === "typography" ? `${themeColor}18` : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
                borderWidth: 1.5,
                borderColor: variant === "typography" ? themeColor : "transparent",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: variant === "typography" ? themeColor : (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)") }}>
                Typography
              </Text>
            </Pressable>
          </View>
        )}

        {/* Flyer preview — captured by ViewShot */}
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <ViewShot
            ref={viewShotRef}
            options={{ format: "png", quality: 1, result: "tmpfile" }}
          >
            <EventFlyer
              data={flyerData}
              variant={variant}
              width={FLYER_WIDTH}
            />
          </ViewShot>
        </View>

        {/* Share button */}
        <Pressable
          onPress={handleShare}
          disabled={isCapturing}
          style={{
            backgroundColor: themeColor,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: isCapturing ? 0.6 : 1,
          }}
        >
          {isCapturing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={{ color: "#FFF", fontSize: 16, fontWeight: "700" }}>
              Share Flyer
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}
