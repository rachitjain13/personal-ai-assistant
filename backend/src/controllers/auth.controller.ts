import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomInt, createHash } from "crypto";
import { User } from "../models/User";
import { UserUsage } from "../models/UserUsage";
import { AuthCode, AuthCodePurpose } from "../models/AuthCode";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { sendAuthCodeEmail } from "../services/email.service";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function createToken(userId: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing from .env");
  return jwt.sign({ id: userId }, secret, { expiresIn: "7d" });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function hashCode(email: string, purpose: AuthCodePurpose, code: string) {
  const pepper = process.env.JWT_SECRET;
  if (!pepper) throw new Error("JWT_SECRET is missing from .env");
  return createHash("sha256")
    .update(`${email}:${purpose}:${code}:${pepper}`)
    .digest("hex");
}

function createSixDigitCode() {
  return String(randomInt(100000, 1000000));
}

function validEmailSyntax(email: string) {
  return email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function sendCode(
  email: string,
  purpose: AuthCodePurpose,
  extra: { signupName?: string; passwordHash?: string } = {}
) {
  const existing = await AuthCode.findOne({ email, purpose }).select("+codeHash +signupName +passwordHash");
  if (existing && Date.now() - existing.sentAt.getTime() < RESEND_WAIT_MS) {
    const seconds = Math.ceil(
      (RESEND_WAIT_MS - (Date.now() - existing.sentAt.getTime())) / 1000
    );
    const error = new Error(`Please wait ${seconds} seconds before requesting another code.`);
    (error as Error & { status?: number }).status = 429;
    throw error;
  }

  const code = createSixDigitCode();
  const now = new Date();

  // Send first; only persist the new code if the email service accepts the message.
  await sendAuthCodeEmail(email, code, purpose);

  await AuthCode.findOneAndUpdate(
    { email, purpose },
    {
      $set: {
        email,
        purpose,
        codeHash: hashCode(email, purpose, code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        sentAt: now,
        attempts: 0,
        signupName: extra.signupName,
        passwordHash: extra.passwordHash,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function validateCode(email: string, purpose: AuthCodePurpose, code: string) {
  const record = await AuthCode.findOne({ email, purpose }).select("+codeHash +signupName +passwordHash");
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    if (record) await record.deleteOne();
    return { record: null, error: "This code is invalid or has expired. Request a new code." };
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await record.deleteOne();
    return { record: null, error: "Too many incorrect attempts. Request a new code." };
  }

  if (record.codeHash !== hashCode(email, purpose, code)) {
    record.attempts += 1;
    await record.save();
    return { record: null, error: "Incorrect verification code." };
  }

  return { record, error: null };
}

async function getUserPayload(userId: string) {
  const user = await User.findById(userId).select("_id name email emailVerified createdAt lastLogin");
  if (!user) return null;

  const usage = await UserUsage.findOne({ userId }).lean();
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin,
    usage: {
      totalInputTokens: usage?.totalInputTokens || 0,
      totalOutputTokens: usage?.totalOutputTokens || 0,
      totalTokens: usage?.totalTokens || 0,
      requestCount: usage?.requestCount || 0,
    },
  };
}

// Step 1: request a verification code. The account is not created until the code is verified.
export async function register(req: Request, res: Response) {
  try {
    const name = String(req.body?.name || "").trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (name.length < 2) return res.status(400).json({ success: false, message: "Name must be at least 2 characters." });
    if (!validEmailSyntax(email)) return res.status(400).json({ success: false, message: "Enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters." });
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ success: false, message: "Password must contain at least one letter and one number." });
    }

    if (await User.exists({ email })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists. Sign in or use Forgot password." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await sendCode(email, "verify_email", { signupName: name, passwordHash });

    return res.status(200).json({
      success: true,
      requiresVerification: true,
      message: "A 6-digit verification code has been sent to your email. It expires in 10 minutes.",
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 503;
    console.error("Register/send verification code error:", error);
    return res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Could not send the verification email. Check your SMTP settings.",
    });
  }
}

// Step 2: verify the email code and create the account.
export async function verifyEmail(req: Request, res: Response) {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!validEmailSyntax(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: "Enter the email address and 6-digit code." });
    }

    const result = await validateCode(email, "verify_email", code);
    if (result.error || !result.record) {
      return res.status(400).json({ success: false, message: result.error || "Invalid code." });
    }

    const pending = result.record;
    if (!pending.signupName || !pending.passwordHash) {
      await pending.deleteOne();
      return res.status(400).json({ success: false, message: "Registration expired. Please create your account again." });
    }

    let user;
    try {
      // Password was bcrypt-hashed before being stored in the temporary signup record.
      // Insert the already-hashed value directly so it is not hashed a second time.
      const now = new Date();
      const inserted = await User.collection.insertOne({
        name: pending.signupName,
        email,
        password: pending.passwordHash,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      user = await User.findById(inserted.insertedId);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        return res.status(409).json({ success: false, message: "An account with this email already exists. Please sign in." });
      }
      throw error;
    }

    await pending.deleteOne();
    if (!user) throw new Error("Account was created but could not be loaded.");

    const token = createToken(user._id.toString());
    const userPayload = await getUserPayload(user._id.toString());
    return res.status(201).json({ success: true, token, user: userPayload });
  } catch (error) {
    console.error("Email verification error:", error);
    return res.status(500).json({ success: false, message: "Unable to verify email and create account." });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    // Legacy accounts without the field are treated as existing accounts. New accounts are only created after email verification.
    user.lastLogin = new Date();
    await user.save();

    const token = createToken(user._id.toString());
    const userPayload = await getUserPayload(user._id.toString());
    return res.json({ success: true, token, user: userPayload });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: "Unable to sign in." });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const email = normalizeEmail(req.body?.email);
  if (!validEmailSyntax(email)) {
    return res.status(400).json({ success: false, message: "Enter a valid email address." });
  }

  try {
    const user = await User.findOne({ email });
    // Do not disclose whether an account exists.
    if (user) {
      await sendCode(email, "reset_password");
    }

    return res.json({
      success: true,
      message: "If an account exists for that email, a password reset code has been sent.",
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status || 503;
    console.error("Forgot password error:", error);
    return res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Could not send a reset email. Check SMTP settings.",
    });
  }
}

export async function resetPassword(req: Request, res: Response) {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    const password = String(req.body?.password || "");

    if (!validEmailSyntax(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: "Enter the email address and 6-digit code." });
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters and contain a letter and a number." });
    }

    const result = await validateCode(email, "reset_password", code);
    if (result.error || !result.record) {
      return res.status(400).json({ success: false, message: result.error || "Invalid code." });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      await result.record.deleteOne();
      return res.status(400).json({ success: false, message: "Invalid or expired reset code." });
    }

    user.password = password;
    await user.save();
    await result.record.deleteOne();

    return res.json({
      success: true,
      message: "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ success: false, message: "Unable to reset password." });
  }
}

export async function me(req: Request, res: Response) {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    if (!userId) return res.status(401).json({ success: false, message: "Authentication required." });
    const user = await getUserPayload(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, user });
  } catch (error) {
    console.error("Get current user error:", error);
    return res.status(500).json({ success: false, message: "Unable to load account." });
  }
}
