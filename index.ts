import "react-native-get-random-values";
import "react-native-reanimated";
import { LogBox } from "react-native";
import "./global.css";
import "expo-router/entry";
import { installDevToastFilter } from "./src/lib/devToastFilter";

LogBox.ignoreLogs(["Expo AV has been deprecated", "Disconnected from Metro"]);

// [P0_DEV_TOAST_FILTER] Suppress harmless SDK warnings from in-app LogBox banners.
// Console output is preserved — only the yellow banner UI is filtered.
installDevToastFilter();
