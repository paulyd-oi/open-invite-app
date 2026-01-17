import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import Animated, {
  FadeIn,
  FadeInUp,
  FadeInDown,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  Easing,
  interpolate,
  cancelAnimation,
} from "react-native-reanimated";
import {
  Calendar as CalendarIcon,
  Mail,
  ArrowRight,
  ChevronLeft,
  User,
  Camera,
  ImagePlus,
  Users,
  Check,
  Eye,
  EyeOff,
  MessageCircle,
  Sparkles,
  Lock,
} from "lucide-react-native";
import { useFonts } from "expo-font";
import { Sora_400Regular, Sora_600SemiBold, Sora_700Bold } from "@expo-google-fonts/sora";

import { useTheme } from "@/lib/ThemeContext";
import { authClient } from "@/lib/authClient";
import { api } from "@/lib/api";
import { BACKEND_URL } from "@/lib/config";
import { updateProfileAndSync } from "@/lib/profileSync";
import { toast } from "@/components/Toast";
import { isAppleSignInAvailable, isAppleAuthCancellation } from "@/lib/appleSignIn";

// Apple Authentication - dynamically loaded (requires native build with usesAppleSignIn: true)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AppleAuthentication: any = null;
try {
  AppleAuthentication = require("expo-apple-authentication");
} catch {
  console.log("[Apple Auth] expo-apple-authentication not available - requires native build");
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Backend URL
const RENDER_BACKEND_URL = "https://open-invite-api.onrender.com";
const vibecodeSandboxUrl = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL;
const rawBackendUrl =
  vibecodeSandboxUrl && vibecodeSandboxUrl.length > 0
    ? vibecodeSandboxUrl
    : RENDER_BACKEND_URL;
const backendUrl = rawBackendUrl.replace(/\/+$/, "");

// ============ ONBOARDING STATE MACHINE ============
type OnboardingStep =
  | "welcome"           // Screen 1
  | "whyOpenInvite"     // Screen 2
  | "createAccount"     // Screen 3
  | "verifyEmail"       // Screen 4
  | "profileName"       // Screen 5
  | "profilePhoto"      // Screen 6
  | "mission";          // Screen 7

type AuthProvider = "email" | "apple";

// Theme colors
const ACCENT_COLOR = "#E85D4C";
const ACCENT_LIGHT = "#FF8A7A";
const BACKGROUND_DARK = "#0A0A0F";
const SURFACE_COLOR = "rgba(255,255,255,0.06)";
const SURFACE_LIGHT = "rgba(255,255,255,0.10)";
const GLASS_BORDER = "rgba(255,255,255,0.08)";
const GLASS_BG = "rgba(255,255,255,0.04)";

// ============ NOISE/GRAIN OVERLAY ============
const NoiseOverlay = () => (
  <View
    style={{
      ...StyleSheet.absoluteFillObject,
      opacity: 0.08,
      backgroundColor: "transparent",
    }}
    pointerEvents="none"
  >
    {/* SVG noise pattern would go here - using subtle opacity overlay for now */}
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.02)",
      }}
    />
  </View>
);

// ============ AURORA GLOW COMPONENT ============
const AuroraGlow = ({ color = ACCENT_COLOR }: { color?: string }) => {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
};

// ============ SHARED ONBOARDING LAYOUT ============
const OnboardingLayout = ({
  children,
  showBackButton = false,
  showProgress = false,
  currentStep = 0,
  totalSteps = 7,
  onBack,
}: {
  children: React.ReactNode;
  showBackButton?: boolean;
  showProgress?: boolean;
  currentStep?: number;
  totalSteps?: number;
  onBack?: () => void;
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: BACKGROUND_DARK }}>
      {/* Gradient background */}
      <LinearGradient
        colors={["#1a1520", "#12101a", "#0A0A0F", "#0A0A0F"]}
        locations={[0, 0.3, 0.6, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Secondary warm accent gradient */}
      <LinearGradient
        colors={["rgba(232,93,76,0.08)", "transparent"]}
        locations={[0, 0.5]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: SCREEN_HEIGHT * 0.5,
        }}
      />

      {/* Noise overlay */}
      <NoiseOverlay />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header with back button and progress */}
        {(showBackButton || showProgress) && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
          >
            <View style={{ width: 40 }}>
              {showBackButton && onBack && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onBack();
                  }}
                  hitSlop={12}
                >
                  <ChevronLeft size={24} color="rgba(255,255,255,0.6)" />
                </Pressable>
              )}
            </View>

            {showProgress && (
              <View className="flex-row gap-2 items-center justify-center">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      height: 4,
                      width: i === currentStep ? 24 : 8,
                      borderRadius: 2,
                      backgroundColor:
                        i === currentStep
                          ? ACCENT_COLOR
                          : i < currentStep
                            ? ACCENT_LIGHT
                            : "rgba(255,255,255,0.15)",
                    }}
                  />
                ))}
              </View>
            )}

            <View style={{ width: 40 }} />
          </View>
        )}

        {children}
      </SafeAreaView>
    </View>
  );
};

// ============ PRIMARY BUTTON ============
const PrimaryButton = ({
  onPress,
  title,
  disabled = false,
  loading = false,
  variant = "primary",
}: {
  onPress: () => void;
  title: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "outline";
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

  const bgColor =
    variant === "primary"
      ? ACCENT_COLOR
      : variant === "secondary"
        ? SURFACE_LIGHT
        : "transparent";

  const borderColor = variant === "outline" ? "rgba(255,255,255,0.25)" : "transparent";

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => {
          if (!disabled && !loading) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onPress();
          }
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={{
          backgroundColor: disabled ? "rgba(255,255,255,0.08)" : bgColor,
          borderWidth: variant === "outline" ? 1.5 : 0,
          borderColor,
          borderRadius: 16,
          paddingVertical: 18,
          paddingHorizontal: 32,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          shadowColor: variant === "primary" ? ACCENT_COLOR : "transparent",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: variant === "primary" && !disabled ? 0.35 : 0,
          shadowRadius: 20,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Text
              style={{
                color: disabled ? "rgba(255,255,255,0.35)" : "#fff",
                fontSize: 17,
                fontFamily: "Sora_600SemiBold",
                letterSpacing: 0.3,
              }}
            >
              {title}
            </Text>
            {variant === "primary" && !disabled && (
              <ArrowRight size={20} color="#fff" strokeWidth={2.5} />
            )}
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
  underline = false,
}: {
  onPress: () => void;
  title: string;
  underline?: boolean;
}) => (
  <Pressable
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }}
    className="py-3 items-center"
  >
    <Text
      style={{
        color: "rgba(255,255,255,0.6)",
        fontSize: 15,
        fontFamily: "Sora_400Regular",
        textDecorationLine: underline ? "underline" : "none",
      }}
    >
      {title}
    </Text>
  </Pressable>
);

// ============ GLASS CARD ============
const GlassCard = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) => (
  <View
    style={[
      {
        backgroundColor: GLASS_BG,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: GLASS_BORDER,
        // Subtle shadow for depth
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      style,
    ]}
  >
    {children}
  </View>
);

// ============ VALUE PROP CARD ============
const ValueCard = ({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) => (
  <Animated.View entering={FadeInUp.delay(delay).springify()}>
    <GlassCard style={{ marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: "rgba(232,93,76,0.15)",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 16,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: "#fff",
            fontSize: 17,
            fontFamily: "Sora_600SemiBold",
            marginBottom: 4,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 14,
            fontFamily: "Sora_400Regular",
            lineHeight: 20,
          }}
        >
          {description}
        </Text>
      </View>
    </GlassCard>
  </Animated.View>
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
}) => (
  <View
    style={{
      backgroundColor: GLASS_BG,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: GLASS_BORDER,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
    }}
  >
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.3)"
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      secureTextEntry={secureTextEntry && !showPassword}
      autoFocus={autoFocus}
      style={{
        flex: 1,
        color: "#fff",
        fontSize: 16,
        fontFamily: "Sora_400Regular",
        paddingVertical: 18,
      }}
    />
    {onTogglePassword && (
      <Pressable onPress={onTogglePassword} className="p-2">
        {showPassword ? (
          <EyeOff size={20} color="rgba(255,255,255,0.5)" />
        ) : (
          <Eye size={20} color="rgba(255,255,255,0.5)" />
        )}
      </Pressable>
    )}
  </View>
);

// ============ ICON WITH GLOW ============
const IconWithGlow = ({
  icon,
  size = 100,
  glowColor = ACCENT_COLOR,
}: {
  icon: React.ReactNode;
  size?: number;
  glowColor?: string;
}) => (
  <View style={{ alignItems: "center", justifyContent: "center" }}>
    <AuroraGlow color={glowColor} />
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: "rgba(232,93,76,0.15)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(232,93,76,0.2)",
      }}
    >
      {icon}
    </View>
  </View>
);

// ============ DIVIDER WITH TEXT ============
const DividerWithText = ({ text }: { text: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 20 }}>
    <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
    <Text
      style={{
        color: "rgba(255,255,255,0.4)",
        fontSize: 13,
        fontFamily: "Sora_400Regular",
        marginHorizontal: 16,
      }}
    >
      {text}
    </Text>
    <View style={{ flex: 1, height: 1, backgroundColor: "rgba(255,255,255,0.1)" }} />
  </View>
);

// ============ MAIN COMPONENT ============
export default function WelcomeOnboardingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { themeColor } = useTheme();

  const [fontsLoaded] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
  });

  // State machine
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  // Auth state
  const [authProvider, setAuthProvider] = useState<AuthProvider>("email");
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationDeferred, setVerificationDeferred] = useState(false);

  // Apple Sign-In availability (checked on mount)
  const [isAppleSignInReady, setIsAppleSignInReady] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", ""]);
  const [displayName, setDisplayName] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // Code input refs
  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  // Storage key for progress persistence
  const STORAGE_KEY = "onboarding_progress_v2";

  // Step order for navigation
  const STEP_ORDER: OnboardingStep[] = [
    "welcome",
    "whyOpenInvite",
    "createAccount",
    "verifyEmail",
    "profileName",
    "profilePhoto",
    "mission",
  ];

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  // Apple Sign In is not available in this build
  // To enable: install expo-apple-authentication and configure in app.json
  // For now, we'll show email signup only

  // ============ APPLE SIGN-IN AVAILABILITY CHECK ============

  useEffect(() => {
    // Check Apple Sign-In availability on mount (iOS only)
    if (Platform.OS === "ios") {
      isAppleSignInAvailable().then((available) => {
        setIsAppleSignInReady(available);
        if (__DEV__) {
          console.log("[Apple Auth] Availability check:", available);
        }
      });
    }
  }, []);

  // ============ PERSISTENCE ============

  useEffect(() => {
    const restoreProgress = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (data.currentStep && STEP_ORDER.includes(data.currentStep)) {
            setCurrentStep(data.currentStep);
          }
          if (data.email) setEmail(data.email);
          if (data.password) setPassword(data.password);
          if (data.displayName) setDisplayName(data.displayName);
          if (data.profileImage) setProfileImage(data.profileImage);
          if (data.authProvider) setAuthProvider(data.authProvider);
          if (data.emailVerified) setEmailVerified(data.emailVerified);
          if (data.verificationDeferred) setVerificationDeferred(data.verificationDeferred);
        }
      } catch (error) {
        console.log("Failed to restore onboarding progress");
      } finally {
        setIsRestoring(false);
      }
    };
    restoreProgress();
  }, []);

  const saveProgress = useCallback(async () => {
    if (isRestoring) return;
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          currentStep,
          email,
          password,
          displayName,
          profileImage,
          authProvider,
          emailVerified,
          verificationDeferred,
        })
      );
    } catch (error) {
      console.log("Failed to save onboarding progress");
    }
  }, [currentStep, email, password, displayName, profileImage, authProvider, emailVerified, verificationDeferred, isRestoring]);

  useEffect(() => {
    saveProgress();
  }, [saveProgress]);

  const clearProgress = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.log("Failed to clear onboarding progress");
    }
  };

  // ============ NAVIGATION ============

  const goToStep = (step: OnboardingStep) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(step);
  };

  const goToNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      goToStep(STEP_ORDER[nextIndex]);
    }
  };

  const goToPrev = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(STEP_ORDER[prevIndex]);
    }
  };

  const finishOnboarding = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Save verification deferred status if applicable
    if (verificationDeferred) {
      await AsyncStorage.setItem("verification_deferred", "true");
    }

    // Mark onboarding as completed
    await AsyncStorage.setItem("onboarding_completed", "true");

    // Notify backend (fire and forget)
    api.post("/api/onboarding/complete", {}).catch(() => {});

    await clearProgress();
    // Navigate to main feed
    router.replace("/");
  };

  // ============ APPLE SIGN IN ============
  // Uses expo-apple-authentication to get identity token
  // Then verifies with backend and creates/links account
  const handleAppleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      setIsLoading(true);

      // Request Apple Sign In (availability already checked before showing button)
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // SECURITY: Never log the actual token
      console.log("[Apple Auth] Credential received, sending to backend...");

      if (!credential.identityToken) {
        throw new Error("No identity token received from Apple");
      }

      // Send to backend for verification
      const response = await fetch(`${backendUrl}/api/auth/apple`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityToken: credential.identityToken,
          user: {
            email: credential.email,
            name: credential.fullName ? {
              firstName: credential.fullName.givenName,
              lastName: credential.fullName.familyName,
            } : null,
          },
          // Note: authorizationCode not needed for native iOS flow
        }),
      });

      const data = await response.json();

      if (!response.ok || (!data.success && !data.ok)) {
        throw new Error(data.error || "Authentication failed");
      }

      console.log("[Apple Auth] Backend verified successfully");

      // Store session token securely (not in AsyncStorage!)
      const token = data.token || data.session?.token;
      if (token) {
        try {
          await SecureStore.setItemAsync("session_token", token);
          if (data.session?.expiresAt) {
            await SecureStore.setItemAsync("session_expires", data.session.expiresAt);
          }
        } catch (storeError) {
          console.error("[Apple Auth] SecureStore write failed:", storeError);
          // Continue anyway - session will work for this app session
        }
      }

      // Update state
      setAuthProvider("apple");
      setEmailVerified(true); // Apple users are pre-verified
      if (data.user?.email && !data.user.email.includes("@apple.private")) {
        setEmail(data.user.email);
      }
      if (data.user?.name) {
        setDisplayName(data.user.name);
      }

      // Skip email verification for Apple users and go to profile name
      goToStep("profileName");

    } catch (error: unknown) {
      // Handle user cancellation silently
      if (isAppleAuthCancellation(error)) {
        console.log("[Apple Auth] User cancelled sign in");
        return;
      }

      // Log error for debugging (but never log tokens)
      console.error("[Apple Auth] Error:", error instanceof Error ? error.message : "Unknown error");

      // Show user-friendly error message
      let errorMessage = "Unable to sign in with Apple. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("network") || error.message.includes("fetch")) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else if (error.message.includes("verification failed")) {
          errorMessage = "Authentication failed. Please try again.";
        } else if (error.message.includes("already linked")) {
          errorMessage = error.message; // Show the specific linking error
        }
      }

      toast.error("Sign In Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // ============ EMAIL AUTH ============

  const handleCreateAccount = async () => {
    if (!email || !password) {
      toast.warning("Missing Info", "Please enter your email and password");
      return;
    }

    setIsLoading(true);
    setAuthProvider("email");

    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name: displayName || "User",
      });

      if (result.error) {
        if (result.error.message?.toLowerCase().includes("exist")) {
          const signInResult = await authClient.signIn.email({ email, password });
          if (signInResult.error) {
            if (
              signInResult.error.message?.toLowerCase().includes("verif") ||
              signInResult.error.code === "EMAIL_NOT_VERIFIED"
            ) {
              await sendVerificationCode();
              goToNext();
            } else {
              toast.error("Sign In Failed", signInResult.error.message || "Invalid credentials");
            }
          } else {
            const user = signInResult.data?.user;
            if (user && !user.emailVerified) {
              await sendVerificationCode();
            }
            goToNext();
          }
        } else {
          toast.error("Sign Up Failed", result.error.message || "Failed to create account");
        }
      } else {
        await sendVerificationCode();
        goToNext();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unable to connect";
      toast.error("Connection Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const sendVerificationCode = async () => {
    try {
      await fetch(`${backendUrl}/api/email-verification/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase(), name: displayName || "User" }),
      });
    } catch (error) {
      console.log("Error sending verification code:", error);
    }
  };

  // ============ VERIFICATION CODE ============

  const handleCodeChange = (index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, "");

    if (digit.length <= 1) {
      const newCode = [...verificationCode];
      newCode[index] = digit;
      setVerificationCode(newCode);

      if (digit && index < 4) {
        codeInputRefs.current[index + 1]?.focus();
      }
    } else if (digit.length === 5) {
      const digits = digit.split("");
      setVerificationCode(digits);
      codeInputRefs.current[4]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyEmail = async () => {
    const code = verificationCode.join("");
    if (code.length !== 5) {
      toast.warning("Invalid Code", "Please enter the 5-digit code");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/email-verification/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase(), code }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await authClient.signIn.email({ email, password });
        setEmailVerified(true);
        goToNext();
      } else {
        toast.error("Verification Failed", data.error || "Invalid verification code");
      }
    } catch (error) {
      toast.error("Verification Failed", "Failed to verify code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await sendVerificationCode();
    toast.success("Code Sent", "A new verification code has been sent to your email.");
  };

  const handleSkipVerification = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVerificationDeferred(true);
    await AsyncStorage.setItem("verification_deferred", "true");
    goToNext();
  };

  // ============ PROFILE HANDLERS ============

  const handleSaveName = async () => {
    if (displayName.trim()) {
      try {
        console.log("[Onboarding] Saving display name:", displayName.trim());
        await api.post("/api/profile", { name: displayName.trim() });
        console.log("[Onboarding] Display name saved successfully");

        // Immediately sync session and profile cache
        await updateProfileAndSync(queryClient);
      } catch (error) {
        console.log("[Onboarding] Failed to save name:", error);
      }
    }
    goToNext();
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      toast.warning("Permission Required", "Please allow access to your photos in Settings.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      toast.warning("Permission Required", "Please allow access to your camera in Settings.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const handleSavePhoto = async () => {
    if (profileImage) {
      try {
        console.log("[Onboarding] Starting photo upload...");

        // Validate file size before upload
        const fileInfo = await require("expo-file-system").getInfoAsync(profileImage);
        const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
        if (fileInfo.size > MAX_UPLOAD_BYTES) {
          toast.error("Image Too Large", "Image is too large (max 5MB). Please choose a smaller photo.");
          return;
        }

        const formData = new FormData();
        formData.append("image", {
          uri: profileImage,
          type: "image/jpeg",
          name: "profile.jpg",
        } as unknown as Blob);

        console.log("[Onboarding] Uploading image to backend...");
        const uploadResponse = await fetch(`${BACKEND_URL}/api/upload/image`, {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}`);
        }

        const uploadData = await uploadResponse.json();
        console.log("[Onboarding] Image uploaded successfully:", uploadData.url);

        // Save the avatar URL to profile
        console.log("[Onboarding] Saving avatar URL to profile...");
        await api.post("/api/profile", { avatarUrl: uploadData.url });
        console.log("[Onboarding] Avatar URL saved to profile");

        // Immediately sync session and profile cache
        await updateProfileAndSync(queryClient);
      } catch (error) {
        console.log("[Onboarding] Failed to upload photo:", error);
        toast.error("Upload Failed", "Could not upload photo. Please try again.");
      }
    }
    goToNext();
  };

  // ============ RENDER SCREENS ============

  const renderScreen = () => {
    switch (currentStep) {
      // ===== SCREEN 1: WELCOME =====
      case "welcome":
        return (
          <OnboardingLayout>
            <View className="flex-1 justify-center px-8">
              <Animated.View entering={FadeInUp.delay(100).springify()} className="items-center mb-12">
                <IconWithGlow icon={<CalendarIcon size={48} color={ACCENT_COLOR} />} />

                <Animated.Text
                  entering={FadeInUp.delay(200).springify()}
                  style={{
                    color: "#fff",
                    fontSize: 36,
                    fontFamily: "Sora_700Bold",
                    textAlign: "center",
                    marginTop: 32,
                    marginBottom: 16,
                  }}
                >
                  Your Social Calendar
                </Animated.Text>

                <Animated.Text
                  entering={FadeInUp.delay(300).springify()}
                  style={{
                    color: "rgba(255,255,255,0.65)",
                    fontSize: 18,
                    fontFamily: "Sora_400Regular",
                    textAlign: "center",
                    lineHeight: 28,
                    maxWidth: 300,
                  }}
                >
                  See what friends are up to.{"\n"}Share your plans.{"\n"}No more group texts.
                </Animated.Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(400).springify()}>
                <PrimaryButton title="Get Started" onPress={goToNext} />
                <SecondaryButton title="Log In" onPress={() => router.push("/login")} underline />
              </Animated.View>
            </View>
          </OnboardingLayout>
        );

      // ===== SCREEN 2: WHY OPEN INVITE =====
      case "whyOpenInvite":
        return (
          <OnboardingLayout
            showBackButton
            showProgress
            currentStep={currentStepIndex}
            onBack={goToPrev}
          >
            <View className="flex-1 justify-center px-6">
              <Animated.Text
                entering={FadeInUp.springify()}
                style={{
                  color: "#fff",
                  fontSize: 28,
                  fontFamily: "Sora_700Bold",
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                Why Open Invite?
              </Animated.Text>

              <Animated.Text
                entering={FadeInUp.delay(50).springify()}
                style={{
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 16,
                  fontFamily: "Sora_400Regular",
                  textAlign: "center",
                  marginBottom: 32,
                }}
              >
                Making plans shouldn't be hard. Here's how we help.
              </Animated.Text>

              <ValueCard
                icon={<CalendarIcon size={24} color={ACCENT_COLOR} />}
                title="See Who's Free"
                description="Friends' availability at a glance"
                delay={100}
              />

              <ValueCard
                icon={<Users size={24} color={ACCENT_COLOR} />}
                title="Share Plans Easily"
                description="Create open events friends can join"
                delay={200}
              />

              <ValueCard
                icon={<MessageCircle size={24} color={ACCENT_COLOR} />}
                title="No More Group Texts"
                description="One place for plans, updates, and RSVPs"
                delay={300}
              />

              <Animated.View entering={FadeInUp.delay(400).springify()} className="mt-8">
                <PrimaryButton title="Continue" onPress={goToNext} />
                <SecondaryButton title="Skip" onPress={() => router.push("/login")} />
              </Animated.View>
            </View>
          </OnboardingLayout>
        );

      // ===== SCREEN 3: CREATE ACCOUNT =====
      case "createAccount":
        return (
          <OnboardingLayout
            showBackButton
            showProgress
            currentStep={currentStepIndex}
            onBack={goToPrev}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1"
            >
              <ScrollView
                contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <Animated.View entering={FadeInUp.springify()} className="mb-6">
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 28,
                      fontFamily: "Sora_700Bold",
                      textAlign: "center",
                      marginBottom: 8,
                    }}
                  >
                    Create Account
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 16,
                      fontFamily: "Sora_400Regular",
                      textAlign: "center",
                    }}
                  >
                    So friends can find and connect with you
                  </Text>
                </Animated.View>

                {/* Apple Sign In Button - Only show if available on device */}
                {Platform.OS === "ios" && isAppleSignInReady && (
                  <Animated.View entering={FadeInUp.delay(100).springify()} className="mb-2">
                    <Pressable
                      onPress={handleAppleSignIn}
                      style={{
                        backgroundColor: "#fff",
                        borderRadius: 16,
                        height: 56,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}></Text>
                      <Text
                        style={{
                          color: "#000",
                          fontSize: 17,
                          fontFamily: "Sora_600SemiBold",
                        }}
                      >
                        Continue with Apple
                      </Text>
                    </Pressable>
                  </Animated.View>
                )}

                {Platform.OS === "ios" && (
                  <Animated.View entering={FadeInUp.delay(150).springify()}>
                    <DividerWithText text="or" />
                  </Animated.View>
                )}

                <Animated.View entering={FadeInUp.delay(200).springify()} className="gap-4 mb-4">
                  <StyledInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <StyledInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    secureTextEntry
                    showPassword={showPassword}
                    onTogglePassword={() => setShowPassword(!showPassword)}
                  />
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(300).springify()}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.35)",
                      fontSize: 12,
                      fontFamily: "Sora_400Regular",
                      textAlign: "center",
                      marginBottom: 20,
                    }}
                  >
                    By continuing, you agree to our Terms of Service and Privacy Policy.
                  </Text>

                  <PrimaryButton
                    title="Create Account"
                    onPress={handleCreateAccount}
                    loading={isLoading}
                    disabled={!email || !password}
                  />
                </Animated.View>
              </ScrollView>
            </KeyboardAvoidingView>
          </OnboardingLayout>
        );

      // ===== SCREEN 4: VERIFY EMAIL =====
      case "verifyEmail":
        // Skip this screen for Apple users
        if (authProvider === "apple") {
          goToNext();
          return null;
        }

        return (
          <OnboardingLayout
            showBackButton
            showProgress
            currentStep={currentStepIndex}
            onBack={goToPrev}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1"
            >
              <ScrollView
                contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <Animated.View entering={FadeInUp.springify()} className="items-center mb-8">
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 24,
                      backgroundColor: "rgba(232,93,76,0.15)",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 24,
                    }}
                  >
                    <Mail size={36} color={ACCENT_COLOR} />
                  </View>

                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 28,
                      fontFamily: "Sora_700Bold",
                      textAlign: "center",
                      marginBottom: 8,
                    }}
                  >
                    Verify your email
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 16,
                      fontFamily: "Sora_400Regular",
                      textAlign: "center",
                    }}
                  >
                    We sent a 5-digit code to{"\n"}
                    <Text style={{ color: ACCENT_COLOR }}>{email}</Text>
                  </Text>
                </Animated.View>

                <Animated.View
                  entering={FadeInUp.delay(100).springify()}
                  className="flex-row justify-center gap-3 mb-8"
                >
                  {verificationCode.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => {
                        codeInputRefs.current[index] = ref;
                      }}
                      value={digit}
                      onChangeText={(value) => handleCodeChange(index, value)}
                      onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
                      keyboardType="number-pad"
                      maxLength={1}
                      style={{
                        width: 56,
                        height: 64,
                        backgroundColor: GLASS_BG,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: digit ? ACCENT_COLOR : GLASS_BORDER,
                        color: "#fff",
                        fontSize: 28,
                        fontFamily: "Sora_600SemiBold",
                        textAlign: "center",
                      }}
                    />
                  ))}
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(200).springify()}>
                  <PrimaryButton
                    title="Verify"
                    onPress={handleVerifyEmail}
                    loading={isLoading}
                    disabled={verificationCode.join("").length !== 5}
                  />
                  <SecondaryButton title="Resend Code" onPress={handleResendCode} />
                  <Pressable onPress={handleSkipVerification} className="mt-4 items-center">
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: 13,
                        fontFamily: "Sora_400Regular",
                      }}
                    >
                      I'll do this later
                    </Text>
                  </Pressable>
                </Animated.View>
              </ScrollView>
            </KeyboardAvoidingView>
          </OnboardingLayout>
        );

      // ===== SCREEN 5: PROFILE NAME =====
      case "profileName":
        return (
          <OnboardingLayout
            showBackButton
            showProgress
            currentStep={currentStepIndex}
            onBack={goToPrev}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              className="flex-1"
            >
              <ScrollView
                contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <Animated.View entering={FadeInUp.springify()} className="items-center mb-8">
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 24,
                      backgroundColor: "rgba(232,93,76,0.15)",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 24,
                    }}
                  >
                    <User size={36} color={ACCENT_COLOR} />
                  </View>

                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 28,
                      fontFamily: "Sora_700Bold",
                      textAlign: "center",
                      marginBottom: 8,
                    }}
                  >
                    What should friends call you?
                  </Text>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 16,
                      fontFamily: "Sora_400Regular",
                      textAlign: "center",
                    }}
                  >
                    This shows on invites and your profile.
                  </Text>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(100).springify()} className="mb-8">
                  <StyledInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Display Name"
                    autoCapitalize="words"
                    autoFocus
                  />
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(200).springify()}>
                  <PrimaryButton title="Continue" onPress={handleSaveName} />
                  <SecondaryButton title="Skip" onPress={goToNext} />
                </Animated.View>
              </ScrollView>
            </KeyboardAvoidingView>
          </OnboardingLayout>
        );

      // ===== SCREEN 6: PROFILE PHOTO =====
      case "profilePhoto":
        return (
          <OnboardingLayout
            showBackButton
            showProgress
            currentStep={currentStepIndex}
            onBack={goToPrev}
          >
            <View className="flex-1 justify-center px-6">
              <Animated.View entering={FadeInUp.springify()} className="items-center mb-8">
                <Pressable onPress={handlePickPhoto}>
                  <View
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: 70,
                      backgroundColor: profileImage ? "transparent" : "rgba(232,93,76,0.1)",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 24,
                      overflow: "hidden",
                      borderWidth: 2,
                      borderColor: profileImage ? ACCENT_COLOR : "rgba(232,93,76,0.3)",
                      borderStyle: profileImage ? "solid" : "dashed",
                    }}
                  >
                    {profileImage ? (
                      <Image
                        source={{ uri: profileImage }}
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <Camera size={48} color={ACCENT_COLOR} />
                    )}
                  </View>
                </Pressable>

                <Text
                  style={{
                    color: "#fff",
                    fontSize: 28,
                    fontFamily: "Sora_700Bold",
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  Add a photo
                </Text>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 16,
                    fontFamily: "Sora_400Regular",
                    textAlign: "center",
                  }}
                >
                  Help friends recognize you.
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(100).springify()} className="gap-3">
                <Pressable
                  onPress={handlePickPhoto}
                  style={{
                    backgroundColor: GLASS_BG,
                    borderRadius: 16,
                    paddingVertical: 16,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    borderWidth: 1,
                    borderColor: GLASS_BORDER,
                  }}
                >
                  <ImagePlus size={22} color="#fff" />
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 16,
                      fontFamily: "Sora_600SemiBold",
                    }}
                  >
                    Choose Photo
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleTakePhoto}
                  style={{
                    backgroundColor: GLASS_BG,
                    borderRadius: 16,
                    paddingVertical: 16,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    borderWidth: 1,
                    borderColor: GLASS_BORDER,
                  }}
                >
                  <Camera size={22} color="#fff" />
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 16,
                      fontFamily: "Sora_600SemiBold",
                    }}
                  >
                    Take Photo
                  </Text>
                </Pressable>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(200).springify()} className="mt-8">
                {profileImage && (
                  <PrimaryButton title="Continue" onPress={handleSavePhoto} />
                )}
                <SecondaryButton title="Skip for now" onPress={goToNext} />
              </Animated.View>
            </View>
          </OnboardingLayout>
        );

      // ===== SCREEN 7: MISSION =====
      case "mission":
        return (
          <OnboardingLayout>
            <View className="flex-1 justify-center px-8">
              <Animated.View entering={FadeInUp.springify()} className="items-center">
                <IconWithGlow
                  icon={<Sparkles size={36} color={ACCENT_COLOR} />}
                  size={80}
                />

                <Animated.View entering={FadeInUp.delay(200).springify()}>
                  <GlassCard
                    style={{
                      marginTop: 40,
                      marginBottom: 48,
                      paddingVertical: 32,
                      paddingHorizontal: 24,
                    }}
                  >
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.85)",
                        fontSize: 20,
                        fontFamily: "Sora_400Regular",
                        textAlign: "center",
                        fontStyle: "italic",
                        lineHeight: 30,
                        marginBottom: 20,
                      }}
                    >
                      "The quality of your life is determined by the quality of your relationships."
                    </Text>
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: 14,
                        fontFamily: "Sora_600SemiBold",
                        textAlign: "center",
                      }}
                    >
                      — Jürgen Matthesius
                    </Text>
                  </GlassCard>
                </Animated.View>

                <Animated.View entering={FadeInUp.delay(400).springify()}>
                  <PrimaryButton title="Continue" onPress={finishOnboarding} />
                </Animated.View>
              </Animated.View>
            </View>
          </OnboardingLayout>
        );

      default:
        return null;
    }
  };

  // ============ MAIN RENDER ============

  if (!fontsLoaded || isRestoring) {
    return (
      <View style={{ flex: 1, backgroundColor: BACKGROUND_DARK, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={ACCENT_COLOR} />
      </View>
    );
  }

  return (
    <Animated.View
      key={currentStep}
      entering={SlideInRight.duration(250)}
      exiting={SlideOutLeft.duration(200)}
      style={{ flex: 1 }}
    >
      {renderScreen()}
    </Animated.View>
  );
}
