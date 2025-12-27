import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db"; 
import { users, otpCodes } from "@shared/schema"; 
import { eq, and } from "drizzle-orm"; 
import cookieParser from "cookie-parser";

export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_SECONDS = 7 * 24 * 60 * 60; 
const SALT_ROUNDS = 10;

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