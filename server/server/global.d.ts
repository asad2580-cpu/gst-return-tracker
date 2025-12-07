// server/global.d.ts
import type { Request } from "express";

/**
 * Inform TypeScript that Express's Request has an optional `user` property.
 * Adjust fields on the user object to match what your auth middleware attaches.
 */
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: number;
      email?: string;
      name?: string;
      role?: "admin" | "staff" | string;
      // add other fields you set on req.user, if any
    }
  }
}
