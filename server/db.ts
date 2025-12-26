import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";
import dotenv from "dotenv";

dotenv.config();

// Required for Neon serverless environments to cache connections efficiently
neonConfig.fetchConnectionCache = true;

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is missing! Please add it to your .env file.");
}

// 1. The Neon HTTP Connection
const sql = neon(process.env.DATABASE_URL);

// 2. The Drizzle Instance (using neon-http)
export const db = drizzle(sql, { schema });

console.log("🐘 Database initialized with Neon Serverless (HTTP)");