/**
 * RevenueCat Client Module
 *
 * This module provides a centralized RevenueCat SDK wrapper that gracefully handles
 * missing configuration. The app will work fine whether or not RevenueCat is configured.
 *
 * Environment Variables:
 * - EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY: Used in development/test builds (both platforms)
 * - EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY: Used in production builds (iOS)
 * - EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY: Used in production builds (non-iOS)
 * These are automatically injected into the workspace by the Vibecode service once the user sets up RevenueCat in the Payments tab.
 *
 * Platform Support:
 * - iOS and other native platforms: Fully supported via app stores
 * - Web: Disabled (RevenueCat only supports native app stores)
 *
 * The module automatically selects the correct key based on __DEV__ mode.
 * 
 * This module is used to get the current customer info, offerings, and purchase packages.
 * These exported functions are found at the bottom of the file.
 */

import { Platform } from "react-native";
import Purchases, {
  type PurchasesOfferings,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";
import { devLog, devWarn, devError } from "./devLog";

// ============================================
// REVENUECAT CONFIGURATION
// ============================================

/**
 * Offering ID for Founder Pro v1
 * Use this constant when requesting specific offerings
 * If null or not found, falls back to current offering
 */
export const REVENUECAT_OFFERING_ID = "default";

/**
 * Entitlement identifier for premium access
 * Backend and RevenueCat both use "premium" as the entitlement ID
 * User-facing copy should say "Founder Pro"
 */
export const REVENUECAT_ENTITLEMENT_ID = "premium";

/**
 * SSOT package identifiers — use these everywhere instead of magic strings.
 * These match the identifiers set up in the RevenueCat dashboard.
 */
export const RC_PACKAGE_ANNUAL = "$rc_annual";
export const RC_PACKAGE_MONTHLY = "$rc_monthly";
export const RC_PACKAGE_LIFETIME = "$rc_lifetime";

// Check if running on web
const isWeb = Platform.OS === "web";

// Check for environment keys
const testKey = process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_TEST_KEY;
const appleKey = process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_APPLE_KEY;
const googleKey = process.env.EXPO_PUBLIC_VIBECODE_REVENUECAT_GOOGLE_KEY;

// Use __DEV__ and Platform to determine which key to use.
// Falls back to the test key when platform-specific production keys aren't set.
// RevenueCat uses one API key per app — sandbox vs production is environment-based.
const getApiKey = (): string | undefined => {
  if (isWeb) return undefined;
  if (__DEV__) return testKey;

  // Production: prefer platform-specific key, fall back to test key
  const platformKey = Platform.OS === "ios" ? appleKey : googleKey;
  return platformKey || testKey;
};

const apiKey = getApiKey();

// Track if RevenueCat is enabled
const isEnabled = !!apiKey && !isWeb;

/**
 * Returns which API key slot is active for proof logging.
 * NEVER returns the actual key value — only the source name.
 */
export const getKeySource = (): "dev-test" | "prod-apple" | "prod-google" | "none" => {
  if (!apiKey) return "none";
  if (__DEV__) return "dev-test";
  if (Platform.OS === "ios") return "prod-apple";
  return "prod-google";
};

const LOG_PREFIX = "[RevenueCat]";

export type RevenueCatGuardReason =
  | "web_not_supported"
  | "not_configured"
  | "sdk_error";

export type RevenueCatResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: RevenueCatGuardReason; error?: unknown };

// Internal guard to get consistent success/failure results from RevenueCat.
const guardRevenueCatUsage = async <T>(
  action: string,
  operation: () => Promise<T>,
): Promise<RevenueCatResult<T>> => {
  if (isWeb) {
    if (__DEV__) {
      devLog(
        `${LOG_PREFIX} ${action} skipped: payments are not supported on web.`,
      );
    }
    return { ok: false, reason: "web_not_supported" };
  }

  if (!isEnabled) {
    if (__DEV__) {
      devLog(`${LOG_PREFIX} ${action} skipped: RevenueCat not configured`);
    }
    return { ok: false, reason: "not_configured" };
  }

  try {
    const data = await operation();
    return { ok: true, data };
  } catch (error) {
    if (__DEV__) {
      devLog(`${LOG_PREFIX} ${action} failed:`, error);
    }
    return { ok: false, reason: "sdk_error", error };
  }
};

// Initialize RevenueCat if key exists
if (isEnabled) {
  try {
    // Set up custom log handler to suppress Test Store and expected errors
    // These are non-errors thrown as errors by the SDK, and will be confusing to the user.
    Purchases.setLogHandler((logLevel, message) => {

      // Log ERROR messages normally
      if (logLevel === Purchases.LOG_LEVEL.ERROR) {
        devLog(LOG_PREFIX, message);
      }
    });

    Purchases.configure({ apiKey: apiKey! });
    if (__DEV__) {
      devLog(`${LOG_PREFIX} SDK initialized successfully`);
      devLog("[P0_RC_STATE] INIT", {
        keySource: getKeySource(),
        enabled: true,
        offeringId: REVENUECAT_OFFERING_ID,
        entitlementId: REVENUECAT_ENTITLEMENT_ID,
      });
    }
  } catch (error) {
    if (__DEV__) {
      devError(`${LOG_PREFIX} Failed to initialize:`, error);
    }
  }
}

/**
 * Check if RevenueCat is configured and enabled
 *
 * @returns true if RevenueCat is configured with valid API keys
 *
 * @example
 * if (isRevenueCatEnabled()) {
 *   // Show subscription features
 * } else {
 *   // Hide or disable subscription UI
 * }
 */
export const isRevenueCatEnabled = (): boolean => {
  return isEnabled;
};

/**
 * Get available offerings from RevenueCat
 *
 * @returns RevenueCatResult containing PurchasesOfferings data or a failure reason
 *
 * @example
 * const offeringsResult = await getOfferings();
 * if (offeringsResult.ok && offeringsResult.data.current) {
 *   // Display packages from offeringsResult.data.current.availablePackages
 * }
 */
export const getOfferings = (): Promise<
  RevenueCatResult<PurchasesOfferings>
> => {
  return guardRevenueCatUsage("getOfferings", () => Purchases.getOfferings());
};

/**
 * Purchase a package
 *
 * @param packageToPurchase - The package to purchase
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const purchaseResult = await purchasePackage(selectedPackage);
 * if (purchaseResult.ok) {
 *   // Purchase successful, check entitlements
 * }
 */
export const purchasePackage = (
  packageToPurchase: PurchasesPackage,
): Promise<RevenueCatResult<CustomerInfo>> => {
  return guardRevenueCatUsage("purchasePackage", async () => {
    const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
    return customerInfo;
  });
};

/**
 * Get current customer info including active entitlements
 *
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const customerInfoResult = await getCustomerInfo();
 * if (
 *   customerInfoResult.ok &&
 *   customerInfoResult.data.entitlements.active["premium"]
 * ) {
 *   // User has active premium entitlement
 * }
 */
export const getCustomerInfo = (): Promise<RevenueCatResult<CustomerInfo>> => {
  return guardRevenueCatUsage("getCustomerInfo", () =>
    Purchases.getCustomerInfo(),
  );
};

/**
 * Restore previous purchases
 *
 * @returns RevenueCatResult containing CustomerInfo data or a failure reason
 *
 * @example
 * const restoreResult = await restorePurchases();
 * if (restoreResult.ok) {
 *   // Purchases restored successfully
 * }
 */
export const restorePurchases = (): Promise<
  RevenueCatResult<CustomerInfo>
> => {
  return guardRevenueCatUsage("restorePurchases", () =>
    Purchases.restorePurchases(),
  );
};

/**
 * Set user ID for RevenueCat (useful for cross-platform user tracking)
 *
 * Returns the CustomerInfo from logIn — callers should check for
 * transferred entitlements (e.g., offer codes redeemed before account creation).
 *
 * @param userId - The user ID to set
 * @returns RevenueCatResult<CustomerInfo> with post-login customer info
 */
export const setUserId = (userId: string): Promise<RevenueCatResult<CustomerInfo>> => {
  return guardRevenueCatUsage("setUserId", async () => {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  });
};

/**
 * Log out the current user
 *
 * @returns RevenueCatResult<void> describing success/failure
 *
 * @example
 * const result = await logoutUser();
 * if (!result.ok) {
 *   // Handle failure case
 * }
 */
export const logoutUser = (): Promise<RevenueCatResult<void>> => {
  return guardRevenueCatUsage("logoutUser", async () => {
    await Purchases.logOut();
  });
};

/**
 * Check if user has a specific entitlement active
 *
 * @param entitlementId - The entitlement identifier (e.g., "premium", "pro")
 * @returns RevenueCatResult<boolean> describing entitlement state or failure
 *
 * @example
 * const premiumResult = await hasEntitlement("premium");
 * if (premiumResult.ok && premiumResult.data) {
 *   // Show premium features
 * }
 */
export const hasEntitlement = async (
  entitlementId: string,
): Promise<RevenueCatResult<boolean>> => {
  const customerInfoResult = await getCustomerInfo();

  if (!customerInfoResult.ok) {
    return {
      ok: false,
      reason: customerInfoResult.reason,
      error: customerInfoResult.error,
    };
  }

  const isActive = Boolean(
    customerInfoResult.data.entitlements.active?.[entitlementId],
  );
  return { ok: true, data: isActive };
};

/**
 * Check if user has any active subscription
 *
 * @returns RevenueCatResult<boolean> describing subscription state or failure
 *
 * @example
 * const subscriptionResult = await hasActiveSubscription();
 * if (subscriptionResult.ok && subscriptionResult.data) {
 *   // User is a paying subscriber
 * }
 */
export const hasActiveSubscription = async (): Promise<
  RevenueCatResult<boolean>
> => {
  const customerInfoResult = await getCustomerInfo();

  if (!customerInfoResult.ok) {
    return {
      ok: false,
      reason: customerInfoResult.reason,
      error: customerInfoResult.error,
    };
  }

  const hasSubscription =
    Object.keys(customerInfoResult.data.entitlements.active || {}).length > 0;
  return { ok: true, data: hasSubscription };
};

/**
 * Get the best available offering with fallback logic.
 *
 * 1. Try REVENUECAT_OFFERING_ID (default) from offerings.all
 * 2. Fall back to offerings.current (the "default" offering in RevenueCat)
 * 3. Return null if neither exists
 *
 * Logs [PRO_OFFERING] in DEV with full resolution details.
 */
export const getOfferingWithFallback = async (): Promise<
  RevenueCatResult<{ offering: import("react-native-purchases").PurchasesOffering | null; usedId: string | null; foundRequested: boolean }>
> => {
  const offeringsResult = await getOfferings();
  if (!offeringsResult.ok) {
    return { ok: false, reason: offeringsResult.reason, error: offeringsResult.error };
  }

  const offerings = offeringsResult.data;
  const requestedId = REVENUECAT_OFFERING_ID;
  let foundRequested = false;
  let offering: import("react-native-purchases").PurchasesOffering | null = null;
  let usedId: string | null = null;

  // 1. Try the requested offering by identifier
  if (requestedId && offerings.all?.[requestedId]) {
    offering = offerings.all[requestedId];
    usedId = requestedId;
    foundRequested = true;
  }

  // 2. Fallback to current (default) offering
  if (!offering && offerings.current) {
    offering = offerings.current;
    usedId = offerings.current.identifier ?? "default";
  }

  if (__DEV__) {
    devLog(
      `[PRO_OFFERING] requestedOfferingId=${requestedId} foundRequested=${foundRequested} ` +
      `usedOfferingId=${usedId} packagesCount=${offering?.availablePackages?.length ?? 0}`
    );
  }

  return { ok: true, data: { offering, usedId, foundRequested } };
};

/**
 * Get a specific package from the current offering
 *
 * @param packageIdentifier - The package identifier (e.g., "$rc_monthly", "$rc_annual")
 * @returns RevenueCatResult containing the package (or null) or a failure reason
 *
 * @example
 * const packageResult = await getPackage("$rc_monthly");
 * if (packageResult.ok && packageResult.data) {
 *   // Display monthly subscription option
 * }
 */
export const getPackage = async (
  packageIdentifier: string,
): Promise<RevenueCatResult<PurchasesPackage | null>> => {
  const offeringsResult = await getOfferings();

  if (!offeringsResult.ok) {
    return {
      ok: false,
      reason: offeringsResult.reason,
      error: offeringsResult.error,
    };
  }

  const pkg =
    offeringsResult.data.current?.availablePackages.find(
      (availablePackage) => availablePackage.identifier === packageIdentifier,
    ) ?? null;

  return { ok: true, data: pkg };
};
