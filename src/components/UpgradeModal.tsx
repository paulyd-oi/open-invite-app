// UpgradeModal.tsx
// Beautiful upgrade prompt modal for Pro features
import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withDelay,
} from "react-native-reanimated";
import { X, Crown, Sparkles, Check, Zap } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { PRO_FEATURES, type FeatureKey, PRICING } from "@/lib/useSubscription";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  feature?: FeatureKey;
  title?: string;
  message?: string;
  showAllFeatures?: boolean;
}

const HIGHLIGHT_FEATURES: FeatureKey[] = [
  "unlimited_events",
  "extended_whos_free",
  "unlimited_circles",
  "unlimited_friend_notes",
  "recurring_events",
  "detailed_analytics",
];

export function UpgradeModal({
  visible,
  onClose,
  feature,
  title,
  message,
  showAllFeatures = false,
}: UpgradeModalProps) {
  const router = useRouter();
  const buttonScale = useSharedValue(1);

  const handleUpgradePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    buttonScale.value = withSequence(
      withSpring(0.95, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    onClose();
    router.push("/subscription");
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const displayTitle = title ?? (feature ? PRO_FEATURES[feature]?.title : "Unlock Pro Features");
  const displayMessage = message ?? (feature ? PRO_FEATURES[feature]?.description : "Get unlimited access to everything");

  const featuresToShow = showAllFeatures
    ? HIGHLIGHT_FEATURES
    : feature
    ? [feature, ...HIGHLIGHT_FEATURES.filter((f) => f !== feature).slice(0, 3)]
    : HIGHLIGHT_FEATURES.slice(0, 4);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        className="flex-1"
      >
        {/* Backdrop */}
        <Pressable
          className="absolute inset-0"
          onPress={handleClose}
        >
          <BlurView
            intensity={30}
            tint="dark"
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
          />
        </Pressable>

        {/* Modal Content */}
        <View className="flex-1 justify-end">
          <Animated.View
            entering={SlideInDown.springify().damping(20)}
            exiting={SlideOutDown.springify().damping(20)}
          >
            {/* Glass Card */}
            <View className="mx-4 mb-8 rounded-3xl overflow-hidden">
              {/* Background Gradient */}
              <LinearGradient
                colors={["#1a1a2e", "#16213e", "#0f0f23"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ position: "absolute", width: "100%", height: "100%" }}
              />

              {/* Glass Overlay */}
              <BlurView
                intensity={40}
                tint="dark"
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                }}
              />

              <View className="p-6 relative">
                {/* Close Button */}
                <Pressable
                  onPress={handleClose}
                  className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 items-center justify-center"
                  hitSlop={12}
                >
                  <X size={18} color="rgba(255,255,255,0.6)" />
                </Pressable>

                {/* Crown Icon with Glow */}
                <Animated.View
                  entering={FadeIn.delay(100).duration(300)}
                  className="items-center mb-4"
                >
                  <View className="relative">
                    {/* Glow Effect */}
                    <View
                      style={{
                        position: "absolute",
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        backgroundColor: "#FFD700",
                        opacity: 0.2,
                        transform: [{ scale: 1.5 }],
                      }}
                    />
                    <LinearGradient
                      colors={["#FFD700", "#FFA500", "#FF8C00"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Crown size={32} color="#1a1a2e" strokeWidth={2.5} />
                    </LinearGradient>
                  </View>
                </Animated.View>

                {/* Title */}
                <Animated.View entering={FadeIn.delay(150).duration(300)}>
                  <Text className="text-white text-2xl font-bold text-center mb-2">
                    {displayTitle}
                  </Text>
                  <Text className="text-white/60 text-center mb-6 px-4">
                    {displayMessage}
                  </Text>
                </Animated.View>

                {/* Features List */}
                <Animated.View
                  entering={FadeIn.delay(200).duration(300)}
                  className="mb-6"
                >
                  {featuresToShow.map((f, index) => {
                    const featureInfo = PRO_FEATURES[f];
                    const isHighlighted = f === feature;

                    return (
                      <Animated.View
                        key={f}
                        entering={FadeIn.delay(250 + index * 50).duration(200)}
                        className={`flex-row items-center py-3 px-4 rounded-xl mb-2 ${
                          isHighlighted ? "bg-amber-500/20" : "bg-white/5"
                        }`}
                      >
                        <View
                          className={`w-6 h-6 rounded-full items-center justify-center mr-3 ${
                            isHighlighted ? "bg-amber-500" : "bg-white/20"
                          }`}
                        >
                          {isHighlighted ? (
                            <Sparkles size={14} color="#1a1a2e" />
                          ) : (
                            <Check size={14} color="white" />
                          )}
                        </View>
                        <View className="flex-1">
                          <Text
                            className={`font-semibold ${
                              isHighlighted ? "text-amber-400" : "text-white"
                            }`}
                          >
                            {featureInfo?.title}
                          </Text>
                          <Text className="text-white/50 text-xs">
                            {featureInfo?.description}
                          </Text>
                        </View>
                      </Animated.View>
                    );
                  })}
                </Animated.View>

                {/* Upgrade Button */}
                <Animated.View
                  entering={FadeIn.delay(400).duration(300)}
                  style={buttonAnimatedStyle}
                >
                  <Pressable onPress={handleUpgradePress}>
                    <LinearGradient
                      colors={["#FFD700", "#FFA500", "#FF8C00"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 16,
                        borderRadius: 16,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <Zap size={20} color="#1a1a2e" fill="#1a1a2e" />
                      <Text className="text-[#1a1a2e] font-bold text-lg">
                        Upgrade to Pro
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>

                {/* Pricing Info */}
                <Animated.View
                  entering={FadeIn.delay(450).duration(300)}
                  className="mt-4 items-center"
                >
                  <Text className="text-white/40 text-sm">
                    ${PRICING.proYearly}/year • 2-week free trial
                  </Text>
                  <Text className="text-white/30 text-xs mt-1">
                    Cancel anytime
                  </Text>
                </Animated.View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

// ============================================
// INLINE UPGRADE PROMPT (for embedding in screens)
// ============================================

interface UpgradePromptProps {
  feature: FeatureKey;
  compact?: boolean;
  onUpgrade?: () => void;
}

export function UpgradePrompt({ feature, compact = false, onUpgrade }: UpgradePromptProps) {
  const router = useRouter();
  const featureInfo = PRO_FEATURES[feature];

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onUpgrade) {
      onUpgrade();
    } else {
      router.push("/subscription");
    }
  };

  if (compact) {
    return (
      <Pressable
        onPress={handlePress}
        className="flex-row items-center bg-amber-500/10 px-3 py-2 rounded-lg"
      >
        <Crown size={14} color="#F59E0B" />
        <Text className="text-amber-500 text-sm font-medium ml-2">
          Pro Feature
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handlePress}>
      <LinearGradient
        colors={["rgba(255,215,0,0.1)", "rgba(255,165,0,0.1)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          padding: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,215,0,0.3)",
        }}
      >
        <View className="flex-row items-center mb-2">
          <Crown size={18} color="#FFD700" />
          <Text className="text-amber-400 font-semibold ml-2">
            Pro Feature
          </Text>
        </View>
        <Text className="text-white font-medium mb-1">{featureInfo?.title}</Text>
        <Text className="text-white/60 text-sm mb-3">{featureInfo?.description}</Text>
        <View className="flex-row items-center">
          <Text className="text-amber-400 font-medium">Upgrade to unlock</Text>
          <Zap size={14} color="#F59E0B" className="ml-1" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

// ============================================
// PRO BADGE (for showing on locked features)
// ============================================

interface ProBadgeProps {
  size?: "small" | "medium" | "large";
}

export function ProBadge({ size = "small" }: ProBadgeProps) {
  const sizeStyles = {
    small: { paddingHorizontal: 6, paddingVertical: 2, iconSize: 10, fontSize: 10 },
    medium: { paddingHorizontal: 8, paddingVertical: 3, iconSize: 12, fontSize: 11 },
    large: { paddingHorizontal: 10, paddingVertical: 4, iconSize: 14, fontSize: 12 },
  };

  const s = sizeStyles[size];

  return (
    <LinearGradient
      colors={["#FFD700", "#FFA500"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: s.paddingHorizontal,
        paddingVertical: s.paddingVertical,
        borderRadius: 100,
        gap: 3,
      }}
    >
      <Crown size={s.iconSize} color="#1a1a2e" />
      <Text style={{ color: "#1a1a2e", fontSize: s.fontSize, fontWeight: "700" }}>
        PRO
      </Text>
    </LinearGradient>
  );
}

// ============================================
// LIMIT INDICATOR (shows usage vs limit)
// ============================================

interface LimitIndicatorProps {
  current: number;
  limit: number | null;
  label: string;
  showUpgrade?: boolean;
  onUpgrade?: () => void;
}

export function LimitIndicator({
  current,
  limit,
  label,
  showUpgrade = true,
  onUpgrade,
}: LimitIndicatorProps) {
  const router = useRouter();
  const isUnlimited = limit === null;
  const percentage = isUnlimited ? 100 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && current >= limit * 0.8;
  const isAtLimit = !isUnlimited && current >= limit;

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onUpgrade) {
      onUpgrade();
    } else {
      router.push("/subscription");
    }
  };

  return (
    <View className="bg-white/5 rounded-xl p-4">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white/60 text-sm">{label}</Text>
        <Text className={`font-medium ${isAtLimit ? "text-red-400" : isNearLimit ? "text-amber-400" : "text-white"}`}>
          {current}/{isUnlimited ? "∞" : limit}
        </Text>
      </View>

      {/* Progress Bar */}
      <View className="h-2 bg-white/10 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${
            isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </View>

      {/* Upgrade Prompt */}
      {showUpgrade && isNearLimit && (
        <Pressable
          onPress={handleUpgrade}
          className="flex-row items-center justify-center mt-3 py-2 rounded-lg bg-amber-500/10"
        >
          <Crown size={14} color="#F59E0B" />
          <Text className="text-amber-500 text-sm font-medium ml-2">
            {isAtLimit ? "Upgrade for unlimited" : "Running low? Upgrade"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default UpgradeModal;
