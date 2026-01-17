import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  FadeInRight,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import {
  ArrowLeft,
  Heart,
  Star,
  Play,
  Clock,
  MapPin,
  ChevronRight,
  Bookmark,
  Share2,
  Music,
  Headphones,
  TrendingUp,
  Zap,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============ STYLE 1: MINIMAL & CLEAN (Apple-inspired) ============
function MinimalCleanStyle() {
  return (
    <Animated.View
      entering={FadeInDown.delay(100).springify()}
      className="mb-8"
    >
      <Text className="text-xl font-bold text-gray-900 mb-4 px-1">
        1. Minimal & Clean
      </Text>
      <View className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-6">
          <View>
            <Text className="text-sm text-gray-400 font-medium">
              Good morning
            </Text>
            <Text className="text-2xl font-bold text-gray-900">Sarah</Text>
          </View>
          <View className="w-12 h-12 rounded-full overflow-hidden">
            <Image
              source={{
                uri: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
              }}
              className="w-full h-full"
            />
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row mb-6">
          <View className="flex-1 bg-gray-50 rounded-2xl p-4 mr-2">
            <Text className="text-gray-400 text-xs font-medium mb-1">
              TASKS
            </Text>
            <Text className="text-3xl font-bold text-gray-900">12</Text>
            <Text className="text-gray-400 text-xs">3 urgent</Text>
          </View>
          <View className="flex-1 bg-gray-50 rounded-2xl p-4 ml-2">
            <Text className="text-gray-400 text-xs font-medium mb-1">
              FOCUS
            </Text>
            <Text className="text-3xl font-bold text-gray-900">4h</Text>
            <Text className="text-gray-400 text-xs">today</Text>
          </View>
        </View>

        {/* Task Item */}
        <Pressable className="flex-row items-center bg-gray-50 rounded-2xl p-4">
          <View className="w-10 h-10 rounded-xl bg-blue-500 items-center justify-center mr-3">
            <Star size={20} color="white" />
          </View>
          <View className="flex-1">
            <Text className="text-gray-900 font-semibold">
              Review design system
            </Text>
            <Text className="text-gray-400 text-sm">Due today at 5:00 PM</Text>
          </View>
          <ChevronRight size={20} color="#9CA3AF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ============ STYLE 2: BOLD & VIBRANT (Spotify-inspired) ============
function BoldVibrantStyle() {
  return (
    <Animated.View
      entering={FadeInDown.delay(200).springify()}
      className="mb-8"
    >
      <Text className="text-xl font-bold text-gray-900 mb-4 px-1">
        2. Bold & Vibrant
      </Text>
      <View className="rounded-3xl overflow-hidden">
        <LinearGradient
          colors={["#1DB954", "#191414"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 24 }}
        >
          {/* Featured Card */}
          <View className="flex-row items-center mb-6">
            <View className="w-24 h-24 rounded-2xl overflow-hidden mr-4">
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400",
                }}
                className="w-full h-full"
              />
            </View>
            <View className="flex-1">
              <Text className="text-green-400 text-xs font-bold mb-1">
                NOW PLAYING
              </Text>
              <Text className="text-white text-xl font-bold mb-1">
                Midnight City
              </Text>
              <Text className="text-gray-400">M83</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View className="h-1 bg-gray-700 rounded-full mb-4">
            <View className="h-full w-2/3 bg-green-500 rounded-full" />
          </View>

          {/* Controls */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Heart size={24} color="#1DB954" fill="#1DB954" />
              <Text className="text-white ml-2">24.5K</Text>
            </View>
            <View className="w-16 h-16 rounded-full bg-green-500 items-center justify-center">
              <Play size={32} color="black" fill="black" />
            </View>
            <View className="flex-row items-center">
              <Share2 size={24} color="#9CA3AF" />
            </View>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

// ============ STYLE 3: DARK & PREMIUM (Fintech-inspired) ============
function DarkPremiumStyle() {
  return (
    <Animated.View
      entering={FadeInDown.delay(300).springify()}
      className="mb-8"
    >
      <Text className="text-xl font-bold text-gray-900 mb-4 px-1">
        3. Dark & Premium
      </Text>
      <View className="rounded-3xl overflow-hidden">
        <LinearGradient
          colors={["#0D0D0D", "#1A1A2E"]}
          style={{ padding: 24 }}
        >
          {/* Balance Card */}
          <View className="mb-6">
            <Text className="text-gray-500 text-sm font-medium mb-2">
              Total Balance
            </Text>
            <Text className="text-white text-4xl font-bold mb-1">
              $24,562.80
            </Text>
            <View className="flex-row items-center">
              <TrendingUp size={16} color="#00FF88" />
              <Text className="text-green-400 ml-1 font-medium">
                +12.5% this month
              </Text>
            </View>
          </View>

          {/* Asset Cards */}
          <View className="flex-row mb-4">
            <View className="flex-1 bg-white/5 rounded-2xl p-4 mr-2 border border-white/10">
              <View className="w-10 h-10 rounded-full bg-orange-500/20 items-center justify-center mb-3">
                <Text className="text-xl">₿</Text>
              </View>
              <Text className="text-white font-semibold">Bitcoin</Text>
              <Text className="text-gray-400 text-sm">$18,234.50</Text>
              <Text className="text-green-400 text-xs mt-1">+5.2%</Text>
            </View>
            <View className="flex-1 bg-white/5 rounded-2xl p-4 ml-2 border border-white/10">
              <View className="w-10 h-10 rounded-full bg-blue-500/20 items-center justify-center mb-3">
                <Text className="text-xl">Ξ</Text>
              </View>
              <Text className="text-white font-semibold">Ethereum</Text>
              <Text className="text-gray-400 text-sm">$6,328.30</Text>
              <Text className="text-green-400 text-xs mt-1">+8.7%</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View className="flex-row">
            <Pressable className="flex-1 bg-cyan-500 rounded-2xl py-4 mr-2 items-center">
              <Text className="text-black font-bold">Buy</Text>
            </Pressable>
            <Pressable className="flex-1 bg-white/10 rounded-2xl py-4 ml-2 items-center border border-white/20">
              <Text className="text-white font-bold">Sell</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

// ============ STYLE 4: WARM & FRIENDLY (Wellness-inspired) ============
function WarmFriendlyStyle() {
  return (
    <Animated.View
      entering={FadeInDown.delay(400).springify()}
      className="mb-8"
    >
      <Text className="text-xl font-bold text-gray-900 mb-4 px-1">
        4. Warm & Friendly
      </Text>
      <View className="rounded-3xl overflow-hidden">
        <LinearGradient
          colors={["#FFF5EB", "#FFECD2"]}
          style={{ padding: 24 }}
        >
          {/* Greeting */}
          <View className="flex-row items-center justify-between mb-6">
            <View>
              <Text className="text-orange-400 text-sm font-medium">
                ✨ Daily Check-in
              </Text>
              <Text className="text-gray-800 text-2xl font-bold mt-1">
                How are you feeling?
              </Text>
            </View>
            <Sun size={32} color="#F59E0B" />
          </View>

          {/* Mood Selection */}
          <View className="flex-row justify-between mb-6">
            {["😊", "😌", "😐", "😔", "😫"].map((emoji, i) => (
              <Pressable
                key={i}
                className={`w-14 h-14 rounded-2xl items-center justify-center ${
                  i === 0 ? "bg-orange-400" : "bg-white/60"
                }`}
              >
                <Text className="text-2xl">{emoji}</Text>
              </Pressable>
            ))}
          </View>

          {/* Stats Card */}
          <View className="bg-white/60 rounded-2xl p-4 mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-gray-700 font-semibold">
                7-day streak! 🔥
              </Text>
              <View className="bg-orange-100 px-3 py-1 rounded-full">
                <Text className="text-orange-600 font-medium text-sm">
                  +50 XP
                </Text>
              </View>
            </View>
            <View className="h-2 bg-orange-100 rounded-full">
              <View className="h-full w-4/5 bg-orange-400 rounded-full" />
            </View>
          </View>

          {/* Suggestion */}
          <Pressable className="bg-white rounded-2xl p-4 flex-row items-center">
            <View className="w-12 h-12 rounded-xl bg-teal-100 items-center justify-center mr-3">
              <Sparkles size={24} color="#14B8A6" />
            </View>
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold">
                Try a breathing exercise
              </Text>
              <Text className="text-gray-500 text-sm">
                5 min • Reduce stress
              </Text>
            </View>
            <ChevronRight size={20} color="#9CA3AF" />
          </Pressable>
        </LinearGradient>
      </View>
    </Animated.View>
  );
}

// ============ STYLE 5: EDITORIAL & CONTENT (Airbnb-inspired) ============
function EditorialStyle() {
  return (
    <Animated.View
      entering={FadeInDown.delay(500).springify()}
      className="mb-8"
    >
      <Text className="text-xl font-bold text-gray-900 mb-4 px-1">
        5. Editorial & Content
      </Text>
      <View className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
        {/* Hero Image */}
        <View className="h-48 relative">
          <Image
            source={{
              uri: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800",
            }}
            className="w-full h-full"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.6)"]}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 80,
              justifyContent: "flex-end",
              padding: 16,
            }}
          >
            <View className="flex-row items-center">
              <View className="bg-white/20 backdrop-blur px-3 py-1 rounded-full flex-row items-center">
                <Star size={14} color="#FFD700" fill="#FFD700" />
                <Text className="text-white ml-1 font-medium text-sm">
                  4.98
                </Text>
              </View>
              <Text className="text-white/80 ml-2 text-sm">
                128 reviews
              </Text>
            </View>
          </LinearGradient>
          {/* Bookmark */}
          <Pressable className="absolute top-4 right-4 w-10 h-10 bg-white rounded-full items-center justify-center shadow-lg">
            <Heart size={20} color="#1A1A2E" />
          </Pressable>
        </View>

        {/* Content */}
        <View className="p-5">
          <Text className="text-gray-900 text-xl font-bold mb-1">
            Eiffel Tower View Apartment
          </Text>
          <View className="flex-row items-center mb-3">
            <MapPin size={14} color="#9CA3AF" />
            <Text className="text-gray-500 ml-1">Paris, France</Text>
          </View>

          <Text className="text-gray-600 leading-6 mb-4">
            Wake up to stunning views of the Eiffel Tower from this charming
            Parisian apartment in the heart of the 7th arrondissement.
          </Text>

          {/* Price & Book */}
          <View className="flex-row items-center justify-between pt-4 border-t border-gray-100">
            <View>
              <Text className="text-gray-400 text-sm">From</Text>
              <View className="flex-row items-baseline">
                <Text className="text-gray-900 text-2xl font-bold">$285</Text>
                <Text className="text-gray-500 ml-1">/ night</Text>
              </View>
            </View>
            <Pressable className="bg-rose-500 px-6 py-3 rounded-xl">
              <Text className="text-white font-bold">Reserve</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ============ MAIN SCREEN ============
export default function DesignShowcaseScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      {/* Header */}
      <View className="px-5 py-4 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm mr-4"
        >
          <ArrowLeft size={20} color="#1A1A2E" />
        </Pressable>
        <View>
          <Text className="text-2xl font-bold text-gray-900">
            Design Showcase
          </Text>
          <Text className="text-gray-500">5 different UI styles</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <MinimalCleanStyle />
        <BoldVibrantStyle />
        <DarkPremiumStyle />
        <WarmFriendlyStyle />
        <EditorialStyle />

        {/* Footer Note */}
        <View className="bg-blue-50 rounded-2xl p-4 mt-4">
          <Text className="text-blue-800 font-semibold mb-1">
            Like a style?
          </Text>
          <Text className="text-blue-600 text-sm leading-5">
            Tell me which design style you prefer and I can apply it to your
            app's screens!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
