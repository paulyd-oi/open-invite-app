jest.mock("../safeSecureStore", () => ({
  safeGetItemAsync: jest.fn(),
}));

jest.mock("../devLog", () => ({
  devLog: jest.fn(),
  devError: jest.fn(),
}));

jest.mock("../sessionCookie", () => ({
  setExplicitCookiePair: jest.fn(),
  SESSION_COOKIE_KEY: "open-invite_session_cookie",
}));

jest.mock("@/hooks/useBootAuthority", () => ({
  requestBootstrapRefreshOnce: jest.fn(),
}));

describe("runExactAppleAuthBootstrap", () => {
  const recoveredToken = "header.payload.signature";
  const deps = {
    setExplicitCookieValueDirectly: jest.fn(),
    setAuthToken: jest.fn(),
    setOiSessionToken: jest.fn(),
    ensureSessionReady: jest.fn(),
    getOiSessionTokenCached: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__DEV__ = false;

    const { safeGetItemAsync } = require("../safeSecureStore");
    safeGetItemAsync.mockImplementation(async (key: string) => {
      if (key === "open-invite_cookie") {
        return JSON.stringify({
          "__Secure-better-auth.session_token": {
            value: recoveredToken,
          },
        });
      }
      return null;
    });

    const sessionCookie = require("../sessionCookie");
    sessionCookie.setExplicitCookiePair.mockResolvedValue(true);
    deps.setExplicitCookieValueDirectly.mockReturnValue(true);
    deps.setAuthToken.mockResolvedValue(undefined);
    deps.setOiSessionToken.mockResolvedValue(undefined);
    deps.ensureSessionReady.mockResolvedValue({
      ok: true,
      status: 200,
      userId: "user_12345678",
      attempt: 1,
    });
    deps.getOiSessionTokenCached.mockReturnValue(recoveredToken);
  });

  it("recovers the token from Better Auth expo storage when email auth has no response token or set-cookie header", async () => {
    const { runExactAppleAuthBootstrap } = require("../exactAppleAuthBootstrap");
    const { setExplicitCookiePair } = require("../sessionCookie");
    const { requestBootstrapRefreshOnce } = require("@/hooks/useBootAuthority");
    const traceLog = jest.fn();
    const traceError = jest.fn();

    const result = await runExactAppleAuthBootstrap(
      { user: { id: "user_12345678" } },
      null,
      traceLog,
      traceError,
      deps
    );

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        tokenLength: recoveredToken.length,
      })
    );
    expect(traceLog).toHaveBeenCalledWith(
      "token_recovered_from_storage",
      expect.objectContaining({
        source: "expoSecureStore",
        tokenLength: recoveredToken.length,
      })
    );
    expect(traceError).not.toHaveBeenCalledWith(
      "token_missing",
      expect.anything()
    );
    expect(setExplicitCookiePair).toHaveBeenCalledWith(recoveredToken);
    expect(requestBootstrapRefreshOnce).toHaveBeenCalled();
  });
});
