import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "./db"; // New Postgres + Drizzle connection
import { users, otpCodes } from "@shared/schema"; // Import schemas
import { eq, and } from "drizzle-orm"; // Import helpers
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
        // DRIZZLE TRANSLATION: SELECT with a WHERE clause
        const results = await db
          .select()
          .from(users)
          .where(eq(users.id, payload.sub))
          .limit(1);
          
        const row = results[0];
        if (row) {
          (req as any).user = row;
          (req as any).isAuthenticated = () => true;
        }
      }
    }
  } catch (err) {
    // Silent fail for invalid tokens
  }
  next();
}

const router = Router();
router.use(cookieParser());

/* ---- Auth Routes ---- */

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, adminEmail, otp, adminOtp } = req.body;
    const now = Date.now();
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Basic Validation (Logic stays same)
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: "Email and 8-character password required." });
    }

    let createdBy: string | null = null; // UUIDs are strings

    if (role === "admin") {
      // DRIZZLE: Check Identity OTP
      const otpRows = await db
        .select()
        .from(otpCodes)
        .where(and(eq(otpCodes.email, normalizedEmail), eq(otpCodes.type, 'identity')))
        .limit(1);
      
      const identityProof = otpRows[0];

      if (!identityProof || String(identityProof.otp) !== String(otp) || now > identityProof.expiresAt.getTime()) {
        return res.status(400).json({ error: "Invalid or expired Identity OTP." });
      }
      
      // DRIZZLE: Cleanup OTP
      await db.delete(otpCodes).where(and(eq(otpCodes.email, normalizedEmail), eq(otpCodes.type, 'identity')));

    } else if (role === "staff") {
      if (!adminEmail || !adminOtp) return res.status(400).json({ error: "Staff registration requires Admin credentials." });
      
      const normalizedAdminEmail = adminEmail.toLowerCase().trim();

      // Check Key 1: Identity
      const idRows = await db.select().from(otpCodes).where(and(eq(otpCodes.email, normalizedEmail), eq(otpCodes.type, 'identity'))).limit(1);
      if (!idRows[0] || String(idRows[0].otp) !== String(otp) || now > idRows[0].expiresAt.getTime()) {
        return res.status(400).json({ error: "Your identity OTP is invalid or expired." });
      }

      // Check Key 2: Admin Auth
      const authRows = await db.select().from(otpCodes).where(and(eq(otpCodes.email, normalizedAdminEmail), eq(otpCodes.type, 'authorization'))).limit(1);
      if (!authRows[0] || String(authRows[0].otp) !== String(adminOtp) || now > authRows[0].expiresAt.getTime()) {
        return res.status(400).json({ error: "The Admin Authorization OTP is invalid or expired." });
      }

      // Verify Admin exists
      const adminRows = await db.select().from(users).where(and(eq(users.email, normalizedAdminEmail), eq(users.role, 'admin'))).limit(1);
      if (!adminRows[0]) return res.status(400).json({ error: "Admin email not found." });
      
      createdBy = adminRows[0].id;

      // Clean up
      await db.delete(otpCodes).where(eq(otpCodes.email, normalizedEmail));
      await db.delete(otpCodes).where(eq(otpCodes.email, normalizedAdminEmail));
    }

    // 3. User Creation
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, normalizedEmail))
      .limit(1);

    if (existing[0]) return res.status(409).json({ error: "Email already registered." });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    
    // DRIZZLE: Insert returns the inserted object using .returning()
    const [newUser] = await db.insert(users).values({
      username: normalizedEmail,
      email: normalizedEmail,
      password: hash,
      name: name || null,
      role: role,
      createdBy: createdBy,
    }).returning();

    const { password: _, ...userWithoutPassword } = newUser;

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

// LOGIN (Simplified Translation)
router.post("/login", async (req: Request, res: Response) => {
  try {
    // 1. Get credentials from the request body and clean the email
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // 2. Query Postgres using Drizzle. 
    // We use 'username' here because your schema uses that as the unique login ID.
    // .limit(1) makes the query faster by stopping after the first match.
    const results = await db
      .select()
      .from(users)
      .where(eq(users.username, normalizedEmail))
      .limit(1);

    const user = results[0];

    // 3. Verify if user exists AND if the password matches the hashed version in DB
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 4. SECURITY STEP: Strip the password hash from the user object.
    // We use 'rest' (userWithoutPassword) to send data to the frontend safely.
    const { password: _, ...userWithoutPassword } = user;

    // 5. Generate JWT tokens for the session
    const access = signAccess({ sub: user.id });
    const refresh = signRefresh({ sub: user.id });

    // 6. Set the Refresh Token in a secure, HTTP-only cookie.
    // This prevents Javascript from stealing the token (XSS protection).
    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production", // Only use HTTPS in production
      path: "/api/auth/refresh",
    });

    // 7. Send back the safe user data and the short-lived access token
    return res.json({ 
      user: userWithoutPassword, 
      accessToken: access 
    });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

// GET ME
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

// ... Keep Google Login, Refresh, Logout (They use the same logic pattern above) ...

export default router;

export function setupAuth(app: any) {
  app.use("/api/auth", router);
}