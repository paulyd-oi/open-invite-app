import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { phoneNumber } from "better-auth/plugins";
import { Resend } from "resend";
import twilio from "twilio";
import { env } from "./env";
import { db } from "./db";

// Initialize Resend for email sending
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Initialize Twilio for SMS sending
const twilioClient =
  env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN
    ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
    : null;

// ============================================
// Better Auth Configuration
// ============================================
// Better Auth handles all authentication flows for the application
// Endpoints are automatically mounted at /api/auth/* in index.ts
//
// Available endpoints:
//   - POST /api/auth/sign-up/email       - Sign up with email/password
//   - POST /api/auth/sign-in/email       - Sign in with email/password
//   - POST /api/auth/sign-out            - Sign out current session
//   - GET  /api/auth/session             - Get current session
//   - POST /api/auth/forget-password     - Request password reset
//   - POST /api/auth/reset-password      - Reset password with token
//   - POST /api/auth/phone-number/send-otp - Send OTP via SMS
//   - And many more... (see Better Auth docs)
//
// This configuration includes:
//   - Prisma adapter for PostgreSQL database
//   - Expo plugin for React Native support
//   - Email/password authentication with password reset
//   - Phone number authentication with Twilio SMS
//   - Trusted origins for CORS
console.log("🔐 [Auth] Initializing Better Auth...");
export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,
  plugins: [
    expo(),
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }, ctx) => {
        if (!twilioClient || !env.TWILIO_PHONE_NUMBER) {
          console.log("⚠️  [Auth] Twilio not configured - SMS not sent");
          return;
        }

        try {
          const message = await twilioClient.messages.create({
            body: `Your Open Invite verification code is: ${code}. This code expires in 10 minutes.`,
            from: env.TWILIO_PHONE_NUMBER,
            to: phone,
          });
          console.log(`📱 [Auth] SMS sent successfully to ${phone}`);
        } catch (error: any) {
          console.error("📱 [Auth] Failed to send SMS:", error?.message);
          throw new Error(`Failed to send verification code: ${error?.message || 'Unknown error'}`);
        }
      },
      signUpOnVerification: {
        getTempEmail: (phoneNumber) => {
          // Generate a temporary email for phone-only users
          const cleanPhone = phoneNumber.replace(/\D/g, "");
          return `${cleanPhone}@phone.local`;
        },
      },
    }),
  ],
  trustedOrigins: [
    "vibecode://", // Expo app scheme (matches app.json)
    "http://localhost:3000",
    "http://localhost:8081",
    "*.vibecodeapp.com",
    "*.share.sandbox.dev",
    "*.vibecode.dev",
    "*.vibecode.run",
    env.BACKEND_URL,
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      if (!resend) {
        console.log(`📧 [Auth] Password reset requested for ${user.email}`);
        console.log(`📧 [Auth] Reset URL: ${url}`);
        console.log(
          "⚠️  [Auth] RESEND_API_KEY not configured - email not sent"
        );
        return;
      }

      try {
        await resend.emails.send({
          from: "Open Invite <support@openinvite.cloud>",
          to: user.email,
          subject: "Reset Your Password - Open Invite",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #FF6B4A; font-size: 24px; margin-bottom: 20px;">Reset Your Password</h1>
              <p style="color: #333; font-size: 16px; line-height: 1.5;">Hi ${user.name || "there"},</p>
              <p style="color: #333; font-size: 16px; line-height: 1.5;">We received a request to reset your password for your Open Invite account.</p>
              <p style="color: #333; font-size: 16px; line-height: 1.5;">Click the button below to reset your password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${url}" style="background-color: #FF6B4A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Reset Password</a>
              </div>
              <p style="color: #666; font-size: 14px; line-height: 1.5;">If you didn't request this, you can safely ignore this email.</p>
              <p style="color: #666; font-size: 14px; line-height: 1.5;">This link will expire in 1 hour.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px;">Open Invite - See what your friends are up to</p>
            </div>
          `,
        });
        console.log(`📧 [Auth] Password reset email sent to ${user.email}`);
      } catch (error) {
        console.error("📧 [Auth] Failed to send password reset email:", error);
        throw error;
      }
    },
  },
  emailVerification: {
    sendOnSignUp: false, // DISABLED - we use custom /api/email-verification/send endpoint instead
    autoSignInAfterVerification: true,
    requireEmailVerification: true,
    callbackURL: "/email-verified",
    sendVerificationEmail: async ({ user, url }) => {
      // This is now only called for manual verification requests from Better Auth
      // We primarily use the custom /api/email-verification/send endpoint
      console.log(`📧 [Auth] sendVerificationEmail called for user: ${user.email}`);
      console.log(
        `📧 [Auth] NOTE: Primary verification is via /api/email-verification/send endpoint`
      );
      // Don't send email here - let the custom endpoint handle it
      return;
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: true,
    },
    disableCSRFCheck: true,
    // Cross-origin cookie settings for iframe web preview
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
  session: {
    // Sessions expire after 90 days of inactivity
    expiresIn: 60 * 60 * 24 * 90, // 90 days in seconds
    // Update session expiry on each request (sliding window)
    updateAge: 60 * 60 * 24, // Update every 24 hours
  },
});
console.log("✅ [Auth] Better Auth initialized");
console.log(`🔗 [Auth] Base URL: ${env.BACKEND_URL}`);
console.log(
  `🌐 [Auth] Trusted origins: ${auth.options.trustedOrigins?.join(", ")}`
);
console.log(`📧 [Auth] Email sending: ${resend ? "enabled" : "disabled"}`);
console.log(`📱 [Auth] SMS sending: ${twilioClient ? "enabled" : "disabled"}`);
