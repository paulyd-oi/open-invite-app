/**
 * Logout Integration Test
 * Validates that resetSession() guarantees local cleanup even when backend fails
 */
import { resetSession } from "../authBootstrap";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Mock dependencies
jest.mock("expo-secure-store");
jest.mock("@react-native-async-storage/async-storage");
jest.mock("@tanstack/react-query", () => ({
  QueryClient: jest.fn().mockImplementation(() => ({
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock authClient
jest.mock("../authClient", () => ({
  authClient: {
    signOut: jest.fn(),
  },
}));

describe("Logout Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("succeeds locally even when backend signOut returns 500", async () => {
    // Setup: Mock SecureStore and AsyncStorage
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(["other_key"]);

    // Setup: Mock backend failure
    const authClient = require("../authClient").authClient;
    authClient.signOut.mockRejectedValue(new Error("Backend 500"));

    // Execute: resetSession should not throw
    await expect(resetSession()).resolves.not.toThrow();

    // Verify: Local cleanup still happened
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("better-auth.session_token");
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      "session_cache",
      "onboarding_completed",
      "onboarding_progress_v2",
      "onboarding_progress",
    ]);
  });

  it("succeeds locally even when SecureStore throws", async () => {
    // Setup: Mock SecureStore failure
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error("SecureStore error"));
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);

    const authClient = require("../authClient").authClient;
    authClient.signOut.mockResolvedValue(undefined);

    // Execute: resetSession should not throw even if SecureStore fails
    await expect(resetSession()).resolves.not.toThrow();

    // Verify: AsyncStorage cleanup still happened
    expect(AsyncStorage.multiRemove).toHaveBeenCalled();
  });

  it("succeeds locally even when AsyncStorage throws", async () => {
    // Setup: Mock AsyncStorage failure
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValue(new Error("AsyncStorage error"));
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(new Error("getAllKeys error"));

    const authClient = require("../authClient").authClient;
    authClient.signOut.mockResolvedValue(undefined);

    // Execute: resetSession should not throw even if AsyncStorage fails
    await expect(resetSession()).resolves.not.toThrow();

    // Verify: SecureStore cleanup still happened
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("better-auth.session_token");
  });

  it("succeeds even when all cleanup steps fail", async () => {
    // Setup: Everything fails
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error("SecureStore error"));
    (AsyncStorage.multiRemove as jest.Mock).mockRejectedValue(new Error("AsyncStorage error"));
    (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValue(new Error("getAllKeys error"));

    const authClient = require("../authClient").authClient;
    authClient.signOut.mockRejectedValue(new Error("Backend 500"));

    // Execute: resetSession MUST NOT THROW
    await expect(resetSession()).resolves.not.toThrow();

    // Verify: All cleanup steps were attempted
    expect(authClient.signOut).toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).toHaveBeenCalled();
  });
});
