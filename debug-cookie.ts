import * as SecureStore from "expo-secure-store";

async function run() {
  const raw = await SecureStore.getItemAsync("open-invite_cookie");

  console.log("=================================");
  console.log("RAW COOKIE =", raw);

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      console.log("PARSED COOKIE =", parsed);

      const token =
        parsed?.["__Secure-better-auth.session_token"]?.value;

      console.log("EXTRACTED TOKEN =", token);
    } catch (e) {
      console.log("PARSE FAILED", e);
    }
  }

  console.log("=================================");
}

run();
