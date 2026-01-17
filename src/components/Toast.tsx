import React, { useEffect, useCallback } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  SlideInUp,
  SlideOutUp,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Check, X, AlertCircle, Info } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Toast types
type ToastType = "success" | "error" | "info" | "warning";

interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

// Toast store
interface ToastStore {
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// Helper functions for easy use
export const toast = {
  success: (title: string, message?: string, duration?: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    useToastStore.getState().addToast({ type: "success", title, message, duration });
  },
  error: (title: string, message?: string, duration?: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    useToastStore.getState().addToast({ type: "error", title, message, duration });
  },
  info: (title: string, message?: string, duration?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useToastStore.getState().addToast({ type: "info", title, message, duration });
  },
  warning: (title: string, message?: string, duration?: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    useToastStore.getState().addToast({ type: "warning", title, message, duration });
  },
};

// Individual toast component
function ToastItem({ toast: toastData, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const typeConfig = {
    success: {
      bg: "#10B981",
      icon: <Check size={20} color="#fff" strokeWidth={3} />,
    },
    error: {
      bg: "#EF4444",
      icon: <X size={20} color="#fff" strokeWidth={3} />,
    },
    info: {
      bg: "#3B82F6",
      icon: <Info size={20} color="#fff" strokeWidth={3} />,
    },
    warning: {
      bg: "#F59E0B",
      icon: <AlertCircle size={20} color="#fff" strokeWidth={3} />,
    },
  };

  const config = typeConfig[toastData.type];
  const duration = toastData.duration ?? 3000;

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      opacity.value = 1 - Math.abs(e.translationX) / (SCREEN_WIDTH / 2);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SCREEN_WIDTH / 4) {
        translateX.value = withTiming(e.translationX > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH, {}, () => {
          runOnJS(onDismiss)();
        });
      } else {
        translateX.value = withSpring(0);
        opacity.value = withSpring(1);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={SlideInUp.springify().damping(15)}
        exiting={SlideOutUp.springify().damping(15)}
        style={[animatedStyle]}
        className="mx-4 mb-2"
      >
        <Pressable
          onPress={onDismiss}
          className="flex-row items-center p-4 rounded-2xl"
          style={{
            backgroundColor: config.bg,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <View className="w-8 h-8 rounded-full bg-white/20 items-center justify-center mr-3">
            {config.icon}
          </View>
          <View className="flex-1">
            <Text className="text-white font-semibold text-base">{toastData.title}</Text>
            {toastData.message && (
              <Text className="text-white/80 text-sm mt-0.5">{toastData.message}</Text>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

// Toast container - render this at the root
export function ToastContainer() {
  const insets = useSafeAreaInsets();
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <View
      className="absolute left-0 right-0 z-50"
      style={{ top: insets.top + 8 }}
      pointerEvents="box-none"
    >
      {toasts.map((t) => (
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => removeToast(t.id)}
        />
      ))}
    </View>
  );
}
