import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { devError } from "@/lib/devLog";

// IMPORTANT:
// If an icon export is missing, importing it will be `undefined`.
// This file is written to NEVER crash even if icons are missing.
import { AlertTriangle, RefreshCw } from "@/ui/icons";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

type IconLike =
  | React.ComponentType<{ size?: number; color?: string; style?: any }>
  | undefined;

function SafeIcon({
  Icon,
  size,
  color,
}: {
  Icon: IconLike;
  size: number;
  color: string;
}) {
  if (!Icon) {
    return (
      <Text style={{ color, fontSize: size * 0.9, fontWeight: "700" }}>!</Text>
    );
  }
  return <Icon size={size} color={color} />;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    devError("ErrorBoundary caught an error:", error, errorInfo);
    
    // DEV-only: Enhanced logging for "Text strings must be rendered" crash
    if (__DEV__ && error?.message?.includes("Text strings must be rendered")) {
      devError("=== TEXT RENDER CRASH DETECTED ===");
      devError("Error message:", error.message);
      devError("Component stack:", errorInfo?.componentStack);
      devError("JS Stack trace:", error.stack);
      devError("=================================");
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const accent = "#FF6B4A";
      const danger = "#EF4444";
      const bg = "#FFF9F5";
      const text = "#111827";
      const subtext = "#6B7280";

      return (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            backgroundColor: bg,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: "rgba(239,68,68,0.12)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <SafeIcon Icon={AlertTriangle as any} size={40} color={danger} />
          </View>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "800",
              color: text,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>

          <Text
            style={{
              fontSize: 15,
              color: subtext,
              textAlign: "center",
              marginBottom: 18,
              lineHeight: 20,
            }}
          >
            We hit a snag. Tap below to get back on track.
          </Text>

          <Pressable
            onPress={this.handleReset}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: accent,
              paddingHorizontal: 18,
              paddingVertical: 12,
              borderRadius: 12,
              shadowColor: accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
            }}
          >
            <SafeIcon Icon={RefreshCw as any} size={18} color="#FFFFFF" />
            <Text
              style={{
                color: "#FFFFFF",
                fontWeight: "700",
                marginLeft: 8,
                fontSize: 15,
              }}
            >
              Try Again
            </Text>
          </Pressable>

          {__DEV__ && this.state.error && (
            <View
              style={{
                marginTop: 18,
                padding: 12,
                backgroundColor: "rgba(17,24,39,0.06)",
                borderRadius: 12,
                width: "100%",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: "#374151",
                  fontFamily: "Menlo",
                }}
              >
                {this.state.error.message}
              </Text>
            </View>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}
