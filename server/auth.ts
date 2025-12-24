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
    const { email, password, name, role, adminEmail, otp } = req.body;

    // 1. Basic Validation
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: "Invalid input: Email and 8-char password required" });
    }
    if (!["admin", "staff"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // 2. Email Availability Check
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return res.status(409).json({ error: "Email already exists" });

    let createdBy: number | null = null;

    // 3. OTP & Role Specific Logic
    if (role === "admin") {
      // ADMINS verify their OWN email
      const normalizedEmail = email.toLowerCase().trim();
      const record = db.prepare("SELECT otp, expires FROM otp_codes WHERE admin_email = ?")
                       .get(normalizedEmail) as any;

      if (!record || String(record.otp) !== String(otp) || Date.now() > record.expires) {
        return res.status(400).json({ error: "Invalid or expired OTP code" });
      }
      db.prepare("DELETE FROM otp_codes WHERE admin_email = ?").run(normalizedEmail);

    } else if (role === "staff") {
      // STAFF verify using the code sent to their MANAGER'S email
      if (!adminEmail || !otp) {
        return res.status(400).json({ error: "Admin Email and OTP are required for staff registration" });
      }
      const normalizedAdminEmail = adminEmail.toLowerCase().trim();
      
      const record = db.prepare("SELECT otp, expires FROM otp_codes WHERE admin_email = ?")
                       .get(normalizedAdminEmail) as any;

      if (!record || String(record.otp) !== String(otp) || Date.now() > record.expires) {
        return res.status(400).json({ error: "Invalid or expired OTP. Verify with your Manager." });
      }

      const adminRow = db.prepare("SELECT id, role FROM users WHERE email = ?").get(normalizedAdminEmail) as any;
      if (!adminRow || adminRow.role !== "admin") {
        return res.status(400).json({ error: "The provided Admin Email does not belong to an Admin" });
      }
      
      createdBy = adminRow.id;
      db.prepare("DELETE FROM otp_codes WHERE admin_email = ?").run(normalizedAdminEmail);
    }

    // 4. Create User
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const info = db
      .prepare("INSERT INTO users (email, password_hash, name, role, created_by) VALUES (?, ?, ?, ?, ?)")
      .run(email, hash, name || null, role, createdBy);

    const user = { id: info.lastInsertRowid, email, name, role, created_by: createdBy };

    // 5. Generate Tokens
    const access = signAccess({ sub: user.id });
    const refresh = signRefresh({ sub: user.id });

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
    return res.status(500).json({ error: "Internal server error during registration" });
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