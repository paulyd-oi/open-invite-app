// Only import vibecode proxy in Vibecode environment
if (process.env.VIBECODE_ENVIRONMENT) {
  require("@vibecodeapp/proxy");
}
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import * as fs from "node:fs";

import { auth } from "./auth";
import { env } from "./env";

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

console.log("📦 Loading route modules...");

let uploadRouter: any, sampleRouter: any, eventsRouter: any, friendsRouter: any;
let groupsRouter: any, notificationsRouter: any, profileRouter: any, placesRouter: any;
let blockedRouter: any, birthdaysRouter: any, workScheduleRouter: any, friendNotesRouter: any;
let subscriptionRouter: any, onboardingRouter: any, referralRouter: any, eventRequestsRouter: any;
let achievementsRouter: any, widgetRouter: any;
let profilesRouter: any;
let emailVerificationRouter: any;
let circlesRouter: any;
let discountRouter: any;
let webhooksRouter: any;
let privacyRouter: any;
let entitlementsRouter: any;
let cronRouter: any;
let appleAuthRouter: any;

try {
  console.log("  Loading upload router...");
  uploadRouter = require("./routes/upload").uploadRouter;
  console.log("  Loading sample router...");
  sampleRouter = require("./routes/sample").sampleRouter;
  console.log("  Loading events router...");
  eventsRouter = require("./routes/events").eventsRouter;
  console.log("  Loading friends router...");
  friendsRouter = require("./routes/friends").friendsRouter;
  console.log("  Loading groups router...");
  groupsRouter = require("./routes/groups").groupsRouter;
  console.log("  Loading notifications router...");
  notificationsRouter = require("./routes/notifications").notificationsRouter;
  console.log("  Loading profile router...");
  profileRouter = require("./routes/profile").profileRouter;
  console.log("  Loading places router...");
  placesRouter = require("./routes/places").placesRouter;
  console.log("  Loading blocked router...");
  blockedRouter = require("./routes/blocked").blockedRouter;
  console.log("  Loading birthdays router...");
  birthdaysRouter = require("./routes/birthdays").birthdaysRouter;
  console.log("  Loading workSchedule router...");
  workScheduleRouter = require("./routes/workSchedule").workScheduleRouter;
  console.log("  Loading friendNotes router...");
  friendNotesRouter = require("./routes/friendNotes").friendNotesRouter;
  console.log("  Loading subscription router...");
  subscriptionRouter = require("./routes/subscription").subscriptionRouter;
  console.log("  Loading onboarding router...");
  onboardingRouter = require("./routes/onboarding").onboardingRouter;
  console.log("  Loading referral router...");
  referralRouter = require("./routes/referral").referralRouter;
  console.log("  Loading eventRequests router...");
  eventRequestsRouter = require("./routes/eventRequests").eventRequestsRouter;
  console.log("  Loading achievements router...");
  achievementsRouter = require("./routes/achievements").achievementsRouter;
  console.log("  Loading widget router...");
  widgetRouter = require("./routes/widget").widgetRouter;
  console.log("  Loading profiles router...");
  profilesRouter = require("./routes/profiles").profilesRouter;
  console.log("  Loading email verification router...");
  emailVerificationRouter = require("./routes/emailVerification").emailVerificationRouter;
  if (!emailVerificationRouter) {
    console.error("❌ emailVerificationRouter is undefined after loading!");
  } else {
    console.log("  ✅ emailVerificationRouter loaded successfully");
  }
  console.log("  Loading circles router...");
  circlesRouter = require("./routes/circles").circlesRouter;
  console.log("  Loading discount router...");
  discountRouter = require("./routes/discount").discountRouter;
  console.log("  Loading webhooks router...");
  webhooksRouter = require("./routes/webhooks").webhooksRouter;
  console.log("  Loading privacy router...");
  privacyRouter = require("./routes/privacy").privacyRouter;
  console.log("  Loading entitlements router...");
  entitlementsRouter = require("./routes/entitlements").entitlementsRouter;
  console.log("  Loading cron router...");
  cronRouter = require("./routes/cron").cronRouter;
  console.log("  Loading apple auth router...");
  appleAuthRouter = require("./routes/appleAuth").appleAuthRouter;
  console.log("✅ All route modules loaded successfully!");
} catch (error: any) {
  console.error("❌ Error loading route modules:", error.message);
  console.error("Stack:", error.stack);
}
import { type AppType } from "./types";
import { db } from "./db";
import { globalRateLimit, authRateLimit } from "./middleware/rateLimit";

// AppType context adds user and session to the context, will be null if the user or session is null
const app = new Hono<AppType>();

// Global error handler
app.onError((err, c) => {
  console.error("[Global Error Handler]", err);
  console.error(err.stack);
  return c.json({ error: "Internal server error" }, 500);
});

console.log("🔧 Initializing Hono application...");

app.use("*", logger());
app.use(
  "/*",
  cors({
    origin: (origin) => origin || "*", // Allow the requesting origin or fallback to *
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "expo-origin"], // expo-origin is required for Better Auth Expo plugin
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

// Global rate limiting - 200 requests per minute per client
app.use("*", globalRateLimit);

/** Authentication middleware
 * Extracts session from request headers and attaches user/session to context
 * All routes can access c.get("user") and c.get("session")
 */
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null); // type: typeof auth.$Infer.Session.user | null
  c.set("session", session?.session ?? null); // type: typeof auth.$Infer.Session.session | null
  return next();
});

// Dedicated session endpoint - returns 401 if user is null (BEFORE wildcard Better Auth handler)
console.log("🔐 Setting up dedicated /api/auth/session endpoint");
app.options("/api/auth/session", (c) => c.body(null, 204));
app.get("/api/auth/session", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    
    console.log(`🔐 [/api/auth/session] Session retrieved:`, {
      hasUser: !!session?.user,
      hasSession: !!session?.session,
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
// Handles all authentication endpoints: /api/auth/sign-in, /api/auth/sign-up, etc.
console.log("🔐 Mounting Better Auth handler at /api/auth/*");
app.use("/api/auth/*", authRateLimit); // 10 auth attempts per 15 minutes
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const request = c.req.raw;
  console.log(`🔐 [Auth Request] ${request.method} ${c.req.path}`);

  // Log request body for sign-up attempts (without password)
  if (c.req.path.includes("sign-up")) {
    try {
      const clonedReq = request.clone();
      const body = (await clonedReq.json()) as { email?: string; name?: string };
      console.log(`🔐 [Sign Up Attempt] Email: ${body.email}, Name: ${body.name}`);
    } catch (e) {
      console.log(`🔐 [Sign Up] Could not parse request body`);
    }
  }

  try {
    // Workaround for Expo/React Native: native apps don't send Origin header,
    // but the expo client plugin sends expo-origin instead. We need to create
    // a new request with the origin header set from expo-origin.
    const expoOrigin = request.headers.get("expo-origin");
    if (!request.headers.get("origin") && expoOrigin) {
      const headers = new Headers(request.headers);
      headers.set("origin", expoOrigin);
      const modifiedRequest = new Request(request, { headers });
      const response = await auth.handler(modifiedRequest);
      console.log(`🔐 [Auth Response] Status: ${response.status}`);
      if (response.status >= 400) {
        const clonedRes = response.clone();
        try {
          const errBody = await clonedRes.json();
          console.log(`🔐 [Auth Error Body] ${JSON.stringify(errBody)}`);
        } catch (e) {}
      }
      return response;
    }
    const response = await auth.handler(request);
    console.log(`🔐 [Auth Response] Status: ${response.status}`);
    if (response.status >= 400) {
      const clonedRes = response.clone();
      try {
        const errBody = await clonedRes.json();
        console.log(`🔐 [Auth Error Body] ${JSON.stringify(errBody)}`);
      } catch (e) {}
    }
    return response;
  } catch (error: any) {
    console.error(`🔐 [Auth Error] ${error?.message || error}`);
    console.error(`🔐 [Auth Error Stack] ${error?.stack}`);
    return c.json({ error: error?.message || "Authentication error" }, 500);
  }
});

// Serve uploaded images statically
// Files in uploads/ directory are accessible at /uploads/* URLs
console.log("📁 Serving static files from uploads/ directory");
app.use("/uploads/*", serveStatic({ root: STATIC_SERVE_ROOT }));

// Mount route modules
console.log("📤 Mounting upload routes at /api/upload");
app.route("/api/upload", uploadRouter);

console.log("📝 Mounting sample routes at /api/sample");
app.route("/api/sample", sampleRouter);

// Open Invite API routes
console.log("📅 Mounting events routes at /api/events");
app.route("/api/events", eventsRouter);

console.log("👥 Mounting friends routes at /api/friends");
app.route("/api/friends", friendsRouter);

console.log("📁 Mounting groups routes at /api/groups");
app.route("/api/groups", groupsRouter);

console.log("🔔 Mounting notifications routes at /api/notifications");
app.route("/api/notifications", notificationsRouter);

console.log("👤 Mounting profile routes at /api/profile");
app.route("/api/profile", profileRouter);

console.log("📍 Mounting places routes at /api/places");
app.route("/api/places", placesRouter);

console.log("🚫 Mounting blocked routes at /api/blocked");
app.route("/api/blocked", blockedRouter);

console.log("🎂 Mounting birthdays routes at /api/birthdays");
app.route("/api/birthdays", birthdaysRouter);

console.log("📅 Mounting work schedule routes at /api/work-schedule");
app.route("/api/work-schedule", workScheduleRouter);

console.log("📝 Mounting friend notes routes at /api/friends");
app.route("/api/friends", friendNotesRouter);

console.log("💳 Mounting subscription routes at /api/subscription");
app.route("/api/subscription", subscriptionRouter);

console.log("🎓 Mounting onboarding routes at /api/onboarding");
app.route("/api/onboarding", onboardingRouter);

console.log("🎁 Mounting referral routes at /api/referral");
app.route("/api/referral", referralRouter);

console.log("📨 Mounting event requests routes at /api/event-requests");
app.route("/api/event-requests", eventRequestsRouter);

console.log("🏆 Mounting achievements routes at /api/achievements");
app.route("/api/achievements", achievementsRouter);

console.log("📱 Mounting widget routes at /api/widget");
app.route("/api/widget", widgetRouter);

console.log("🔄 Mounting profiles routes at /api/profiles");
app.route("/api/profiles", profilesRouter);

console.log("📧 Mounting email verification routes at /api/email-verification");
app.route("/api/email-verification", emailVerificationRouter);

console.log("⭕ Mounting circles routes at /api/circles");
app.route("/api/circles", circlesRouter);

console.log("🎟️ Mounting discount routes at /api/discount");
app.route("/api/discount", discountRouter);

console.log("🔔 Mounting webhooks routes at /api/webhooks");
app.route("/api/webhooks", webhooksRouter);

console.log("🔒 Mounting privacy routes at /api/privacy");
app.route("/api/privacy", privacyRouter);

console.log("💎 Mounting entitlements routes at /api/entitlements");
app.route("/api/entitlements", entitlementsRouter);

console.log("⏰ Mounting cron routes at /api/cron");
app.route("/api/cron", cronRouter);

console.log("🍎 Mounting Apple auth routes at /api/auth");
app.route("/api/auth", appleAuthRouter);

// Email verification success page
// After users click the verification link, they are redirected here
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

app.get("/", (c) => {
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

// Health check endpoint
// Used by load balancers and monitoring tools to verify service is running
app.get("/health", (c) => {
  console.log("💚 Health check requested");
  return c.json({ status: "ok" });
});

// ============================================
// Universal Links / Deep Link Handlers
// ============================================
// These endpoints handle web URLs that should open the app
// They serve as smart redirects that detect platform and redirect appropriately

// Share Event - Universal link handler
// URL: /share/event/:id
app.get("/share/event/:id", async (c) => {
  const eventId = c.req.param("id");
  console.log(`🔗 [Share] Event share link accessed: ${eventId}`);

  // Try to fetch event details for the preview
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

  // Serve a smart redirect page that:
  // 1. Tries to open the app via deep link
  // 2. Falls back to App Store if app not installed
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
// URL: /invite/:code
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
// URL: /api/events/public/:id
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

// Start the server
console.log("⚙️  Starting server...");
const server = serve({ fetch: app.fetch, port: Number(env.PORT) }, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📍 Environment: ${env.NODE_ENV}`);
  console.log(`🚀 Server is running on port ${env.PORT}`);
  console.log(`🔗 Base URL: http://localhost:${env.PORT}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n📚 Available endpoints:");
  console.log("  🔐 Auth:     /api/auth/*");
  console.log("  📤 Upload:   POST /api/upload/image");
  console.log("  📝 Sample:   GET/POST /api/sample");
  console.log("  💚 Health:   GET /health");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down server...");
  await db.$disconnect();
  console.log("Successfully shutdown server");
  server.close();
  process.exit(0);
};

// Handle SIGINT (ctrl+c).
process.on("SIGINT", async () => {
  console.log("SIGINT received. Cleaning up...");
  await shutdown();
});

// Handle SIGTERM (normal shutdown).
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Cleaning up...");
  await shutdown();
});
