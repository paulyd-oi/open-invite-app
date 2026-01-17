import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
} from "react-native";
import { toast } from "@/components/Toast";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, Stack } from "expo-router";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Globe,
  Mail,
  Phone,
  Instagram,
  Camera,
  Check,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/ThemeContext";
import { FEATURES } from "@/lib/features";
import { BUSINESS_CATEGORIES, type BusinessCategory } from "../../shared/contracts";

export default function CreateBusinessScreen() {
  const router = useRouter();

  // Feature flag gate - redirect if business accounts disabled
  useEffect(() => {
    if (!FEATURES.businessAccounts) {
      router.replace("/");
    }
  }, []);

  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { themeColor, isDark, colors } = useTheme();

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<BusinessCategory>("community");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");

  const [step, setStep] = useState(1);

  const createBusinessMutation = useMutation({
    mutationFn: (data: {
      name: string;
      handle: string;
      description?: string;
      category: BusinessCategory;
      location?: string;
      website?: string;
      email?: string;
      phone?: string;
      instagram?: string;
    }) => api.post<{ business: { id: string } }>("/api/businesses", data),
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
      queryClient.invalidateQueries({ queryKey: ["ownedBusinesses"] });
      router.replace(`/business/${data.business.id}` as any);
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to create business";
      toast.error("Error", message);
    },
  });

  // Don't render if feature is disabled
  if (!FEATURES.businessAccounts) {
    return null;
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.warning("Required", "Please enter a business name");
      return;
    }
    if (!handle.trim() || handle.length < 3) {
      toast.warning("Required", "Handle must be at least 3 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(handle)) {
      toast.warning("Invalid Handle", "Handle can only contain letters, numbers, and underscores");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    createBusinessMutation.mutate({
      name: name.trim(),
      handle: handle.trim().toLowerCase(),
      description: description.trim() || undefined,
      category,
      location: location.trim() || undefined,
      website: website.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      instagram: instagram.trim() || undefined,
    });
  };

  // Auto-generate handle from name
  const generateHandle = (businessName: string) => {
    return businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 30);
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="px-4 py-3 flex-row items-center justify-between border-b" style={{ borderColor: colors.border }}>
        <Pressable
          onPress={() => {
            if (step > 1) {
              setStep(step - 1);
            } else {
              router.back();
            }
          }}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
          Create Business
        </Text>
        <View className="w-10" />
      </View>

      {/* Progress */}
      <View className="px-4 py-3">
        <View className="flex-row">
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              className="flex-1 h-1 rounded-full mx-1"
              style={{ backgroundColor: s <= step ? "#9333EA" : (isDark ? "#2C2C2E" : "#E5E7EB") }}
            />
          ))}
        </View>
        <Text className="text-sm mt-2" style={{ color: colors.textSecondary }}>
          Step {step} of 3
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {step === 1 && (
          /* Step 1: Basic Info */
          <>
            <View className="py-4">
              <View className="items-center mb-6">
                <View
                  className="w-24 h-24 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: "#9333EA20" }}
                >
                  <Building2 size={40} color="#9333EA" />
                </View>
                <Text className="text-xl font-bold mt-4" style={{ color: colors.text }}>
                  Business Details
                </Text>
                <Text className="text-center mt-2" style={{ color: colors.textSecondary }}>
                  Tell us about your business or organization
                </Text>
              </View>

              {/* Business Name */}
              <Text className="font-medium mb-2" style={{ color: colors.text }}>
                Business Name *
              </Text>
              <TextInput
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (!handle || handle === generateHandle(name)) {
                    setHandle(generateHandle(text));
                  }
                }}
                placeholder="e.g., Austin Run Club"
                placeholderTextColor={colors.textTertiary}
                className="rounded-xl px-4 py-3 mb-4"
                style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6", color: colors.text }}
              />

              {/* Handle */}
              <Text className="font-medium mb-2" style={{ color: colors.text }}>
                Handle *
              </Text>
              <View className="flex-row items-center rounded-xl px-4 mb-1" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                <Text style={{ color: colors.textSecondary }}>@</Text>
                <TextInput
                  value={handle}
                  onChangeText={(text) => setHandle(text.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="austinrunclub"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 py-3 px-2"
                  style={{ color: colors.text }}
                />
              </View>
              <Text className="text-xs mb-4" style={{ color: colors.textTertiary }}>
                This is your unique identifier. Only letters, numbers, and underscores.
              </Text>

              {/* Description */}
              <Text className="font-medium mb-2" style={{ color: colors.text }}>
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Tell people about your business..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={4}
                className="rounded-xl px-4 py-3 mb-4"
                style={{
                  backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6",
                  color: colors.text,
                  minHeight: 100,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <Pressable
              onPress={() => {
                if (!name.trim()) {
                  toast.warning("Required", "Please enter a business name");
                  return;
                }
                if (!handle.trim() || handle.length < 3) {
                  toast.warning("Required", "Handle must be at least 3 characters");
                  return;
                }
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStep(2);
              }}
              className="py-4 rounded-xl mb-6"
              style={{ backgroundColor: "#9333EA" }}
            >
              <Text className="text-white text-center font-semibold">Continue</Text>
            </Pressable>
          </>
        )}

        {step === 2 && (
          /* Step 2: Category & Location */
          <>
            <View className="py-4">
              <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
                Category
              </Text>
              <Text className="mb-4" style={{ color: colors.textSecondary }}>
                What type of business or organization is this?
              </Text>

              <View className="flex-row flex-wrap mb-6">
                {BUSINESS_CATEGORIES.map((cat) => {
                  const isSelected = category === cat.value;
                  return (
                    <Pressable
                      key={cat.value}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setCategory(cat.value as BusinessCategory);
                      }}
                      className="mr-2 mb-2 px-4 py-2 rounded-full flex-row items-center"
                      style={{
                        backgroundColor: isSelected ? "#9333EA" : (isDark ? "#2C2C2E" : "#F3F4F6"),
                        borderWidth: isSelected ? 0 : 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Text className="mr-1.5">{cat.emoji}</Text>
                      <Text
                        className="font-medium"
                        style={{ color: isSelected ? "#fff" : colors.text }}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
                Location
              </Text>
              <Text className="mb-4" style={{ color: colors.textSecondary }}>
                Where is your business located?
              </Text>

              <View className="flex-row items-center rounded-xl px-4 mb-4" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                <MapPin size={18} color={colors.textSecondary} />
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City, State or full address"
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 py-3 px-3"
                  style={{ color: colors.text }}
                />
              </View>
            </View>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStep(3);
              }}
              className="py-4 rounded-xl mb-6"
              style={{ backgroundColor: "#9333EA" }}
            >
              <Text className="text-white text-center font-semibold">Continue</Text>
            </Pressable>
          </>
        )}

        {step === 3 && (
          /* Step 3: Contact & Social */
          <>
            <View className="py-4">
              <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
                Contact Info
              </Text>
              <Text className="mb-4" style={{ color: colors.textSecondary }}>
                Help people reach you (all optional)
              </Text>

              {/* Website */}
              <View className="flex-row items-center rounded-xl px-4 mb-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                <Globe size={18} color={colors.textSecondary} />
                <TextInput
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="Website URL"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  keyboardType="url"
                  className="flex-1 py-3 px-3"
                  style={{ color: colors.text }}
                />
              </View>

              {/* Email */}
              <View className="flex-row items-center rounded-xl px-4 mb-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                <Mail size={18} color={colors.textSecondary} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email address"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="flex-1 py-3 px-3"
                  style={{ color: colors.text }}
                />
              </View>

              {/* Phone */}
              <View className="flex-row items-center rounded-xl px-4 mb-6" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                <Phone size={18} color={colors.textSecondary} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  className="flex-1 py-3 px-3"
                  style={{ color: colors.text }}
                />
              </View>

              <Text className="text-xl font-bold mb-2" style={{ color: colors.text }}>
                Social Media
              </Text>
              <Text className="mb-4" style={{ color: colors.textSecondary }}>
                Link your social accounts (optional)
              </Text>

              {/* Instagram */}
              <View className="flex-row items-center rounded-xl px-4 mb-3" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
                <Instagram size={18} color="#E1306C" />
                <TextInput
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder="Instagram username"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 py-3 px-3"
                  style={{ color: colors.text }}
                />
              </View>
            </View>

            {/* Summary Card */}
            <View
              className="rounded-xl p-4 mb-4"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Text className="font-semibold mb-3" style={{ color: colors.text }}>
                Review Your Business
              </Text>
              <View className="flex-row items-center">
                <View className="w-14 h-14 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: "#9333EA20" }}>
                  <Text className="text-2xl">
                    {BUSINESS_CATEGORIES.find((c) => c.value === category)?.emoji ?? "📌"}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>
                    {name}
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    @{handle}
                  </Text>
                  {location && (
                    <Text className="text-sm" style={{ color: colors.textTertiary }}>
                      {location}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={createBusinessMutation.isPending}
              className="py-4 rounded-xl mb-6 flex-row items-center justify-center"
              style={{ backgroundColor: "#9333EA" }}
            >
              {createBusinessMutation.isPending ? (
                <Text className="text-white font-semibold">Creating...</Text>
              ) : (
                <>
                  <Check size={18} color="#fff" />
                  <Text className="text-white font-semibold ml-2">Create Business</Text>
                </>
              )}
            </Pressable>

            <Text className="text-xs text-center mb-6" style={{ color: colors.textTertiary }}>
              By creating a business, you agree to our Terms of Service and will be able to create public events visible to all users.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
