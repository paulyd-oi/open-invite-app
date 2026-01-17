import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { toast } from "@/components/Toast";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import {
  ChevronLeft,
  Building2,
  Camera,
  Globe,
  Instagram,
  Twitter,
  Facebook,
  MapPin,
  Mail,
  Phone,
  Check,
  ImagePlus,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/lib/ThemeContext";
import { useSession } from "@/lib/useSession";
import { api } from "@/lib/api";
import type { Business } from "@/shared/contracts";

const CATEGORIES = [
  { id: "fitness", label: "Fitness & Sports", emoji: "🏃" },
  { id: "food", label: "Food & Drinks", emoji: "🍕" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬" },
  { id: "community", label: "Community", emoji: "🤝" },
  { id: "religious", label: "Religious", emoji: "⛪" },
  { id: "sports", label: "Sports Teams", emoji: "⚽" },
  { id: "arts", label: "Arts & Culture", emoji: "🎨" },
  { id: "education", label: "Education", emoji: "📚" },
  { id: "other", label: "Other", emoji: "📋" },
];

export default function EditBusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor, isDark, colors } = useTheme();
  const { data: session } = useSession();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [facebook, setFacebook] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Fetch business data
  const { data, isLoading } = useQuery({
    queryKey: ["business", id],
    queryFn: () => api.get<{ business: Business }>(`/api/businesses/${id}`),
    enabled: !!id && !!session,
  });

  const business = data?.business;

  // Initialize form with business data
  useEffect(() => {
    if (business) {
      setName(business.name || "");
      setDescription(business.description || "");
      setCategory(business.category || "other");
      setLocation(business.location || "");
      setWebsite(business.website || "");
      setEmail(business.email || "");
      setPhone(business.phone || "");
      setInstagram(business.instagram || "");
      setTwitter(business.twitter || "");
      setFacebook(business.facebook || "");
      setLogoUrl(business.logoUrl || null);
      setCoverUrl(business.coverUrl || null);
    }
  }, [business]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Partial<Business>) =>
      api.put(`/api/businesses/${id}`, data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["business", id] });
      queryClient.invalidateQueries({ queryKey: ["businesses"] });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      router.back();
    },
    onError: (error: Error) => {
      toast.error("Error", error.message || "Failed to update business");
    },
  });

  // Image upload
  const pickImage = async (type: "logo" | "cover") => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      toast.warning("Permission Needed", "Please allow access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: type === "logo" ? [1, 1] : [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      uploadImage(result.assets[0].uri, type);
    }
  };

  const uploadImage = async (uri: string, type: "logo" | "cover") => {
    if (type === "logo") setIsUploadingLogo(true);
    else setIsUploadingCover(true);

    try {
      const formData = new FormData();
      const filename = uri.split("/").pop() || "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const imageType = match ? `image/${match[1]}` : "image/jpeg";

      formData.append("file", {
        uri,
        name: filename,
        type: imageType,
      } as any);

      const response = await api.upload<{ url: string }>("/api/upload", formData);

      if (type === "logo") setLogoUrl(response.url);
      else setCoverUrl(response.url);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      toast.error("Upload Error", "Failed to upload image. Please try again.");
    } finally {
      if (type === "logo") setIsUploadingLogo(false);
      else setIsUploadingCover(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.warning("Required", "Business name is required");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      category,
      location: location.trim() || null,
      website: website.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      instagram: instagram.trim() || null,
      twitter: twitter.trim() || null,
      facebook: facebook.trim() || null,
      logoUrl,
      coverUrl,
    });
  };

  if (!session) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Text style={{ color: colors.textSecondary }}>Please sign in</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }} edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-3" style={{ backgroundColor: colors.background }}>
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center mr-3"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold" style={{ color: colors.text }}>
          Edit Profile
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={updateMutation.isPending}
          className="px-4 py-2 rounded-full"
          style={{ backgroundColor: themeColor }}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white font-semibold">Save</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover Image */}
          <Animated.View entering={FadeInDown.springify()} className="mx-4 mt-4">
            <Text className="text-xs font-semibold uppercase tracking-wider mb-2 ml-1" style={{ color: colors.textTertiary }}>
              Cover Image
            </Text>
            <Pressable
              onPress={() => pickImage("cover")}
              disabled={isUploadingCover}
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              {coverUrl ? (
                <View className="relative">
                  <Image source={{ uri: coverUrl }} className="w-full h-32" resizeMode="cover" />
                  <View className="absolute inset-0 bg-black/30 items-center justify-center">
                    {isUploadingCover ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Camera size={24} color="#fff" />
                    )}
                  </View>
                </View>
              ) : (
                <View className="h-32 items-center justify-center">
                  {isUploadingCover ? (
                    <ActivityIndicator color={themeColor} />
                  ) : (
                    <>
                      <ImagePlus size={32} color={colors.textTertiary} />
                      <Text className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
                        Add cover image
                      </Text>
                    </>
                  )}
                </View>
              )}
            </Pressable>
          </Animated.View>

          {/* Logo */}
          <Animated.View entering={FadeInDown.delay(50).springify()} className="mx-4 mt-4">
            <Text className="text-xs font-semibold uppercase tracking-wider mb-2 ml-1" style={{ color: colors.textTertiary }}>
              Logo
            </Text>
            <Pressable
              onPress={() => pickImage("logo")}
              disabled={isUploadingLogo}
              className="w-24 h-24 rounded-xl overflow-hidden"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              {logoUrl ? (
                <View className="relative w-full h-full">
                  <Image source={{ uri: logoUrl }} className="w-full h-full" resizeMode="cover" />
                  <View className="absolute inset-0 bg-black/30 items-center justify-center">
                    {isUploadingLogo ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Camera size={20} color="#fff" />
                    )}
                  </View>
                </View>
              ) : (
                <View className="w-full h-full items-center justify-center">
                  {isUploadingLogo ? (
                    <ActivityIndicator color={themeColor} />
                  ) : (
                    <Building2 size={32} color={colors.textTertiary} />
                  )}
                </View>
              )}
            </Pressable>
          </Animated.View>

          {/* Basic Info */}
          <Animated.View entering={FadeInDown.delay(100).springify()} className="mx-4 mt-6">
            <Text className="text-xs font-semibold uppercase tracking-wider mb-2 ml-1" style={{ color: colors.textTertiary }}>
              Basic Info
            </Text>
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface }}>
              {/* Name */}
              <View className="px-4 py-3 border-b" style={{ borderColor: colors.border }}>
                <Text className="text-xs mb-1" style={{ color: colors.textTertiary }}>Business Name *</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your business name"
                  placeholderTextColor={colors.textTertiary}
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>

              {/* Description */}
              <View className="px-4 py-3 border-b" style={{ borderColor: colors.border }}>
                <Text className="text-xs mb-1" style={{ color: colors.textTertiary }}>Description</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Tell people about your business..."
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  numberOfLines={3}
                  style={{ color: colors.text, fontSize: 16, minHeight: 60 }}
                />
              </View>

              {/* Category */}
              <View className="px-4 py-3">
                <Text className="text-xs mb-2" style={{ color: colors.textTertiary }}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 px-4">
                  {CATEGORIES.map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setCategory(cat.id);
                      }}
                      className="mr-2 px-3 py-2 rounded-full flex-row items-center"
                      style={{
                        backgroundColor: category === cat.id ? themeColor : (isDark ? "#2C2C2E" : "#F3F4F6"),
                      }}
                    >
                      <Text className="mr-1">{cat.emoji}</Text>
                      <Text
                        className="text-sm"
                        style={{ color: category === cat.id ? "#fff" : colors.text }}
                      >
                        {cat.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Animated.View>

          {/* Contact Info */}
          <Animated.View entering={FadeInDown.delay(150).springify()} className="mx-4 mt-6">
            <Text className="text-xs font-semibold uppercase tracking-wider mb-2 ml-1" style={{ color: colors.textTertiary }}>
              Contact & Location
            </Text>
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface }}>
              {/* Location */}
              <View className="px-4 py-3 border-b flex-row items-center" style={{ borderColor: colors.border }}>
                <MapPin size={18} color={colors.textSecondary} />
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City, State"
                  placeholderTextColor={colors.textTertiary}
                  className="flex-1 ml-3"
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>

              {/* Email */}
              <View className="px-4 py-3 border-b flex-row items-center" style={{ borderColor: colors.border }}>
                <Mail size={18} color={colors.textSecondary} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="contact@business.com"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  className="flex-1 ml-3"
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>

              {/* Phone */}
              <View className="px-4 py-3 flex-row items-center">
                <Phone size={18} color={colors.textSecondary} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="(555) 555-5555"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  className="flex-1 ml-3"
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>
            </View>
          </Animated.View>

          {/* Social Links */}
          <Animated.View entering={FadeInDown.delay(200).springify()} className="mx-4 mt-6">
            <Text className="text-xs font-semibold uppercase tracking-wider mb-2 ml-1" style={{ color: colors.textTertiary }}>
              Website & Social Links
            </Text>
            <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: colors.surface }}>
              {/* Website */}
              <View className="px-4 py-3 border-b flex-row items-center" style={{ borderColor: colors.border }}>
                <Globe size={18} color={colors.textSecondary} />
                <TextInput
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://yourbusiness.com"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="url"
                  autoCapitalize="none"
                  className="flex-1 ml-3"
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>

              {/* Instagram */}
              <View className="px-4 py-3 border-b flex-row items-center" style={{ borderColor: colors.border }}>
                <Instagram size={18} color="#E4405F" />
                <TextInput
                  value={instagram}
                  onChangeText={setInstagram}
                  placeholder="@yourbusiness"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 ml-3"
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>

              {/* Twitter */}
              <View className="px-4 py-3 border-b flex-row items-center" style={{ borderColor: colors.border }}>
                <Twitter size={18} color="#1DA1F2" />
                <TextInput
                  value={twitter}
                  onChangeText={setTwitter}
                  placeholder="@yourbusiness"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 ml-3"
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>

              {/* Facebook */}
              <View className="px-4 py-3 flex-row items-center">
                <Facebook size={18} color="#1877F2" />
                <TextInput
                  value={facebook}
                  onChangeText={setFacebook}
                  placeholder="facebook.com/yourbusiness"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  className="flex-1 ml-3"
                  style={{ color: colors.text, fontSize: 16 }}
                />
              </View>
            </View>
          </Animated.View>

          {/* Info Note */}
          <View className="mx-4 mt-6 px-4 py-3 rounded-xl" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}>
            <Text className="text-sm" style={{ color: colors.textSecondary, lineHeight: 20 }}>
              Your website and social links will be displayed on your public business page, making it easy for followers to connect with you.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
