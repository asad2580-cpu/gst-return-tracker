// server/global.d.ts
import type { Request } from "express";

/**
 * Extend Express Request with the runtime fields provided by the auth middleware:
 * - user: the decoded user object that middleware attaches
 * - isAuthenticated(): optional function (passport-style)
 *
 * This file is purely for TypeScript; no runtime effect.
 */
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: number;
      email?: string;
      name?: string;
      role?: "admin" | "staff" | string;
      // add other fields you set on req.user, if any
      [key: string]: any;
    };
    /**
     * Some auth middlewares (passport-style) add isAuthenticated() to Request.
     * Mark it optional and type it.
     */
    isAuthenticated?: () => boolean;
  }
}
// Tell TS that better-sqlite3 is a module (no @types needed)
declare module "better-sqlite3";
