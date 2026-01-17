import { Hono } from "hono";
import { db } from "../db";
import { Resend } from "resend";
import { env } from "../env";
import type { AppType } from "../types";

// Initialize Resend for email sending
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
console.log(`📧 [Verification Router] Resend initialized: ${resend ? 'YES' : 'NO'}`);

export const emailVerificationRouter = new Hono<AppType>();

// Generate a random 5-digit code
function generateCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// Send verification code email
async function sendVerificationEmail(email: string, code: string, name?: string): Promise<boolean> {
  console.log(`📧 [Verification] Attempting to send code to ${email}`);

  if (!resend) {
    console.log(`📧 [Verification] Code for ${email}: ${code}`);
    console.log("⚠️  [Verification] RESEND_API_KEY not configured - email not sent");
    return true; // Return true in dev so flow continues
  }

  console.log(`📧 [Verification] Resend configured, sending email to ${email}...`);

  try {
    console.log(`📧 [Verification] Calling Resend API with from: support@openinvite.cloud, to: ${email}`);
    const result = await resend.emails.send({
      from: "Open Invite <support@openinvite.cloud>",
      to: email,
      subject: "Your Open Invite Verification Code",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #FF6B4A; font-size: 28px; margin-bottom: 8px;">Open Invite</h1>
            <p style="color: #666; font-size: 14px; margin: 0;">See what your friends are up to</p>
          </div>

          <h2 style="color: #333; font-size: 22px; margin-bottom: 16px; text-align: center;">Verify Your Email</h2>

          <p style="color: #333; font-size: 16px; line-height: 1.5; margin-bottom: 8px;">Hi ${name || "there"},</p>
          <p style="color: #333; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
            Enter this code in the app to verify your email address:
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: linear-gradient(135deg, #FF6B4A10 0%, #FF8A6B10 100%); border: 2px solid #FF6B4A; border-radius: 16px; padding: 24px 48px;">
              <span style="font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 40px; font-weight: bold; color: #FF6B4A; letter-spacing: 8px;">${code}</span>
            </div>
          </div>

          <p style="color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 8px; text-align: center;">
            This code will expire in <strong>10 minutes</strong>.
          </p>

          <div style="background: #FFF9F5; border-radius: 12px; padding: 16px; margin: 24px 0;">
            <p style="color: #666; font-size: 14px; line-height: 1.5; margin: 0;">
              <strong>Tip:</strong> You can copy and paste this code directly into the app.
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #999; font-size: 12px; text-align: center; line-height: 1.5;">
            If you didn't create an account with Open Invite, you can safely ignore this email.
          </p>

          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 16px;">
            Open Invite - See what your friends are up to
          </p>
        </div>
      `,
    });
    console.log(`📧 [Verification] Code sent successfully to ${email}, result:`, JSON.stringify(result));
    return true;
  } catch (error: any) {
    console.error("📧 [Verification] Failed to send email:", error);
    console.error("📧 [Verification] Error details:", JSON.stringify(error, null, 2));
    return false;
  }
}

// POST /api/email-verification/send - Send a verification code
emailVerificationRouter.post("/send", async (c) => {
  try {
    const body = await c.req.json();
    const { email, name } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    // Clean up old codes for this email
    await db.email_verification_code.deleteMany({
      where: {
        email: email.toLowerCase(),
        OR: [
          { expiresAt: { lt: new Date() } }, // Expired codes
          { verified: true }, // Already verified codes
        ],
      },
    });

    // Check for rate limiting - max 3 active codes per email
    const activeCodes = await db.email_verification_code.count({
      where: {
        email: email.toLowerCase(),
        expiresAt: { gt: new Date() },
        verified: false,
      },
    });

    if (activeCodes >= 3) {
      return c.json({
        error: "Too many verification attempts. Please wait a few minutes and try again."
      }, 429);
    }

    // Generate new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save code to database
    await db.email_verification_code.create({
      data: {
        email: email.toLowerCase(),
        code,
        expiresAt,
      },
    });

    // Send email
    const sent = await sendVerificationEmail(email, code, name);

    if (!sent) {
      return c.json({ error: "Failed to send verification email" }, 500);
    }

    console.log(`📧 [Verification] Code created for ${email}, expires at ${expiresAt.toISOString()}`);

    return c.json({
      success: true,
      message: "Verification code sent",
      // In dev mode, return the code for testing (remove in production)
      ...(process.env.NODE_ENV === "development" && !resend ? { code } : {}),
    });
  } catch (error: any) {
    console.error("[Verification] Error sending code:", error);
    return c.json({ error: error.message || "Failed to send verification code" }, 500);
  }
});

// POST /api/email-verification/verify - Verify a code
emailVerificationRouter.post("/verify", async (c) => {
  try {
    const body = await c.req.json();
    const { email, code } = body;

    console.log(`📧 [Verify] Request received - email: ${email}, code: ${code}, type: ${typeof code}`);

    if (!email || !code) {
      console.log(`📧 [Verify] Missing email or code`);
      return c.json({ error: "Email and code are required" }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = String(code).trim();

    console.log(`📧 [Verify] Normalized - email: ${normalizedEmail}, code: ${normalizedCode}`);

    // First, let's see ALL codes for this email to debug
    const allCodes = await db.email_verification_code.findMany({
      where: { email: normalizedEmail },
      orderBy: { createdAt: "desc" },
    });
    console.log(`📧 [Verify] All codes for ${normalizedEmail}:`, JSON.stringify(allCodes.map(c => ({
      code: c.code,
      verified: c.verified,
      expiresAt: c.expiresAt,
      attempts: c.attempts,
      createdAt: c.createdAt
    }))));

    const now = new Date();
    console.log(`📧 [Verify] Current time: ${now.toISOString()}`);

    // Find the verification code
    const verification = await db.email_verification_code.findFirst({
      where: {
        email: normalizedEmail,
        code: normalizedCode,
        verified: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });

    console.log(`📧 [Verify] Found verification:`, verification ? JSON.stringify({
      id: verification.id,
      code: verification.code,
      verified: verification.verified,
      expiresAt: verification.expiresAt
    }) : 'null');

    if (!verification) {
      // Check if code exists but is expired
      const expiredCode = await db.email_verification_code.findFirst({
        where: {
          email: normalizedEmail,
          code: normalizedCode,
        },
      });

      console.log(`📧 [Verify] Checking for expired code:`, expiredCode ? JSON.stringify({
        code: expiredCode.code,
        verified: expiredCode.verified,
        expiresAt: expiredCode.expiresAt
      }) : 'null');

      if (expiredCode) {
        if (expiredCode.verified) {
          console.log(`📧 [Verify] Code already used`);
          return c.json({ error: "This code has already been used" }, 400);
        }
        if (expiredCode.expiresAt < now) {
          console.log(`📧 [Verify] Code expired at ${expiredCode.expiresAt}`);
          return c.json({ error: "This code has expired. Please request a new one." }, 400);
        }
      }

      // Track failed attempt
      await db.email_verification_code.updateMany({
        where: {
          email: normalizedEmail,
          verified: false,
        },
        data: {
          attempts: { increment: 1 },
        },
      });

      console.log(`📧 [Verify] Invalid code - no match found`);
      return c.json({ error: "Invalid verification code" }, 400);
    }

    // Check for too many failed attempts
    if (verification.attempts >= 5) {
      return c.json({
        error: "Too many failed attempts. Please request a new code."
      }, 400);
    }

    // Mark as verified
    await db.email_verification_code.update({
      where: { id: verification.id },
      data: { verified: true },
    });

    // Update the user's email verification status
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      console.log(`📧 [Verification] Email verified for user ${user.id}`);
    } else {
      console.log(`📧 [Verification] No user found for email ${normalizedEmail} - code verified but user not updated`);
    }

    // Clean up old codes for this email
    await db.email_verification_code.deleteMany({
      where: {
        email: normalizedEmail,
        id: { not: verification.id },
      },
    });

    return c.json({
      success: true,
      message: "Email verified successfully",
      verified: true,
    });
  } catch (error: any) {
    console.error("[Verification] Error verifying code:", error);
    return c.json({ error: error.message || "Failed to verify code" }, 500);
  }
});

// POST /api/email-verification/resend - Resend verification code
emailVerificationRouter.post("/resend", async (c) => {
  try {
    const body = await c.req.json();
    const { email, name } = body;

    if (!email) {
      return c.json({ error: "Email is required" }, 400);
    }

    // Check if email is already verified
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user?.emailVerified) {
      return c.json({ error: "Email is already verified" }, 400);
    }

    // Delete all existing codes for this email
    await db.email_verification_code.deleteMany({
      where: { email: email.toLowerCase() },
    });

    // Generate new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save code to database
    await db.email_verification_code.create({
      data: {
        email: email.toLowerCase(),
        code,
        expiresAt,
      },
    });

    // Send email
    const sent = await sendVerificationEmail(email, code, name || user?.name || undefined);

    if (!sent) {
      return c.json({ error: "Failed to send verification email" }, 500);
    }

    console.log(`📧 [Verification] New code sent to ${email}`);

    return c.json({
      success: true,
      message: "New verification code sent",
    });
  } catch (error: any) {
    console.error("[Verification] Error resending code:", error);
    return c.json({ error: error.message || "Failed to resend verification code" }, 500);
  }
});
