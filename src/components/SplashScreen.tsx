import React, { useEffect } from "react";
import { View, Dimensions, ImageBackground, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";

const { width, height } = Dimensions.get("window");

interface SplashScreenProps {
  onAnimationComplete: () => void;
}

export function SplashScreen({ onAnimationComplete }: SplashScreenProps) {
  const titleOpacity = useSharedValue(0);
  const titleY = useSharedValue(20);
  const backgroundOpacity = useSharedValue(1);

  useEffect(() => {
    // Fade out and complete
    backgroundOpacity.value = withDelay(
      1800,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) }, () => {
        runOnJS(onAnimationComplete)();
      })
    );
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleY.value }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
        },
        containerStyle,
      ]}
    >
      {/* Background image of group of friends */}
      <ImageBackground
        source={require("../../assets/splash-screen.jpeg")}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {/* Blur overlay */}
        <BlurView
          intensity={40}
          tint="light"
          style={styles.blurOverlay}
        >
          {/* Semi-transparent warm overlay for the Clubhouse feel */}
          <View style={styles.warmOverlay} />

          {/* Content */}
          <View style={styles.content} />
        </BlurView>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  blurOverlay: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  warmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(139, 90, 70, 0.25)",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
