import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "./simple-db";
import cookieParser from "cookie-parser";

export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SALT_ROUNDS = 10;

/* ---- Helper Functions ---- */
function signAccess(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}
function signRefresh(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${REFRESH_EXPIRES_SECONDS}s` });
}

/* ---- Middleware ---- */
export function attachUserFromHeader(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = String(req.headers.authorization || "");
    if (auth.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      const payload = jwt.verify(token, JWT_SECRET) as any;
      if (payload?.sub) {
        const row = db
          .prepare("SELECT id, email, name, role, created_by FROM users WHERE id = ?")
          .get(payload.sub);
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

// REGISTER
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, adminEmail, otp, adminOtp } = req.body;
    const now = Date.now();

    // 1. Basic Validation
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: "Email and 8-character password required." });
    }

    // 2. Role-Based Verification Logic
    let createdBy: number | null = null;
    const normalizedEmail = email.toLowerCase().trim();

    if (role === "admin") {
      // --- ADMIN PATH: Identity Verification Only ---
      const identityProof = db.prepare(
        "SELECT otp, expires_at FROM otp_codes WHERE email = ? AND type = 'identity'"
      ).get(normalizedEmail) as any;

      if (!identityProof || String(identityProof.otp) !== String(otp) || now > identityProof.expires_at) {
        return res.status(400).json({ error: "Invalid or expired Identity OTP." });
      }
      // Clean up
      db.prepare("DELETE FROM otp_codes WHERE email = ? AND type = 'identity'").run(normalizedEmail);

    } else if (role === "staff") {
      // --- STAFF PATH: Identity AND Authorization (Dual-Key) ---
      if (!adminEmail || !adminOtp) {
        return res.status(400).json({ error: "Staff registration requires Admin email and Admin OTP." });
      }
      const normalizedAdminEmail = adminEmail.toLowerCase().trim();

      // Check Key 1: Staff's own Identity
      const identityProof = db.prepare(
        "SELECT otp, expires_at FROM otp_codes WHERE email = ? AND type = 'identity'"
      ).get(normalizedEmail) as any;

      if (!identityProof || String(identityProof.otp) !== String(otp) || now > identityProof.expires_at) {
        return res.status(400).json({ error: "Your identity OTP is invalid or expired." });
      }

      // Check Key 2: Admin's Authorization
      const authProof = db.prepare(
        "SELECT otp, expires_at FROM otp_codes WHERE email = ? AND type = 'authorization'"
      ).get(normalizedAdminEmail) as any;

      if (!authProof || String(authProof.otp) !== String(adminOtp) || now > authProof.expires_at) {
        return res.status(400).json({ error: "The Admin Authorization OTP is invalid or expired." });
      }

      // Verify the Admin exists and is actually an Admin
      const adminUser = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'admin'").get(normalizedAdminEmail) as any;
      if (!adminUser) {
        return res.status(400).json({ error: "The provided Admin email is not registered as an Admin." });
      }
      
      createdBy = adminUser.id;

      // Clean up both codes
      db.prepare("DELETE FROM otp_codes WHERE email = ? AND type = 'identity'").run(normalizedEmail);
      db.prepare("DELETE FROM otp_codes WHERE email = ? AND type = 'authorization'").run(normalizedAdminEmail);
    }

    // 3. User Creation (The Final Gate)
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
    if (existing) return res.status(409).json({ error: "This email is already registered." });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const info = db.prepare(
      "INSERT INTO users (email, password_hash, name, role, created_by) VALUES (?, ?, ?, ?, ?)"
    ).run(normalizedEmail, hash, name || null, role, createdBy);

    const user = { id: info.lastInsertRowid, email: normalizedEmail, name, role, created_by: createdBy };
    const access = signAccess({ sub: user.id });
    const refresh = signRefresh({ sub: user.id });

    // Set Refresh Cookie
    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });

    return res.status(201).json({ user, accessToken: access });
  } catch (err) {
    console.error("Registration Error:", err);
    return res.status(500).json({ error: "Server error during registration." });
  }
});

// LOGIN
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const access = signAccess({ sub: row.id });
    const refresh = signRefresh({ sub: row.id });

    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });

    return res.json({
      user: { id: row.id, email: row.email, name: row.name, role: row.role },
      accessToken: access,
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Server error during login" });
  }
});

// REFRESH
router.post("/refresh", (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: "No refresh token" });

    const payload = jwt.verify(token, JWT_SECRET) as any;
    const newAccess = signAccess({ sub: payload.sub });
    const newRefresh = signRefresh({ sub: payload.sub });

    res.cookie("refreshToken", newRefresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });

    return res.json({ accessToken: newAccess });
  } catch (err) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// server/auth.ts

router.post("/google-login", async (req: Request, res: Response) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // 1. Fetch the FULL user record including role
    let user = db.prepare("SELECT id, email, name, role, created_by FROM users WHERE email = ?").get(email) as any;

    if (!user) {
      // 2. If they truly don't exist, create them as admin (first time)
      const dummyHash = await bcrypt.hash(Math.random().toString(36), 10);
      const info = db.prepare(
        "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)"
      ).run(email, dummyHash, name || "New Admin", "admin");

      user = { id: info.lastInsertRowid, email, name, role: "admin", created_by: null };
    }

    // 3. IMPORTANT: Explicitly structure the user object for the frontend
    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role, // This ensures it doesn't show as 'unknown'
      created_by: user.created_by
    };

    const access = signAccess({ sub: user.id });
    const refresh = signRefresh({ sub: user.id });

    res.cookie("refreshToken", refresh, {
      httpOnly: true,
      maxAge: REFRESH_EXPIRES_SECONDS * 1000,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/refresh",
    });

    // Send back the full structured payload
    return res.json({ user: userPayload, accessToken: access });
  } catch (err) {
    console.error("Google Auth Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// LOGOUT
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
  return res.json({ success: true });
});

// GET ME
router.get("/me", (req: Request, res: Response) => {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "No auth header" });
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const user = db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(payload.sub);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
});

export default router;

export function setupAuth(appOrServer: any, maybeApp?: any) {
  const app = (appOrServer && typeof appOrServer.use === "function") ? appOrServer : maybeApp;
  if (app) {
    app.use("/api/auth", router);
  } else {
    console.warn("setupAuth: could not find Express app to mount auth router");
  }
}