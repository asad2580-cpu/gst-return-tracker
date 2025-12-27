import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { Resend } from 'resend';
import jwt from "jsonwebtoken";
import { db } from "./db"; 
import { users, otpCodes, passwordHistory } from "@shared/schema"; 
import { eq, and, desc } from "drizzle-orm"; 
import cookieParser from "cookie-parser";

export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_SECONDS = 7 * 24 * 60 * 60; 
const SALT_ROUNDS = 10;

const resend = new Resend(process.env.RESEND_API_KEY);
/* ---- Helper Functions ---- */
function signAccess(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}
function signRefresh(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${REFRESH_EXPIRES_SECONDS}s` });
}

/* ---- Middleware ---- */
export async function attachUserFromHeader(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = String(req.headers.authorization || "");
    if (auth.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      const payload = jwt.verify(token, JWT_SECRET) as any;
      
      if (payload?.sub) {
        const results = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
        const row = results[0];
        if (row) {
          (req as any).user = row;
          (req as any).isAuthenticated = () => true;
        }
      }
    }
  } catch (err) { /* Silent fail */ }
  next();
}

const router = Router();
router.use(cookieParser());

/* ---- Auth Routes ---- */

// 1. REGISTER
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, adminEmail, otp, adminOtp } = req.body;
    const now = Date.now();
    const normalizedEmail = email.toLowerCase().trim();

    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: "Email and 8-character password required." });
    }

    let createdBy: string | null = null;

    if (role === "admin") {
      const otpRows = await db.select().from(otpCodes).where(and(eq(otpCodes.email, normalizedEmail), eq(otpCodes.type, 'identity'))).limit(1);
      const identityProof = otpRows[0];
      if (!identityProof || String(identityProof.otp) !== String(otp) || now > identityProof.expiresAt.getTime()) {
        return res.status(400).json({ error: "Invalid or expired Identity OTP." });
      }
      await db.delete(otpCodes).where(and(eq(otpCodes.email, normalizedEmail), eq(otpCodes.type, 'identity')));
    } else if (role === "staff") {
      if (!adminEmail || !adminOtp) return res.status(400).json({ error: "Staff registration requires Admin credentials." });
      const normalizedAdminEmail = adminEmail.toLowerCase().trim();
      const idRows = await db.select().from(otpCodes).where(and(eq(otpCodes.email, normalizedEmail), eq(otpCodes.type, 'identity'))).limit(1);
      if (!idRows[0] || String(idRows[0].otp) !== String(otp) || now > idRows[0].expiresAt.getTime()) {
        return res.status(400).json({ error: "Your identity OTP is invalid or expired." });
      }
      const authRows = await db.select().from(otpCodes).where(and(eq(otpCodes.email, normalizedAdminEmail), eq(otpCodes.type, 'authorization'))).limit(1);
      if (!authRows[0] || String(authRows[0].otp) !== String(adminOtp) || now > authRows[0].expiresAt.getTime()) {
        return res.status(400).json({ error: "The Admin Authorization OTP is invalid or expired." });
      }
      const adminRows = await db.select().from(users).where(and(eq(users.email, normalizedAdminEmail), eq(users.role, 'admin'))).limit(1);
      if (!adminRows[0]) return res.status(400).json({ error: "Admin email not found." });
      createdBy = adminRows[0].id;
      await db.delete(otpCodes).where(eq(otpCodes.email, normalizedEmail));
      await db.delete(otpCodes).where(eq(otpCodes.email, normalizedAdminEmail));
    }

    const existing = await db.select().from(users).where(eq(users.username, normalizedEmail)).limit(1);
    if (existing[0]) return res.status(409).json({ error: "Email already registered." });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const [newUser] = await db.insert(users).values({
      username: normalizedEmail,
      email: normalizedEmail,
      password: hash,
      name: name || "User",
      role: role,
      createdBy: createdBy,
    }).returning();

    const access = signAccess({ sub: newUser.id });
    const refresh = signRefresh({ sub: newUser.id });

    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });

    return res.status(201).json({ user: newUser, accessToken: access });
  } catch (err) {
    console.error("Registration Error:", err);
    return res.status(500).json({ error: "Server error during registration." });
  }
});

// 2. LOGIN (Standard)
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const results = await db.select().from(users).where(eq(users.username, normalizedEmail)).limit(1);
    const user = results[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const { password: _, ...userWithoutPassword } = user;
    const access = signAccess({ sub: user.id });
    const refresh = signRefresh({ sub: user.id });

    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });

    return res.json({ user: userWithoutPassword, accessToken: access });
  } catch (err) {
    return res.status(500).json({ error: "Login failed" });
  }
});

// 3. GOOGLE LOGIN (The missing piece!)
router.post("/google-login", async (req: Request, res: Response) => {
  try {
    const { email, name, photoURL } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    let results = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    let user = results[0];

    // If user doesn't exist, create a new "Staff" account for them
    if (!user) {
      const [newUser] = await db.insert(users).values({
        username: normalizedEmail,
        email: normalizedEmail,
        password: "GOOGLE_AUTH_USER", // Dummy password
        name: name || "Google User",
        role: "admin", // Default role
      }).returning();
      user = newUser;
    }

    const access = signAccess({ sub: user.id });
    const refresh = signRefresh({ sub: user.id });

    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });

    return res.json({ user, accessToken: access });
  } catch (err) {
    console.error("Google Auth Error:", err);
    return res.status(500).json({ error: "Google authentication failed" });
  }
});

// 4. REFRESH TOKEN
router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: "No refresh token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const results = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    const user = results[0];

    if (!user) return res.status(401).json({ error: "User not found" });

    const newAccess = signAccess({ sub: user.id });
    return res.json({ accessToken: newAccess });
  } catch (err) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// 5. LOGOUT
router.post("/logout", (req, res) => {
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
  return res.json({ message: "Logged out successfully" });
});


// 1. Request Password Reset OTP
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Verify the user actually exists in our system
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    
    if (!user) {
      // Security Tip: We return 200 even if user doesn't exist to prevent email harvesting,
      // but for internal apps, a 404 is often more helpful. Let's stay helpful:
      return res.status(404).json({ error: "No account found with this email." });
    }

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 Min expiry

    // 3. Store in otpCodes table
    // Add this inside your forgot-password route
await db.insert(otpCodes).values({
  email: normalizedEmail,
  otp: otp,
  type: 'password_reset',
  expiresAt: expiresAt,
  lastSentAt: new Date(), // This satisfies the schema requirement
}).onConflictDoUpdate({
  target: [otpCodes.email, otpCodes.type],
  set: {
    otp: otp,
    expiresAt: expiresAt,
    lastSentAt: new Date(),
  }
});

    // 4. Send via Resend
    await resend.emails.send({
      from: 'fileDX <no-reply@filedx.co.in>',
      to: normalizedEmail,
      subject: 'Password Reset Code - fileDX',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Use the code below:</p>
          <h1 style="color: #2563eb; letter-spacing: 5px;">${otp}</h1>
          <p>This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });

    return res.json({ message: "Reset code sent successfully." });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    return res.status(500).json({ error: "Failed to process request." });
  }
});

// 2. Final Password Update
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  // 1. Standard OTP and User checks...
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // 2. Fetch Password History
  const history = await db.select()
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, user.id))
    .orderBy(desc(passwordHistory.createdAt))
    .limit(5);

  // 3. Compare new password against current and history
  const allPastPasswords = [user.password, ...history.map(h => h.passwordHash)];
  
  for (const oldHash of allPastPasswords) {
    const isMatch = await bcrypt.compare(newPassword, oldHash);
    if (isMatch) {
      return res.status(400).json({ 
        error: "You cannot use any of your last 5 passwords. Please choose a new one." 
      });
    }
  }

  // 4. Update password and add to history
  const newHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ password: newHash }).where(eq(users.id, user.id));
  await db.insert(passwordHistory).values({ userId: user.id, passwordHash: newHash });

  res.json({ message: "Password updated successfully!" });
});

// 6. GET ME
router.get("/me", async (req: Request, res: Response) => {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "No auth header" });
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const results = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!results[0]) return res.status(404).json({ error: "User not found" });
    return res.json({ user: results[0] });
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

export default router;

export function setupAuth(app: any) {
  app.use("/api/auth", router);
}