import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeInUp,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  Calendar as CalendarIcon,
  ArrowRight,
  Camera,
  Eye,
  EyeOff,
  Sparkles,
} from "@/ui/icons";
import { useFonts } from "expo-font";
import { Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";

import { authClient, hasAuthToken, setAuthToken } from "@/lib/authClient";
import { getSessionCached } from "@/lib/sessionCache";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { safeToast } from "@/lib/safeToast";
import { isAppleSignInAvailable, isAppleAuthCancellation } from "@/lib/appleSignIn";

// Apple Authentication - dynamically loaded (requires native build with usesAppleSignIn: true)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AppleAuthentication: any = null;
try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  console.log("[Apple Auth] expo-apple-authentication not available - requires native build");
}

// ============ THEME HELPERS (LOCAL SCOPE ONLY) ============
interface OnboardingTheme {
  background: string;
  surface: string;
  surfaceBorder: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  inputBg: string;
  inputBorder: string;
}

const lightTheme: OnboardingTheme = {
  background: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceBorder: "rgba(0,0,0,0.08)",
  text: "#1A1A1A",
  textSecondary: "#666666",
  textTertiary: "#999999",
  accent: "#E85D4C",
  inputBg: "#FFFFFF",
  inputBorder: "rgba(0,0,0,0.12)",
};

const darkTheme: OnboardingTheme = {
  background: "#121218",
  surface: "rgba(255,255,255,0.06)",
  surfaceBorder: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.65)",
  textTertiary: "rgba(255,255,255,0.4)",
  accent: "#E85D4C",
  inputBg: "rgba(255,255,255,0.06)",
  inputBorder: "rgba(255,255,255,0.12)",
};

function useOnboardingTheme(): OnboardingTheme {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTheme : lightTheme;
}

// ============ NORMALIZE URL HELPER ============
function normalizeAvatarUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${BACKEND_URL}${url}`;
  }
  return url;
}

// ============ SLIDE TYPES ============
type OnboardingSlide = 1 | 2 | 3 | 4;

// ============ SHARED LAYOUT ============
const OnboardingLayout = ({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: OnboardingTheme;
}) => {
  return (
    <View style={[styles.layoutContainer, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        {children}
      </SafeAreaView>
    </View>
  );
};

// ============ PRIMARY BUTTON ============
const PrimaryButton = ({
  onPress,
  title,
  loading = false,
  theme,
}: {
  onPress: () => void;
  title: string;
  loading?: boolean;
  theme: OnboardingTheme;
}) => {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.96, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.primaryButton,
          { backgroundColor: theme.accent },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text style={styles.primaryButtonText}>{title}</Text>
            <ArrowRight size={20} color="#fff" />
          </>
        )}
      </Pressable>
    </Animated.View>
  );
};

// ============ SECONDARY BUTTON ============
const SecondaryButton = ({
  onPress,
  title,
  theme,
}: {
  onPress: () => void;
  title: string;
  theme: OnboardingTheme;
}) => (
  <Pressable
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }}
    style={styles.secondaryButton}
  >
    <Text style={[styles.secondaryButtonText, { color: theme.textSecondary }]}>
      {title}
    </Text>
  </Pressable>
);

// ============ AUTH BUTTON ============
const AuthButton = ({
  onPress,
  title,
  loading = false,
  theme,
}: {
  onPress: () => void;
  title: string;
  loading?: boolean;
  theme: OnboardingTheme;
}) => (
  <Pressable
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onPress();
    }}
    style={[
      styles.authButton,
      { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
    ]}
  >
    {loading ? (
      <ActivityIndicator color={theme.text} size="small" />
    ) : (
      <Text style={[styles.authButtonText, { color: theme.text }]}>{title}</Text>
    )}
  </Pressable>
);

// ============ STYLED INPUT ============
const StyledInput = ({
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "none",
  secureTextEntry = false,
  showPassword,
  onTogglePassword,
  autoFocus = false,
  error,
  theme,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words" | "sentences";
  secureTextEntry?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  autoFocus?: boolean;
  error?: string;
  theme: OnboardingTheme;
}) => (
  <View>
    <View
      style={[
        styles.inputContainer,
        {
          backgroundColor: theme.inputBg,
          borderColor: error ? "#E85D4C" : theme.inputBorder,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry && !showPassword}
        autoFocus={autoFocus}
        style={[styles.input, { color: theme.text }]}
      />
      {onTogglePassword && (
        <Pressable onPress={onTogglePassword} style={styles.eyeButton}>
          {showPassword ? (
            <EyeOff size={20} color={theme.textTertiary} />
          ) : (
            <Eye size={20} color={theme.textTertiary} />
          )}
        </Pressable>
      )}
    </View>
    {error && <Text style={styles.errorText}>{error}</Text>}
  </View>
);

// ============ MAIN COMPONENT ============
export default function WelcomeOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const theme = useOnboardingTheme();
  const isMountedRef = useRef(true);

  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  // Core state
  const [currentSlide, setCurrentSlide] = useState<OnboardingSlide>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Apple Sign-In availability
  const [isAppleSignInReady, setIsAppleSignInReady] = useState(false);

  // Auth form state (Slide 2)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Profile form state (Slide 3)
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [handleError, setHandleError] = useState<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check Apple Sign-In availability on mount
  useEffect(() => {
    if (Platform.OS === "ios") {
      isAppleSignInAvailable().then((available) => {
        setIsAppleSignInReady(available);
        if (__DEV__) {
          console.log("[Apple Auth] Availability:", available);
        }
      });
    }
  }, []);

  // ============ SLIDE 2: AUTH HANDLERS ============

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorBanner("Please enter your email and password");
      return;
    }

    console.log("[Onboarding] Starting email auth...");
    setIsLoading(true);
    setErrorBanner(null);

    try {
      // Try sign-up first, fall back to sign-in if account exists
      let result: any;
      try {
        result = await authClient.$fetch('/api/auth/sign-up/email', {
          method: 'POST',
          body: { email: email.trim(), password, name: "User" },
        });
      } catch (e: any) {
        // If account exists, try sign-in
        if (e?.message?.toLowerCase().includes("exist")) {
          result = await authClient.$fetch('/api/auth/sign-in/email', {
            method: 'POST',
            body: { email: email.trim(), password },
          });
        } else {
          throw e;
        }
      }

      // NOTE: With Better Auth, authentication is via cookies (Set-Cookie header).
      // Token in response body is optional. If present, store for backward compat.
      let tokenValue: string | null = null;
      if (result && typeof result === 'object') {
        if (typeof result.token === 'string') {
          tokenValue = result.token;
        } else if (result.token && typeof result.token === 'object') {
          tokenValue = result.token.token || result.token.value;
        }
      }

      if (tokenValue) {
        await setAuthToken(tokenValue);
        console.log("[Auth] token stored, tokenExists: true");
      } else {
        // No token in body is expected with cookie auth - cookie was set via Set-Cookie header
        console.log("[Auth] No token in response body (cookie auth mode)", Object.keys(result || {}));
      }

      // Success! Auth cookie was set. Pre-populate name if available.
      if (result?.user?.name) {
        setDisplayName(result.user.name);
      }

      // Advance to Slide 3
      setCurrentSlide(3);
    } catch (error: any) {
      console.error("[Onboarding] Auth error:", error?.message || error);
      setErrorBanner(error?.message || "Authentication failed. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleAppleSignIn = async () => {
    if (!isAppleSignInReady || !AppleAuthentication) {
      safeToast.warning("Apple Sign-In unavailable", "Use email to continue.");
      return;
    }

    console.log("[Onboarding] Starting Apple auth...");
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error("No identity token received from Apple");
      }

      // Send to backend - use credentials: "include" so Set-Cookie is persisted
      const response = await fetch(`${BACKEND_URL}/api/auth/apple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          identityToken: credential.identityToken,
          user: {
            email: credential.email,
            name: credential.fullName ? {
              firstName: credential.fullName.givenName,
              lastName: credential.fullName.familyName,
            } : null,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || (!data.success && !data.ok)) {
        throw new Error(data.error || "Apple authentication failed");
      }

      // Cookie-based auth: Set-Cookie header from backend establishes session.
      // Token in response body is optional (for backward compat with SecureStore).
      const tokenValue = data.token || data.session?.token;
      if (tokenValue) {
        await setAuthToken(tokenValue);
        console.log("[Auth] Apple: token stored (optional), tokenExists: true");
      } else {
        console.log("[Auth] Apple: no token in response (cookie auth mode)");
      }

      // Pre-populate name from Apple
      if (credential.fullName?.givenName) {
        const fullName = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ].filter(Boolean).join(" ");
        setDisplayName(fullName);
      } else if (data.user?.name) {
        setDisplayName(data.user.name);
      }

      // Advance to Slide 3 - auth succeeded (cookie is set)
      setCurrentSlide(3);
    } catch (error: any) {
      if (isAppleAuthCancellation(error)) {
        console.log("[Apple Auth] User cancelled");
        return;
      }
      console.error("[Apple Auth] Error:", error?.message || error);
      setErrorBanner(error?.message || "Apple Sign-In failed. Please try again.");
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // ============ SLIDE 3: PROFILE HANDLERS ============

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      safeToast.warning("Permission Required", "Please allow access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarLocalUri(result.assets[0].uri);
      // Start upload in background (best-effort)
      uploadPhotoInBackground(result.assets[0].uri);
    }
  };

  const uploadPhotoInBackground = async (uri: string) => {
    if (!isMountedRef.current) return;
    
    // Check session (cookie auth) before upload - skip if no session (best effort)
    try {
      const sessionResult = await getSessionCached();
      if (!sessionResult?.user?.id) {
        console.log("[Onboarding] No session for photo upload, skipping");
        return;
      }
    } catch {
      console.log("[Onboarding] Session check failed for photo upload, skipping");
      return;
    }

    setUploadBusy(true);

    try {
      const formData = new FormData();
      formData.append("image", {
        uri,
        type: "image/jpeg",
        name: "profile.jpg",
      } as unknown as Blob);

      console.log("[Onboarding] Uploading photo...");
      const uploadResponse = await fetch(`${BACKEND_URL}/api/upload/image`, {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      const normalizedUrl = normalizeAvatarUrl(uploadData.url);
      console.log("[Onboarding] Photo uploaded, normalized URL:", normalizedUrl.substring(0, 50) + "...");

      if (!isMountedRef.current) return;
      setAvatarUrl(normalizedUrl);

      // Try to save to profile (best-effort)
      try {
        await api.put("/api/profile", { avatarUrl: normalizedUrl });
        console.log("[Onboarding] Avatar URL saved to profile");
      } catch (saveError) {
        console.log("[Onboarding] Could not save avatar to profile:", saveError);
        safeToast.info("Photo uploaded", "You can save it later from your profile.");
      }
    } catch (error) {
      console.log("[Onboarding] Photo upload failed:", error);
      if (isMountedRef.current) {
        safeToast.warning("Upload failed", "Could not upload photo. You can add it later.");
      }
    } finally {
      if (isMountedRef.current) {
        setUploadBusy(false);
      }
    }
  };

  const handleSlide3Continue = async () => {
    console.log("[Onboarding] Continue pressed");
    setNameError(null);
    setHandleError(null);
    setErrorBanner(null);

    // Validate inputs
    const trimmedName = displayName.trim();
    const trimmedHandle = handle.trim().replace(/^@/, ""); // Remove leading @

    if (!trimmedName) {
      setNameError("Display name is required");
      return;
    }

    if (!trimmedHandle) {
      setHandleError("Handle is required");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedHandle)) {
      setHandleError("Handle can only contain letters, numbers, and underscores");
      return;
    }

    if (trimmedHandle.length < 3) {
      setHandleError("Handle must be at least 3 characters");
      return;
    }

    // Check session (cookie auth) instead of SecureStore token
    try {
      const sessionResult = await getSessionCached();
      if (!sessionResult?.user?.id) {
        console.log("[Onboarding] No valid session, redirecting to login");
        router.replace("/login");
        return;
      }
    } catch (sessionErr) {
      console.log("[Onboarding] Session check failed, redirecting to login");
      router.replace("/login");
      return;
    }

    setIsLoading(true);

    try {
      // Save profile with name, handle, and optionally avatarUrl
      const profileData: { name: string; handle: string; avatarUrl?: string } = {
        name: trimmedName,
        handle: trimmedHandle,
      };

      if (avatarUrl) {
        profileData.avatarUrl = avatarUrl;
      }

      console.log("[Onboarding] Saving profile...");
      const response = await api.put<{ success?: boolean; profile?: any }>("/api/profile", profileData);
      console.log("[Onboarding] Profile saved successfully");

      // Update React Query cache
      queryClient.setQueryData(["profile"], (old: any) => ({
        ...old,
        profile: {
          ...old?.profile,
          ...response.profile,
          name: trimmedName,
          handle: trimmedHandle,
          avatarUrl: avatarUrl || old?.profile?.avatarUrl,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ["profile"] });

      // Advance to Slide 4
      if (isMountedRef.current) {
        setCurrentSlide(4);
      }
    } catch (error: any) {
      console.error("[Onboarding] Profile save failed:", error?.message || error);
      
      // Check for specific errors
      if (error?.message?.toLowerCase().includes("handle") && error?.message?.toLowerCase().includes("taken")) {
        setHandleError("This handle is already taken");
      } else {
        setErrorBanner("Couldn't save profile. Please try again.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  // ============ SLIDE 4: FINISH ============

  const handleFinishOnboarding = async () => {
    console.log("[Onboarding] Finishing...");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Mark onboarding complete
    await AsyncStorage.setItem("onboarding_completed", "true");

    // Notify backend (fire and forget)
    api.post("/api/onboarding/complete", {}).catch(() => {});

    // Navigate to home (calendar) - use replace to prevent back nav
    router.replace("/home");
  };

  // ============ RENDER SLIDES ============

  const renderSlide1 = () => (
    <OnboardingLayout theme={theme}>
      <View style={styles.slideContent}>
        <Animated.View entering={FadeInUp.delay(100).springify()} style={styles.centeredContent}>
          <View style={[styles.iconContainer, { backgroundColor: `${theme.accent}20` }]}>
            <CalendarIcon size={48} color={theme.accent} />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            Your Social Calendar
          </Text>

          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            See what friends are up to.{"\n"}Share your plans.{"\n"}No more group texts.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.buttonGroup}>
          <PrimaryButton
            title="Continue"
            onPress={() => setCurrentSlide(2)}
            theme={theme}
          />
          <SecondaryButton
            title="Log In"
            onPress={() => router.replace("/login")}
            theme={theme}
          />
        </Animated.View>
      </View>
    </OnboardingLayout>
  );

  const renderSlide2 = () => (
    <OnboardingLayout theme={theme}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInUp.springify()} style={styles.formHeader}>
            <Text style={[styles.title, { color: theme.text }]}>
              Create Account
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              So friends can find and connect with you
            </Text>
          </Animated.View>

          {errorBanner && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorBanner}</Text>
            </View>
          )}

          {/* Apple Sign In */}
          {Platform.OS === "ios" && isAppleSignInReady && AppleAuthentication && (
            <Animated.View entering={FadeInUp.delay(100).springify()}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={
                  theme === darkTheme
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={16}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            </Animated.View>
          )}

          {Platform.OS === "ios" && isAppleSignInReady && (
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: theme.surfaceBorder }]} />
              <Text style={[styles.dividerText, { color: theme.textTertiary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.surfaceBorder }]} />
            </View>
          )}

          <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.inputGroup}>
            <StyledInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              theme={theme}
            />
            <StyledInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              showPassword={showPassword}
              onTogglePassword={() => setShowPassword(!showPassword)}
              theme={theme}
            />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(300).springify()}>
            <Text style={[styles.termsText, { color: theme.textTertiary }]}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </Text>

            <AuthButton
              title="Continue with Email"
              onPress={handleEmailAuth}
              loading={isLoading}
              theme={theme}
            />
          </Animated.View>

          <SecondaryButton
            title="Already have an account? Log In"
            onPress={() => router.replace("/login")}
            theme={theme}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingLayout>
  );

  const renderSlide3 = () => (
    <OnboardingLayout theme={theme}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex1}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInUp.springify()} style={styles.formHeader}>
            <Text style={[styles.title, { color: theme.text }]}>
              Set Up Your Profile
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Help friends find and recognize you
            </Text>
          </Animated.View>

          {errorBanner && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errorBanner}</Text>
            </View>
          )}

          {/* Photo picker (optional) */}
          <Animated.View entering={FadeInUp.delay(100).springify()} style={styles.photoSection}>
            <Pressable onPress={handlePickPhoto} disabled={uploadBusy}>
              <View style={[styles.photoPlaceholder, { borderColor: theme.accent }]}>
                {avatarLocalUri ? (
                  <Image source={{ uri: avatarLocalUri }} style={styles.photoImage} />
                ) : (
                  <Camera size={32} color={theme.accent} />
                )}
                {uploadBusy && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </View>
            </Pressable>
            <Pressable onPress={handlePickPhoto} disabled={uploadBusy}>
              <Text style={[styles.addPhotoText, { color: theme.accent }]}>
                {avatarLocalUri ? "Change Photo" : "Add Photo"} (optional)
              </Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.inputGroup}>
            <StyledInput
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                setNameError(null);
              }}
              placeholder="Display Name"
              autoCapitalize="words"
              error={nameError || undefined}
              theme={theme}
            />
            <View>
              <View style={styles.handleInputWrapper}>
                <Text style={[styles.handlePrefix, { color: theme.textTertiary }]}>@</Text>
                <TextInput
                  value={handle}
                  onChangeText={(text) => {
                    setHandle(text.replace(/^@/, ""));
                    setHandleError(null);
                  }}
                  placeholder="handle"
                  placeholderTextColor={theme.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[
                    styles.handleInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.inputBg,
                      borderColor: handleError ? "#E85D4C" : theme.inputBorder,
                    },
                  ]}
                />
              </View>
              {handleError && <Text style={styles.errorText}>{handleError}</Text>}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.buttonGroup}>
            <PrimaryButton
              title="Continue"
              onPress={handleSlide3Continue}
              loading={isLoading}
              theme={theme}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </OnboardingLayout>
  );

  const renderSlide4 = () => (
    <OnboardingLayout theme={theme}>
      <View style={styles.slideContent}>
        <Animated.View entering={FadeInUp.springify()} style={styles.centeredContent}>
          <View style={[styles.iconContainer, { backgroundColor: `${theme.accent}20` }]}>
            <Sparkles size={36} color={theme.accent} />
          </View>

          <View style={[styles.quoteCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.quoteText, { color: theme.text }]}>
              "The quality of your life is measured by the quality of your relationships."
            </Text>
            <Text style={[styles.quoteAttribution, { color: theme.textSecondary }]}>
              — Jürgen Matthesius
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.buttonGroup}>
          <PrimaryButton
            title="Continue"
            onPress={handleFinishOnboarding}
            theme={theme}
          />
        </Animated.View>
      </View>
    </OnboardingLayout>
  );

  // ============ MAIN RENDER ============

  if (!fontsLoaded) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const renderCurrentSlide = () => {
    switch (currentSlide) {
      case 1:
        return renderSlide1();
      case 2:
        return renderSlide2();
      case 3:
        return renderSlide3();
      case 4:
        return renderSlide4();
      default:
        return renderSlide1();
    }
  };

  return (
    <Animated.View
      key={currentSlide}
      entering={SlideInRight.duration(250)}
      exiting={SlideOutLeft.duration(200)}
      style={styles.flex1}
    >
      {renderCurrentSlide()}
    </Animated.View>
  );
}

// ============ STYLES ============
const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  layoutContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  slideContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  centeredContent: {
    alignItems: "center",
    marginBottom: 48,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontFamily: "Sora_700Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    fontFamily: "Sora_400Regular",
    textAlign: "center",
    lineHeight: 26,
  },
  formHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  buttonGroup: {
    gap: 8,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#E85D4C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 17,
    fontFamily: "Sora_600SemiBold",
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontFamily: "Sora_400Regular",
  },
  authButton: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  authButtonText: {
    fontSize: 16,
    fontFamily: "Sora_600SemiBold",
  },
  inputContainer: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Sora_400Regular",
    paddingVertical: 18,
  },
  eyeButton: {
    padding: 8,
  },
  inputGroup: {
    gap: 16,
    marginBottom: 24,
  },
  errorText: {
    color: "#E85D4C",
    fontSize: 13,
    fontFamily: "Sora_400Regular",
    marginTop: 4,
    marginLeft: 4,
  },
  errorBanner: {
    backgroundColor: "rgba(232,93,76,0.15)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: "#E85D4C",
    fontSize: 14,
    fontFamily: "Sora_400Regular",
    textAlign: "center",
  },
  termsText: {
    fontSize: 12,
    fontFamily: "Sora_400Regular",
    textAlign: "center",
    marginBottom: 20,
  },
  appleButton: {
    width: "100%",
    height: 56,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Sora_400Regular",
    marginHorizontal: 16,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoText: {
    fontSize: 14,
    fontFamily: "Sora_600SemiBold",
  },
  handleInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  handlePrefix: {
    fontSize: 16,
    fontFamily: "Sora_400Regular",
    marginRight: 4,
  },
  handleInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    fontSize: 16,
    fontFamily: "Sora_400Regular",
  },
  quoteCard: {
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    marginTop: 24,
  },
  quoteText: {
    fontSize: 18,
    fontFamily: "Sora_400Regular",
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 16,
  },
  quoteAttribution: {
    fontSize: 14,
    fontFamily: "Sora_600SemiBold",
    textAlign: "center",
  },
});
