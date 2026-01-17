import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { phoneNumberClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Import centralized backend URL configuration
import { BACKEND_URL } from "./config";

// Web fallback storage using localStorage
const webStorage = {
  setItem: (key: string, value: string) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  },
  getItem: (key: string): string | null => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
    return null;
  },
};

// Use SecureStore on native, localStorage on web
const storage = Platform.OS === "web" ? webStorage : SecureStore;

export const authClient = createAuthClient({
  baseURL: BACKEND_URL,
  plugins: [
    expoClient({
      scheme: "vibecode",
      storagePrefix: process.env.EXPO_PUBLIC_VIBECODE_PROJECT_ID as string,
      storage,
    }),
    phoneNumberClient(),
  ],
  fetchOptions: {
    credentials: "include",
  },
});
