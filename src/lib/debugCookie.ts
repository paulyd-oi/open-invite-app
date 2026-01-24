import * as SecureStore from "expo-secure-store";

export async function debugDumpBetterAuthCookieOnce() {
  try {
    const key = "open-invite_session_cookie";
    const raw = await SecureStore.getItemAsync(key);
    console.log("[DEBUG COOKIE] key =", key);
    console.log("[DEBUG COOKIE] raw =", raw);

    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const token = parsed?.["__Secure-better-auth.session_token"]?.value;
      console.log("[DEBUG COOKIE] extracted session_token =", token);
    } catch (e) {
      console.log("[DEBUG COOKIE] parse failed", e);
    }
  } catch (e) {
    console.log("[DEBUG COOKIE] read failed", e);
  }
}
