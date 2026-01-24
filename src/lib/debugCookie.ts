import * as SecureStore from "expo-secure-store";

export async function debugDumpBetterAuthCookieOnce() {
  try {
    // Correct Better Auth SecureStore key (matches authClient logs)
    const key = "open-invite_cookie";

    const raw = await SecureStore.getItemAsync(key);

    console.log("=======================================");
    console.log("[DEBUG COOKIE] key =", key);
    console.log("[DEBUG COOKIE] raw =", raw);

    if (!raw) {
      console.log("[DEBUG COOKIE] No cookie found in SecureStore");
      console.log("=======================================");
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      console.log("[DEBUG COOKIE] parsed =", parsed);

      const token =
        parsed?.["__Secure-better-auth.session_token"]?.value;

      console.log("[DEBUG COOKIE] extracted session_token =", token);
    } catch (e) {
      console.log("[DEBUG COOKIE] parse failed", e);
    }

    console.log("=======================================");
  } catch (e) {
    console.log("[DEBUG COOKIE] read failed", e);
  }
}
