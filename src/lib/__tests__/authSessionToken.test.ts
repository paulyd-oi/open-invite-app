import { formatReactNativeCookieHeader } from "../authSessionToken";

describe("formatReactNativeCookieHeader", () => {
  it("prepends the required '; ' prefix for React Native Better Auth cookie requests", () => {
    expect(
      formatReactNativeCookieHeader("__Secure-better-auth.session_token=header.payload.signature")
    ).toBe("; __Secure-better-auth.session_token=header.payload.signature");
  });
});
