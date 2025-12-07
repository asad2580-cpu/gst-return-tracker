// server/db.ts
// Support two modes:
// 1) If DATABASE_URL is present -> use Postgres + drizzle (original behavior).
// 2) If no DATABASE_URL -> fallback to local simple-db (better-sqlite3) for dev/testing.

import * as schema from "@shared/schema";

// static imports (no require / top-level await)
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
// import local fallback DB (works with TS -> ESM output)
import simpleDbModule from "./simple-db";

let pool: any = undefined;
let db: any = undefined;

if (process.env.DATABASE_URL) {
  // Use Postgres + drizzle when DATABASE_URL is set
  const { Pool } = pg as any;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
  console.log("Using Postgres via DATABASE_URL");
} else {
  // Fallback to local sqlite simple-db
  // simpleDbModule may be the default export or the module object depending on transpile
  const simpleDb = (simpleDbModule && (simpleDbModule as any).default) ?? simpleDbModule;
  db = simpleDb;
  console.warn("DATABASE_URL not set — using local simple-db (SQLite) for development.");
}

export { pool, db };
export default { pool, db } as const;
