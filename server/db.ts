import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is missing! Please add it to your .env file.");
}

/**
 * 1. The Connection Client
 * 'postgres-js' is the recommended driver for Neon/Serverless Postgres.
 */
const client = postgres(process.env.DATABASE_URL);

/**
 * 2. The Drizzle Instance
 * This is what you will import in your routes to talk to the DB.
 */
export const db = drizzle(client, { schema });

// Export the client if you ever need to close the connection manually (rarely used)
export { client };

console.log("🐘 Connected to Neon PostgreSQL");