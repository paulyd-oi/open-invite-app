// Production server for Render deployment - v2.8
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { PrismaClient } from "@prisma/client";
import * as fs from "node:fs";

// Import rate limiting middleware
import { globalRateLimit, authRateLimit } from "./middleware/rateLimit";
import { bearerAuth } from "./middleware/bearerAuth";

console.log("=== Starting Server v2.8 ===");

// Initialize Prisma
const db = new PrismaClient();
console.log("✅ Prisma client initialized");

// Environment-aware uploads directory configuration
// Production (Render): Use persistent disk at /opt/render/project/src/uploads
// Development: Use local ./uploads directory
const isProduction = process.env.NODE_ENV === "production";
const UPLOADS_DIR = isProduction
  ? "/opt/render/project/src/uploads"
  : "./uploads";
const STATIC_SERVE_ROOT = isProduction ? "/opt/render/project/src" : ".";

if (!fs.existsSync(UPLOADS_DIR)) {
  console.log("📁 [Upload] Creating uploads directory:", UPLOADS_DIR);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} else {
  console.log("📁 [Upload] Uploads directory exists:", UPLOADS_DIR);
}

// Import auth
import { auth } from "./auth";
console.log("✅ Auth module loaded");

// Import types
import { type AppType } from "./types";

// Import ALL routers (must match index.ts)
import { uploadRouter } from "./routes/upload";
import { sampleRouter } from "./routes/sample";
import { eventsRouter } from "./routes/events";
import { friendsRouter } from "./routes/friends";
import { groupsRouter } from "./routes/groups";
import { notificationsRouter } from "./routes/notifications";
import { profileRouter } from "./routes/profile";
import { placesRouter } from "./routes/places";
import { blockedRouter } from "./routes/blocked";
import { birthdaysRouter } from "./routes/birthdays";
import { workScheduleRouter } from "./routes/workSchedule";
import { friendNotesRouter } from "./routes/friendNotes";
import { subscriptionRouter } from "./routes/subscription";
import { onboardingRouter } from "./routes/onboarding";
import { referralRouter } from "./routes/referral";
import { eventRequestsRouter } from "./routes/eventRequests";
import { achievementsRouter } from "./routes/achievements";
import { emailVerificationRouter } from "./routes/emailVerification";
import { discountRouter } from "./routes/discount";
import { circlesRouter } from "./routes/circles";
import { webhooksRouter } from "./routes/webhooks";
import { widgetRouter } from "./routes/widget";
import { profilesRouter } from "./routes/profiles";
import { privacyRouter } from "./routes/privacy";
import { entitlementsRouter } from "./routes/entitlements";
import { cronRouter } from "./routes/cron";
import { appleAuthRouter } from "./routes/appleAuth";

console.log("✅ All routers loaded");

// Initialize Hono app
const app = new Hono<AppType>();

// Global error handler
app.onError((err, c) => {
  console.error("[Global Error Handler]", err);
  console.error(err.stack);
  return c.json({ error: "Internal server error" }, 500);
});

console.log("✅ Hono app initialized");

app.use("*", logger());
app.use(
  "/*",
  cors({
    origin: (origin) => origin || "*",
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "expo-origin"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Global rate limiting - 200 requests per minute per client
app.use("*", globalRateLimit);

// Authentication middleware - handles both Better Auth session and Bearer tokens
app.use("*", async (c, next) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
  } catch (e) {
    c.set("user", null);
    c.set("session", null);
  }
  return next();
});

// Bearer token auth middleware (after session middleware so context is set up)
app.use("*", bearerAuth);

// Dedicated session endpoint - returns 401 if user is null (BEFORE wildcard Better Auth handler)
// Accepts both Better Auth session cookies AND JWT Bearer tokens
console.log("🔐 Setting up dedicated /api/auth/session endpoint");
app.options("/api/auth/session", (c) => c.body(null, 204));
app.get("/api/auth/session", async (c) => {
  try {
    // First, try Bearer token (JWT)
    const bearerUserId = c.get("bearerUserId");
    const bearerEmail = c.get("bearerEmail");
    
    if (bearerUserId && bearerEmail) {
      console.log(`🔐 [/api/auth/session] Bearer token valid for user: ${bearerUserId}`);
      // Look up user from database using JWT claims
      const user = await db.user.findUnique({ where: { id: bearerUserId } });
      if (user) {
        return c.json(
          {
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image,
            },
            session: null,
          },
          200
        );
      }
    }
    
    // Fall back to Better Auth session (cookies)
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    
    console.log(`🔐 [/api/auth/session] Session retrieved:`, {
      hasUser: !!session?.user,
      hasSession: !!session?.session,
      viaBearerToken: !!bearerUserId,
    });
    
    // INVARIANT: Return 401 if user is falsy (null, undefined, empty)
    if (!session?.user) {
      console.log("🔐 [/api/auth/session] No user - returning 401");
      return c.json({ user: null, session: null }, 401);
    }
    
    // Return session data with 200
    return c.json({ user: session.user, session: session.session ?? null }, 200);
  } catch (error: any) {
    console.error(`🔐 [/api/auth/session] Error:`, error?.message);
    return c.json({ error: "Failed to get session" }, 500);
  }
});

// Better Auth handler with rate limiting
console.log("🔐 Setting up auth routes at /api/auth/*");
app.use("/api/auth/*", authRateLimit); // 10 auth attempts per 15 minutes
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const request = c.req.raw;
  console.log(`🔐 Auth: ${request.method} ${c.req.path}`);

  try {
    const expoOrigin = request.headers.get("expo-origin");
    if (!request.headers.get("origin") && expoOrigin) {
      const headers = new Headers(request.headers);
      headers.set("origin", expoOrigin);
      const modifiedRequest = new Request(request, { headers });
      return await auth.handler(modifiedRequest);
    }
    return await auth.handler(request);
  } catch (error: any) {
    console.error(`🔐 Auth Error: ${error?.message}`);
    return c.json({ error: error?.message || "Authentication error" }, 500);
  }
});

// Mount ALL routers (must match index.ts)
// Custom auth routes (JWT token generation)
import { customAuthRouter } from "./routes/customAuth";
app.route("/api/custom-auth", customAuthRouter);

app.route("/api/upload", uploadRouter);
app.route("/api/sample", sampleRouter);
app.route("/api/events", eventsRouter);
app.route("/api/friends", friendsRouter);
app.route("/api/groups", groupsRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/profile", profileRouter);
app.route("/api/places", placesRouter);
app.route("/api/blocked", blockedRouter);
app.route("/api/birthdays", birthdaysRouter);
app.route("/api/work-schedule", workScheduleRouter);
app.route("/api/friends", friendNotesRouter);
app.route("/api/subscription", subscriptionRouter);
app.route("/api/onboarding", onboardingRouter);
app.route("/api/referral", referralRouter);
app.route("/api/event-requests", eventRequestsRouter);
app.route("/api/achievements", achievementsRouter);
app.route("/api/email-verification", emailVerificationRouter);
app.route("/api/discount", discountRouter);
app.route("/api/circles", circlesRouter);
app.route("/api/webhooks", webhooksRouter);
app.route("/api/widget", widgetRouter);
app.route("/api/profiles", profilesRouter);
app.route("/api/privacy", privacyRouter);
app.route("/api/entitlements", entitlementsRouter);
app.route("/api/cron", cronRouter);
app.route("/api/auth", appleAuthRouter);

// Serve uploaded images from persistent disk
console.log("📁 Serving static files from uploads directory");
app.use("/uploads/*", serveStatic({ root: STATIC_SERVE_ROOT }));

console.log("✅ All routes mounted");

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// Email verification success page
app.get("/email-verified", (c) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verified - Open Invite</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 24px;
          padding: 48px 40px;
          max-width: 420px;
          width: 100%;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .icon {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }
        .icon svg {
          width: 40px;
          height: 40px;
          color: white;
        }
        h1 {
          color: #1f2937;
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 12px;
        }
        p {
          color: #6b7280;
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 32px;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #FF6B4A 0%, #FF8A6B 100%);
          color: white;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 16px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px -5px rgba(255, 107, 74, 0.4);
        }
        .footer {
          margin-top: 32px;
          color: #9ca3af;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1>Email Verified!</h1>
        <p>Your email has been successfully verified. You can now sign in to Open Invite and start connecting with friends.</p>
        <a href="vibecode://" class="button">Open App</a>
        <p class="footer">Open Invite - See what your friends are up to</p>
      </div>
    </body>
    </html>
  `;
  return c.html(html);
});

// Share Event - Universal link handler
app.get("/share/event/:id", async (c) => {
  const eventId = c.req.param("id");
  console.log(`🔗 [Share] Event share link accessed: ${eventId}`);

  let eventTitle = "Open Invite Event";
  let eventDescription = "Check out this event on Open Invite!";
  let eventEmoji = "📅";

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { title: true, description: true, emoji: true, startTime: true },
    });
    if (event) {
      eventTitle = `${event.emoji} ${event.title}`;
      eventDescription = event.description || `Join this event on ${new Date(event.startTime).toLocaleDateString()}`;
      eventEmoji = event.emoji;
    }
  } catch (e) {
    console.log("Could not fetch event details for share preview");
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${eventTitle} - Open Invite</title>
      <meta property="og:title" content="${eventTitle}" />
      <meta property="og:description" content="${eventDescription}" />
      <meta property="og:type" content="website" />
      <meta name="apple-itunes-app" content="app-id=6740083226, app-argument=vibecode://event/${eventId}">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #FF6B4A 0%, #FF8A6B 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 400px;
          width: 100%;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .emoji { font-size: 64px; margin-bottom: 16px; }
        h1 { color: #1f2937; font-size: 24px; margin-bottom: 8px; }
        p { color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px; }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #FF6B4A 0%, #FF8A6B 100%);
          color: white;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 12px;
          width: 100%;
        }
        .secondary {
          display: block;
          color: #6b7280;
          text-decoration: none;
          font-size: 14px;
        }
        .loading { color: #9ca3af; font-size: 14px; margin-top: 16px; }
      </style>
      <script>
        window.location.href = 'vibecode://event/${eventId}';
        setTimeout(function() {
          document.getElementById('content').style.display = 'block';
          document.getElementById('loading').style.display = 'none';
        }, 1500);
      </script>
    </head>
    <body>
      <div class="container">
        <div id="loading" class="loading">Opening Open Invite...</div>
        <div id="content" style="display: none;">
          <div class="emoji">${eventEmoji}</div>
          <h1>${eventTitle}</h1>
          <p>${eventDescription}</p>
          <a href="vibecode://event/${eventId}" class="button">Open in App</a>
          <a href="https://apps.apple.com/app/open-invite/id6740083226" class="secondary">
            Don't have the app? Download Open Invite
          </a>
        </div>
      </div>
    </body>
    </html>
  `;
  return c.html(html);
});

// Invite/Referral link handler
app.get("/invite/:code", async (c) => {
  const referralCode = c.req.param("code");
  console.log(`🔗 [Invite] Referral link accessed: ${referralCode}`);

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Join Open Invite</title>
      <meta property="og:title" content="You're invited to Open Invite!" />
      <meta property="og:description" content="See what your friends are up to and make plans together." />
      <meta name="apple-itunes-app" content="app-id=6740083226">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: linear-gradient(135deg, #FF6B4A 0%, #FF8A6B 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 24px;
          padding: 40px;
          max-width: 400px;
          width: 100%;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .emoji { font-size: 64px; margin-bottom: 16px; }
        h1 { color: #1f2937; font-size: 24px; margin-bottom: 8px; }
        p { color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 16px; }
        .code-box {
          background: #f3f4f6;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .code-label { color: #9ca3af; font-size: 12px; margin-bottom: 4px; }
        .code { color: #1f2937; font-size: 24px; font-weight: bold; letter-spacing: 2px; }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #FF6B4A 0%, #FF8A6B 100%);
          color: white;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 16px;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">🎉</div>
        <h1>You're Invited!</h1>
        <p>Join Open Invite to see what your friends are up to and make plans together.</p>
        <div class="code-box">
          <div class="code-label">Your invite code</div>
          <div class="code">${referralCode}</div>
        </div>
        <a href="https://apps.apple.com/app/open-invite/id6740083226" class="button">
          Download Open Invite
        </a>
      </div>
    </body>
    </html>
  `;
  return c.html(html);
});

// Public event details API (for previews)
app.get("/api/events/public/:id", async (c) => {
  const eventId = c.req.param("id");

  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        emoji: true,
        description: true,
        location: true,
        startTime: true,
        endTime: true,
        user: {
          select: { name: true },
        },
      },
    });

    if (!event) {
      return c.json({ error: "Event not found" }, 404);
    }

    return c.json({
      event: {
        ...event,
        startTime: event.startTime.toISOString(),
        endTime: event.endTime?.toISOString() ?? null,
        hostName: event.user?.name ?? "Someone",
      },
    });
  } catch (error) {
    return c.json({ error: "Failed to fetch event" }, 500);
  }
});

// Root
app.get("/", (c) => c.json({ message: "Open Invite API", version: "2.2" }));

// Start server
const port = Number(process.env.PORT) || 8080;
console.log(`🚀 Starting server on port ${port}...`);

serve({ fetch: app.fetch, port }, () => {
  console.log(`✅ Server running on port ${port}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await db.$disconnect();
  process.exit(0);
});
