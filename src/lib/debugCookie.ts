import * as SecureStore from "expo-secure-store";
import { devLog, devWarn, devError } from "./devLog";

export async function debugDumpBetterAuthCookieOnce() {
  try {
    // Correct Better Auth SecureStore key (matches authClient logs)
    const key = "open-invite_cookie";

    const raw = await SecureStore.getItemAsync(key);

    devLog("=======================================");
    devLog("[DEBUG COOKIE] key =", key);
    devLog("[DEBUG COOKIE] raw =", raw);

    if (!raw) {
      devLog("[DEBUG COOKIE] No cookie found in SecureStore");
      devLog("=======================================");
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      devLog("[DEBUG COOKIE] parsed =", parsed);

      const token =
        parsed?.["__Secure-better-auth.session_token"]?.value;

      devLog("[DEBUG COOKIE] extracted session_token =", token);
    } catch (e) {
      devLog("[DEBUG COOKIE] parse failed", e);
    }

    devLog("=======================================");
  } catch (e) {
    devLog("[DEBUG COOKIE] read failed", e);
  }
}
