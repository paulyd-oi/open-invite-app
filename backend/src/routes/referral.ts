import { Hono } from "hono";
import { db } from "../db";
import { type AppType } from "../types";
import { REFERRAL_TIERS } from "../shared/freemiumLimits";

export const referralRouter = new Hono<AppType>();

// Reward tiers configuration (v3.0)
// 3 referrals = 1 month Pro
// 10 referrals = 1 year Pro
// 40 referrals = Lifetime Pro
const REWARD_TIERS = {
  MONTH_PRO: { count: REFERRAL_TIERS.MONTH_PRO.count, type: REFERRAL_TIERS.MONTH_PRO.type, duration: REFERRAL_TIERS.MONTH_PRO.durationDays },
  YEAR_PRO: { count: REFERRAL_TIERS.YEAR_PRO.count, type: REFERRAL_TIERS.YEAR_PRO.type, duration: REFERRAL_TIERS.YEAR_PRO.durationDays },
  LIFETIME_PRO: { count: REFERRAL_TIERS.LIFETIME_PRO.count, type: REFERRAL_TIERS.LIFETIME_PRO.type, duration: REFERRAL_TIERS.LIFETIME_PRO.durationDays },
};

// Helper function to automatically apply referral rewards to subscription
// This extends the user's subscription from their current expiry date (or trial end date)
async function applyReferralRewardToSubscription(
  userId: string,
  rewardType: string,
  durationDays: number | null
): Promise<void> {
  const now = new Date();

  // Get existing subscription
  const existingSubscription = await db.subscription.findUnique({
    where: { userId },
  });

  let newExpiresAt: Date;

  // Calculate the extension based on reward type
  if (rewardType === "lifetime_premium" || durationDays === null) {
    // Lifetime = set to far future date
    newExpiresAt = new Date("2099-12-31");
  } else {
    const extensionMs = durationDays * 24 * 60 * 60 * 1000;

    if (existingSubscription?.expiresAt) {
      const currentExpiry = new Date(existingSubscription.expiresAt);
      // If subscription is still active, extend from current expiry
      // Otherwise, extend from now
      if (currentExpiry > now) {
        newExpiresAt = new Date(currentExpiry.getTime() + extensionMs);
      } else {
        newExpiresAt = new Date(now.getTime() + extensionMs);
      }
    } else {
      // No existing subscription, start from now
      newExpiresAt = new Date(now.getTime() + extensionMs);
    }
  }

  // Update or create subscription
  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier: "premium",
      expiresAt: newExpiresAt,
      purchasedAt: now,
      transactionId: `referral_${rewardType}_${Date.now()}`,
    },
    update: {
      tier: "premium",
      expiresAt: newExpiresAt,
      transactionId: `referral_${rewardType}_${Date.now()}`,
    },
  });

  console.log(`📅 Applied ${rewardType} to user ${userId}. New expiry: ${newExpiresAt.toISOString()}`);
}

// Generate a unique referral code from user's name
// Format: (first initial)(last name first 3 letters)_(unique 4 chars)
// Example: Brenda Diaz -> bdia_t8js
function generateReferralCode(name: string, id: string): string {
  const parts = (name || "").trim().split(/\s+/);
  const firstInitial = (parts[0]?.[0] || "x").toLowerCase();
  const lastName = parts.length > 1 ? (parts[parts.length - 1] ?? "user") : (parts[0] ?? "user");
  const lastNamePart = lastName.slice(0, 3).toLowerCase();

  // Generate unique 4-char suffix from user ID
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    const charCode = id.charCodeAt(i % id.length) + i;
    suffix += chars[charCode % chars.length];
  }

  return `${firstInitial}${lastNamePart}_${suffix}`;
}

// GET /api/referral/stats - Get user's referral stats
referralRouter.get("/stats", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get or create referral code
  let dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { referralCode: true, name: true, referredBy: true },
  });

  if (!dbUser) {
    return c.json({ error: "User not found" }, 404);
  }

  let referralCode = dbUser.referralCode;
  if (!referralCode) {
    referralCode = generateReferralCode(dbUser.name || "USER", user.id);
    await db.user.update({
      where: { id: user.id },
      data: { referralCode },
    });
  }

  // Count successful referrals
  const successfulReferrals = await db.referral.count({
    where: {
      referrerId: user.id,
      status: { in: ["signed_up", "rewarded"] },
    },
  });

  // Get pending referrals (invites sent but not yet signed up)
  const pendingReferrals = await db.referral.count({
    where: {
      referrerId: user.id,
      status: "pending",
    },
  });

  // Get earned rewards
  const rewards = await db.referral_reward.findMany({
    where: { userId: user.id },
    orderBy: { claimedAt: "desc" },
  });

  // Calculate next reward tier
  let nextReward = null;
  if (successfulReferrals < REWARD_TIERS.MONTH_PRO.count) {
    nextReward = { ...REWARD_TIERS.MONTH_PRO, remaining: REWARD_TIERS.MONTH_PRO.count - successfulReferrals };
  } else if (successfulReferrals < REWARD_TIERS.YEAR_PRO.count) {
    nextReward = { ...REWARD_TIERS.YEAR_PRO, remaining: REWARD_TIERS.YEAR_PRO.count - successfulReferrals };
  } else if (successfulReferrals < REWARD_TIERS.LIFETIME_PRO.count) {
    nextReward = { ...REWARD_TIERS.LIFETIME_PRO, remaining: REWARD_TIERS.LIFETIME_PRO.count - successfulReferrals };
  }

  // Generate shareable link - App Store link (update when app is released)
  const shareLink = `https://apps.apple.com/app/open-invite/id6740083226`;

  return c.json({
    referralCode,
    shareLink,
    successfulReferrals,
    pendingReferrals,
    totalInvites: successfulReferrals + pendingReferrals,
    hasReferrer: !!dbUser.referredBy,
    rewards,
    nextReward,
    rewardTiers: REWARD_TIERS,
  });
});

// GET /api/referral/code - Get or generate referral code
referralRouter.get("/code", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { referralCode: true, name: true },
  });

  if (!dbUser) {
    return c.json({ error: "User not found" }, 404);
  }

  let referralCode = dbUser.referralCode;
  if (!referralCode) {
    referralCode = generateReferralCode(dbUser.name || "USER", user.id);
    await db.user.update({
      where: { id: user.id },
      data: { referralCode },
    });
  }

  // App Store link (update when app is released)
  return c.json({
    referralCode,
    shareLink: `https://apps.apple.com/app/open-invite/id6740083226`,
  });
});

// POST /api/referral/track - Track a referral invite (when user shares)
referralRouter.post("/track", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { email, phone } = body;

  if (!email && !phone) {
    return c.json({ error: "Email or phone required" }, 400);
  }

  // Check if already referred
  const existing = await db.referral.findFirst({
    where: {
      referrerId: user.id,
      OR: [
        email ? { referredEmail: email.toLowerCase() } : {},
        phone ? { referredPhone: phone } : {},
      ].filter((o) => Object.keys(o).length > 0),
    },
  });

  if (existing) {
    return c.json({ message: "Already invited", referral: existing });
  }

  const referral = await db.referral.create({
    data: {
      referrerId: user.id,
      referredEmail: email?.toLowerCase(),
      referredPhone: phone,
      status: "pending",
    },
  });

  return c.json({ success: true, referral });
});

// POST /api/referral/apply - Apply a referral code (called during sign up)
referralRouter.post("/apply", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { referralCode } = body;

  if (!referralCode) {
    return c.json({ error: "Referral code required" }, 400);
  }

  // Find the referrer by code (case-insensitive)
  const referrer = await db.user.findFirst({
    where: {
      referralCode: {
        equals: referralCode,
        mode: "insensitive"
      }
    },
    select: { id: true, name: true },
  });

  if (!referrer) {
    return c.json({ error: "Invalid referral code" }, 404);
  }

  if (referrer.id === user.id) {
    return c.json({ error: "Cannot use your own referral code" }, 400);
  }

  // Check if user was already referred
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { referredBy: true, email: true, phone: true },
  });

  if (dbUser?.referredBy) {
    return c.json({ error: "Already used a referral code" }, 400);
  }

  // Update user with referrer info
  await db.user.update({
    where: { id: user.id },
    data: { referredBy: referrer.id },
  });

  // Create or update referral record
  const existingReferral = await db.referral.findFirst({
    where: {
      referrerId: referrer.id,
      OR: [
        dbUser?.email ? { referredEmail: dbUser.email.toLowerCase() } : {},
        dbUser?.phone ? { referredPhone: dbUser.phone } : {},
      ].filter((o) => Object.keys(o).length > 0),
    },
  });

  if (existingReferral) {
    await db.referral.update({
      where: { id: existingReferral.id },
      data: {
        referredUserId: user.id,
        status: "signed_up",
      },
    });
  } else {
    await db.referral.create({
      data: {
        referrerId: referrer.id,
        referredUserId: user.id,
        referredEmail: dbUser?.email?.toLowerCase(),
        status: "signed_up",
      },
    });
  }

  // Check if referrer earned a new reward
  const successfulCount = await db.referral.count({
    where: {
      referrerId: referrer.id,
      status: { in: ["signed_up", "rewarded"] },
    },
  });

  // Check reward milestones and automatically apply rewards
  let newReward = null;
  for (const tier of Object.values(REWARD_TIERS)) {
    if (successfulCount === tier.count) {
      // Check if this reward was already given
      const existingReward = await db.referral_reward.findFirst({
        where: {
          userId: referrer.id,
          rewardType: tier.type,
        },
      });

      if (!existingReward) {
        const expiresAt = tier.duration
          ? new Date(Date.now() + tier.duration * 24 * 60 * 60 * 1000)
          : null;

        newReward = await db.referral_reward.create({
          data: {
            userId: referrer.id,
            rewardType: tier.type,
            referralCount: successfulCount,
            expiresAt,
          },
        });

        // Automatically apply the reward to the referrer's subscription
        await applyReferralRewardToSubscription(referrer.id, tier.type, tier.duration);

        console.log(`🎉 User ${referrer.id} earned ${tier.type} for ${successfulCount} referrals and it was automatically applied!`);
      }
    }
  }

  // Give the new user a welcome bonus (1 week premium trial)
  const existingWelcomeReward = await db.referral_reward.findFirst({
    where: {
      userId: user.id,
      rewardType: "welcome_week",
    },
  });

  if (!existingWelcomeReward) {
    await db.referral_reward.create({
      data: {
        userId: user.id,
        rewardType: "welcome_week",
        referralCount: 0,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  return c.json({
    success: true,
    referrerName: referrer.name,
    welcomeBonus: "1 week premium trial",
  });
});

// GET /api/referral/leaderboard - Get top referrers
referralRouter.get("/leaderboard", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get top 10 referrers
  const topReferrers = await db.referral.groupBy({
    by: ["referrerId"],
    where: { status: { in: ["signed_up", "rewarded"] } },
    _count: { referrerId: true },
    orderBy: { _count: { referrerId: "desc" } },
    take: 10,
  });

  // Get user details for top referrers
  const leaderboard = await Promise.all(
    topReferrers.map(async (r, index) => {
      const referrer = await db.user.findUnique({
        where: { id: r.referrerId },
        select: { name: true, image: true },
      });
      return {
        rank: index + 1,
        name: referrer?.name || "Anonymous",
        image: referrer?.image,
        count: r._count.referrerId,
        isCurrentUser: r.referrerId === user.id,
      };
    })
  );

  // Get current user's rank if not in top 10
  const userStats = await db.referral.count({
    where: {
      referrerId: user.id,
      status: { in: ["signed_up", "rewarded"] },
    },
  });

  return c.json({
    leaderboard,
    userStats: {
      count: userStats,
      inTop10: leaderboard.some((l) => l.isCurrentUser),
    },
  });
});

// GET /api/referral/validate/:code - Validate a referral code (public)
referralRouter.get("/validate/:code", async (c) => {
  const code = c.req.param("code");

  const referrer = await db.user.findFirst({
    where: {
      referralCode: {
        equals: code,
        mode: "insensitive"
      }
    },
    select: { name: true, image: true },
  });

  if (!referrer) {
    return c.json({ valid: false }, 404);
  }

  return c.json({
    valid: true,
    referrerName: referrer.name,
    referrerImage: referrer.image,
  });
});

// POST /api/referral/claim-reward - Claim a referral reward and apply to subscription
referralRouter.post("/claim-reward", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { rewardId } = body;

  if (!rewardId) {
    return c.json({ error: "Reward ID required" }, 400);
  }

  // Get the reward
  const reward = await db.referral_reward.findFirst({
    where: {
      id: rewardId,
      userId: user.id,
    },
  });

  if (!reward) {
    return c.json({ error: "Reward not found" }, 404);
  }

  // Check if already claimed (has been applied)
  const existingSubscription = await db.subscription.findUnique({
    where: { userId: user.id },
  });

  // Apply the reward to subscription
  const now = new Date();
  let newExpiresAt: Date | null = null;

  switch (reward.rewardType) {
    case "welcome_week":
      newExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "month_premium":
      newExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      break;
    case "year_premium":
      newExpiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      break;
    case "lifetime_premium":
      // Set to a very far future date for lifetime
      newExpiresAt = new Date("2099-12-31");
      break;
    default:
      return c.json({ error: "Unknown reward type" }, 400);
  }

  // If existing subscription, extend it
  if (existingSubscription?.expiresAt && existingSubscription.tier === "premium") {
    const currentExpiry = new Date(existingSubscription.expiresAt);
    if (currentExpiry > now) {
      // Extend from current expiry
      const extensionMs = newExpiresAt.getTime() - now.getTime();
      newExpiresAt = new Date(currentExpiry.getTime() + extensionMs);
    }
  }

  // Update or create subscription
  const subscription = await db.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      tier: "premium",
      expiresAt: newExpiresAt,
      purchasedAt: now,
      transactionId: `referral_${reward.id}`,
    },
    update: {
      tier: "premium",
      expiresAt: newExpiresAt,
      transactionId: `referral_${reward.id}`,
    },
  });

  return c.json({
    success: true,
    subscription: {
      tier: subscription.tier,
      expiresAt: subscription.expiresAt?.toISOString(),
    },
    rewardApplied: reward.rewardType,
  });
});

// GET /api/referral/pending-rewards - Get unclaimed rewards
referralRouter.get("/pending-rewards", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get all rewards for the user
  const rewards = await db.referral_reward.findMany({
    where: { userId: user.id },
    orderBy: { claimedAt: "desc" },
  });

  // Get current subscription
  const subscription = await db.subscription.findUnique({
    where: { userId: user.id },
  });

  // A reward is "pending" if it hasn't been applied to extend subscription
  // For simplicity, show all rewards and let frontend decide what to show
  return c.json({
    rewards: rewards.map((r) => ({
      id: r.id,
      type: r.rewardType,
      referralCount: r.referralCount,
      claimedAt: r.claimedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString(),
    })),
    currentSubscription: subscription ? {
      tier: subscription.tier,
      expiresAt: subscription.expiresAt?.toISOString(),
    } : null,
  });
});
