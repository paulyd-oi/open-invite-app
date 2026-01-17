import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";

export const discountRouter = new Hono<AppType>();

// GET /api/discount/health - Simple health check to verify router is loaded
discountRouter.get("/health", (c) => {
  return c.json({ status: "ok", router: "discount" });
});

// Predefined discount codes with easy-to-remember names
// These codes should be created via seed or admin panel
const DISCOUNT_CODE_TYPES = {
  MONTH1FREE: "month_free",
  YEAR1FREE: "year_free",
  LIFETIME4U: "lifetime",
};

// GET /api/discount/validate/:code - Validate a discount code
discountRouter.get("/validate/:code", async (c) => {
  const code = c.req.param("code").toUpperCase();

  const discountCode = await db.discount_code.findFirst({
    where: {
      code: {
        equals: code,
        mode: "insensitive",
      },
      isActive: true,
    },
  });

  if (!discountCode) {
    return c.json({ valid: false, error: "Invalid code" }, 404);
  }

  // Check if expired
  if (discountCode.expiresAt && new Date(discountCode.expiresAt) < new Date()) {
    return c.json({ valid: false, error: "Code has expired" }, 400);
  }

  // Check if max uses reached
  if (discountCode.maxUses && discountCode.usedCount >= discountCode.maxUses) {
    return c.json({ valid: false, error: "Code has reached maximum uses" }, 400);
  }

  // Get benefit description
  let benefit = "";
  switch (discountCode.type) {
    case "month_free":
      benefit = "1 month of Premium free";
      break;
    case "year_free":
      benefit = "1 year of Premium free";
      break;
    case "lifetime":
      benefit = "Lifetime Premium access";
      break;
  }

  return c.json({
    valid: true,
    code: discountCode.code,
    type: discountCode.type,
    benefit,
  });
});

// POST /api/discount/redeem - Redeem a discount code
discountRouter.post("/redeem", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { code } = body;

  if (!code) {
    return c.json({ error: "Code is required" }, 400);
  }

  const discountCode = await db.discount_code.findFirst({
    where: {
      code: {
        equals: code.toUpperCase(),
        mode: "insensitive",
      },
      isActive: true,
    },
  });

  if (!discountCode) {
    return c.json({ error: "Invalid code" }, 404);
  }

  // Check if expired
  if (discountCode.expiresAt && new Date(discountCode.expiresAt) < new Date()) {
    return c.json({ error: "Code has expired" }, 400);
  }

  // Check if max uses reached
  if (discountCode.maxUses && discountCode.usedCount >= discountCode.maxUses) {
    return c.json({ error: "Code has reached maximum uses" }, 400);
  }

  // Check if user already redeemed this code
  const existingRedemption = await db.discount_code_redemption.findFirst({
    where: {
      discountCodeId: discountCode.id,
      userId: user.id,
    },
  });

  if (existingRedemption) {
    return c.json({ error: "You have already used this code" }, 400);
  }

  // Calculate subscription expiry
  const now = new Date();
  let newExpiresAt: Date;

  switch (discountCode.type) {
    case "month_free":
      newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      break;
    case "year_free":
      newExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      break;
    case "lifetime":
      newExpiresAt = new Date("2099-12-31");
      break;
    default:
      return c.json({ error: "Unknown code type" }, 400);
  }

  // Check existing subscription and extend if needed
  const existingSubscription = await db.subscription.findUnique({
    where: { userId: user.id },
  });

  if (existingSubscription?.expiresAt && existingSubscription.tier === "premium") {
    const currentExpiry = new Date(existingSubscription.expiresAt);
    if (currentExpiry > now) {
      // Extend from current expiry
      const extensionMs = newExpiresAt.getTime() - now.getTime();
      newExpiresAt = new Date(currentExpiry.getTime() + extensionMs);
    }
  }

  // Transaction: Update discount code, create redemption, update subscription
  const [_, __, subscription] = await db.$transaction([
    // Increment used count
    db.discount_code.update({
      where: { id: discountCode.id },
      data: { usedCount: { increment: 1 } },
    }),
    // Create redemption record
    db.discount_code_redemption.create({
      data: {
        discountCodeId: discountCode.id,
        userId: user.id,
      },
    }),
    // Update subscription
    db.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tier: "premium",
        expiresAt: newExpiresAt,
        purchasedAt: now,
        transactionId: `discount_${discountCode.code}`,
      },
      update: {
        tier: "premium",
        expiresAt: newExpiresAt,
        transactionId: `discount_${discountCode.code}`,
      },
    }),
  ]);

  // Get benefit description
  let benefit = "";
  switch (discountCode.type) {
    case "month_free":
      benefit = "1 month of Premium";
      break;
    case "year_free":
      benefit = "1 year of Premium";
      break;
    case "lifetime":
      benefit = "Lifetime Premium access";
      break;
  }

  return c.json({
    success: true,
    benefit,
    subscription: {
      tier: subscription.tier,
      expiresAt: subscription.expiresAt?.toISOString(),
    },
  });
});

// POST /api/discount/seed - Seed initial discount codes (admin only, protected by env key)
discountRouter.post("/seed", async (c) => {
  const adminKey = c.req.header("X-Admin-Api-Key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey || adminKey !== expectedKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Create the three discount codes
  const codes = [
    { code: "MONTH1FREE", type: "month_free", maxUses: 100 },
    { code: "YEAR1FREE", type: "year_free", maxUses: 50 },
    { code: "LIFETIME4U", type: "lifetime", maxUses: 20 },
  ];

  const created = [];
  for (const codeData of codes) {
    try {
      const existing = await db.discount_code.findFirst({
        where: { code: codeData.code },
      });

      if (!existing) {
        const newCode = await db.discount_code.create({
          data: codeData,
        });
        created.push(newCode);
      } else {
        created.push(existing);
      }
    } catch (error) {
      console.error(`Error creating code ${codeData.code}:`, error);
    }
  }

  return c.json({
    success: true,
    codes: created.map((c) => ({
      code: c.code,
      type: c.type,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
    })),
  });
});

// POST /api/discount/update-limits - Update max uses for discount codes (admin only)
discountRouter.post("/update-limits", async (c) => {
  const adminKey = c.req.header("X-Admin-Api-Key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey || adminKey !== expectedKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Update the three discount codes with new limits
  const updates = [
    { code: "MONTH1FREE", maxUses: 500 },
    { code: "YEAR1FREE", maxUses: 200 },
    { code: "LIFETIME4U", maxUses: 100 },
  ];

  const updated = [];
  for (const update of updates) {
    try {
      const result = await db.discount_code.updateMany({
        where: { code: update.code },
        data: { maxUses: update.maxUses },
      });
      if (result.count > 0) {
        const code = await db.discount_code.findFirst({ where: { code: update.code } });
        if (code) updated.push(code);
      }
    } catch (error) {
      console.error(`Error updating code ${update.code}:`, error);
    }
  }

  return c.json({
    success: true,
    codes: updated.map((c) => ({
      code: c.code,
      type: c.type,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
    })),
  });
});
