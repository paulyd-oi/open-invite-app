import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  type GetSampleResponse,
  postSampleRequestSchema,
  type PostSampleResponse,
} from "../shared/contracts";
import { type AppType } from "../types";
import { db } from "../db";

const sampleRouter = new Hono<AppType>();

sampleRouter.get("/", (c) => {
  return c.json({ message: "Hello, world!" } satisfies GetSampleResponse);
});

sampleRouter.get("/protected", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  return c.json({ message: "Hello, world!" } satisfies GetSampleResponse);
});

sampleRouter.post("/", zValidator("json", postSampleRequestSchema), async (c) => {
  const { value } = c.req.valid("json");
  if (value === "ping") {
    return c.json({ message: "pong" });
  }
  return c.json({ message: "Hello, world!" } satisfies PostSampleResponse);
});

// TEMPORARY: Admin endpoint to delete test users for fresh testing
// DELETE /api/sample/delete-user?email=xxx@xxx.com
sampleRouter.delete("/delete-user", async (c) => {
  const email = c.req.query("email");
  if (!email) {
    return c.json({ error: "Email query param required" }, 400);
  }

  try {
    // Find the user
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return c.json({ error: "User not found", email }, 404);
    }

    // Delete related records first (due to foreign key constraints)
    await db.email_verification_code.deleteMany({ where: { email: email.toLowerCase() } });
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.account.deleteMany({ where: { userId: user.id } });

    // Try to delete profile if exists
    try {
      await db.profile.deleteMany({ where: { userId: user.id } });
    } catch (e) {
      // Profile might not exist
    }

    // Delete the user
    await db.user.delete({ where: { id: user.id } });

    console.log(`🗑️ [Admin] Deleted user: ${email}`);
    return c.json({ success: true, message: `User ${email} deleted`, userId: user.id });
  } catch (error: any) {
    console.error(`[Admin] Error deleting user ${email}:`, error);
    return c.json({ error: error.message || "Failed to delete user" }, 500);
  }
});

// TEMPORARY: Debug endpoint to check verification codes
// GET /api/sample/debug-codes?email=xxx@xxx.com
sampleRouter.get("/debug-codes", async (c) => {
  const email = c.req.query("email");
  if (!email) {
    return c.json({ error: "Email query param required" }, 400);
  }

  try {
    const codes = await db.email_verification_code.findMany({
      where: { email: email.toLowerCase() },
      orderBy: { createdAt: "desc" },
    });

    return c.json({
      email: email.toLowerCase(),
      codesCount: codes.length,
      codes: codes.map((code) => ({
        code: code.code,
        verified: code.verified,
        expiresAt: code.expiresAt,
        createdAt: code.createdAt,
        isExpired: code.expiresAt < new Date(),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch codes";
    console.error(`[Debug] Error fetching codes:`, error);
    return c.json({ error: message }, 500);
  }
});

export { sampleRouter };
