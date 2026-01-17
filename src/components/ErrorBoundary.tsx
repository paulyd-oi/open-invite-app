import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { AlertTriangle, RefreshCw } from "lucide-react-native";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console (in production, send to error reporting service)
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View className="flex-1 items-center justify-center px-6 bg-[#FFF9F5]">
          <View className="w-20 h-20 rounded-full bg-red-100 items-center justify-center mb-6">
            <AlertTriangle size={40} color="#EF4444" />
          </View>

          <Text className="text-2xl font-bold text-gray-900 text-center mb-2">
            Oops! Something went wrong
          </Text>

          <Text className="text-base text-gray-500 text-center mb-8">
            We're sorry for the inconvenience. Please try refreshing the app.
          </Text>

          <Pressable
            onPress={this.handleReset}
            className="flex-row items-center bg-[#FF6B4A] px-6 py-3 rounded-xl mb-3"
            style={{
              shadowColor: "#FF6B4A",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
            }}
          >
            <RefreshCw size={20} color="#fff" />
            <Text className="text-white font-semibold ml-2">Try Again</Text>
          </Pressable>

          {__DEV__ && this.state.error && (
            <View className="mt-6 p-4 bg-gray-100 rounded-xl w-full">
              <Text className="text-xs text-gray-600 font-mono">
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
