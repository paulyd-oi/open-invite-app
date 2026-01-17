import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";

export const webhooksRouter = new Hono<AppType>();

/**
 * RevenueCat Webhook Handler
 *
 * This endpoint receives webhook events from RevenueCat when subscription
 * events occur (purchases, renewals, cancellations, etc.).
 *
 * Documentation: https://www.revenuecat.com/docs/webhooks
 */

// RevenueCat event types
type RevenueCatEventType =
  | "INITIAL_PURCHASE"
  | "RENEWAL"
  | "CANCELLATION"
  | "UNCANCELLATION"
  | "NON_RENEWING_PURCHASE"
  | "SUBSCRIPTION_PAUSED"
  | "EXPIRATION"
  | "BILLING_ISSUE"
  | "PRODUCT_CHANGE"
  | "TRANSFER";

interface RevenueCatWebhookEvent {
  api_version: string;
  event: {
    aliases: string[];
    app_id: string;
    app_user_id: string;
    country_code: string;
    currency: string;
    entitlement_id: string | null;
    entitlement_ids: string[];
    environment: "SANDBOX" | "PRODUCTION";
    event_timestamp_ms: number;
    expiration_at_ms: number | null;
    id: string;
    is_family_share: boolean;
    offer_code: string | null;
    original_app_user_id: string;
    original_transaction_id: string;
    period_type: "NORMAL" | "INTRO" | "TRIAL";
    presented_offering_id: string | null;
    price: number;
    price_in_purchased_currency: number;
    product_id: string;
    purchased_at_ms: number;
    store: "APP_STORE" | "MAC_APP_STORE" | "PLAY_STORE" | "AMAZON" | "STRIPE" | "RC_BILLING";
    subscriber_attributes: Record<string, { value: string; updated_at_ms: number }>;
    takehome_percentage: number;
    tax_percentage: number;
    transaction_id: string;
    type: RevenueCatEventType;
  };
}

// POST /api/webhooks/revenuecat - Handle RevenueCat webhook events
webhooksRouter.post("/revenuecat", async (c) => {
  // Verify webhook authorization
  const authHeader = c.req.header("Authorization");
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH;

  if (expectedAuth && authHeader !== `Bearer ${expectedAuth}`) {
    console.log("[Webhook] Unauthorized RevenueCat webhook request");
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await c.req.json() as RevenueCatWebhookEvent;
    const event = payload.event;

    console.log(`[Webhook] RevenueCat event: ${event.type} for user ${event.app_user_id}`);

    // The app_user_id should be the user's ID from our database
    // (set via Purchases.logIn() in the app)
    const userId = event.app_user_id;

    // Skip anonymous IDs (start with $RCAnonymousID)
    if (userId.startsWith("$RCAnonymousID")) {
      console.log("[Webhook] Skipping anonymous user event");
      return c.json({ received: true });
    }

    // Handle different event types
    switch (event.type) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "NON_RENEWING_PURCHASE":
        // User purchased or renewed - activate subscription
        await handleSubscriptionActive(userId, event);
        break;

      case "CANCELLATION":
        // User cancelled - subscription will expire at end of period
        await handleCancellation(userId, event);
        break;

      case "EXPIRATION":
        // Subscription expired - deactivate
        await handleExpiration(userId, event);
        break;

      case "BILLING_ISSUE":
        // Payment failed - log for potential follow-up
        console.log(`[Webhook] Billing issue for user ${userId}`);
        break;

      case "PRODUCT_CHANGE":
        // User changed subscription tier
        await handleSubscriptionActive(userId, event);
        break;

      case "UNCANCELLATION":
        // User re-subscribed after cancelling
        await handleSubscriptionActive(userId, event);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Error processing RevenueCat webhook:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Helper function to activate/update subscription
async function handleSubscriptionActive(
  userId: string,
  event: RevenueCatWebhookEvent["event"]
) {
  const expiresAt = event.expiration_at_ms
    ? new Date(event.expiration_at_ms)
    : new Date("2099-12-31"); // Lifetime for non-expiring

  const purchasedAt = new Date(event.purchased_at_ms);

  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier: "premium",
      expiresAt,
      purchasedAt,
      transactionId: event.transaction_id,
    },
    update: {
      tier: "premium",
      expiresAt,
      transactionId: event.transaction_id,
    },
  });

  console.log(`[Webhook] Subscription activated for user ${userId} until ${expiresAt.toISOString()}`);
}

// Helper function to handle cancellation
async function handleCancellation(
  userId: string,
  event: RevenueCatWebhookEvent["event"]
) {
  // Don't immediately expire - subscription remains active until expiration_at_ms
  // Just log the cancellation
  console.log(
    `[Webhook] Subscription cancelled for user ${userId}, ` +
    `will expire at ${event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : "N/A"}`
  );

  // Optionally update a cancellation flag in the database
  // await db.subscription.update({ ... });
}

// Helper function to handle expiration
async function handleExpiration(
  userId: string,
  event: RevenueCatWebhookEvent["event"]
) {
  // Mark subscription as expired
  await db.subscription.update({
    where: { userId },
    data: {
      tier: "free",
      expiresAt: new Date(event.expiration_at_ms || Date.now()),
    },
  });

  console.log(`[Webhook] Subscription expired for user ${userId}`);
}
