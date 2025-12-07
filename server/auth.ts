// server/auth.ts
import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import db from "./simple-db";
import cookieParser from "cookie-parser";
import type { Express } from "express";

/**
 * Exports:
 *  - default: router (mount it on /api/auth via setupAuth)
 *  - named: attachUserFromHeader(req,res,next) -> middleware to attach req.user
 *  - named: setupAuth(appOrServer, maybeApp) -> helper that mounts router
 */

export const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SALT_ROUNDS = 10;

function signAccess(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}
function signRefresh(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${REFRESH_EXPIRES_SECONDS}s` });
}

/**
 * Middleware: read Bearer token, verify and attach user to req
 * Exported so routes.ts can mount it globally (app.use(attachUserFromHeader))
 */
export function attachUserFromHeader(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = String(req.headers.authorization || "");
    console.log("attachUserFromHeader auth header:", auth);
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
    // invalid token -> do not block here; requireAuth will handle auth failure
  }
  next();
}

const router = Router();

// cookie parser only for auth routes
router.use(cookieParser());
router.use((req, _res, next) => {
  next();
});

/* ---- auth route handlers ---- */

// Register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, role, adminEmail } = req.body;

    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "Invalid input" });
    }

    if (!["admin", "staff"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // If staff registration includes adminEmail, validate it and lookup admin id
    let createdBy: number | null = null;
    if (role === "staff") {
      if (!adminEmail) {
        return res.status(400).json({ error: "adminEmail is required when registering as staff" });
      }
      const adminRow = db.prepare("SELECT id, role FROM users WHERE email = ?").get(adminEmail);
      if (!adminRow || adminRow.role !== "admin") {
        return res.status(400).json({ error: "Invalid adminEmail: admin not found" });
      }
      createdBy = adminRow.id;
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return res.status(409).json({ error: "Email already exists" });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const info = db
      .prepare("INSERT INTO users (email, password_hash, name, role, created_by) VALUES (?, ?, ?, ?, ?)")
      .run(email, hash, name || null, role, createdBy);

    const user = { id: info.lastInsertRowid, email, name, role, created_by: createdBy };

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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Invalid input" });

    const row = db
      .prepare("SELECT id, email, password_hash, name, role FROM users WHERE email = ?")
      .get(email);
    if (!row) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

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
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Refresh
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
    console.error(err);
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// Logout
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
  return res.json({ success: true });
});

// Protected /me
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

/**
 * Helper to mount auth router. Two calling patterns supported:
 *   setupAuth(app)
 *   setupAuth(httpServer, app)
 */
export function setupAuth(appOrServer: any, maybeApp?: any) {
  if (appOrServer && typeof appOrServer.use === "function") {
    appOrServer.use("/api/auth", router);
    return;
  }
  if (maybeApp && typeof maybeApp.use === "function") {
    maybeApp.use("/api/auth", router);
    return;
  }
  console.warn("setupAuth: could not find Express app to mount auth router");
}
