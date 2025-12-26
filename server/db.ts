import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws'; // Make sure to npm install ws
import * as schema from "@shared/schema";
import dotenv from "dotenv";

dotenv.config();

// Required for Node.js environments to support WebSockets
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is missing!");
}

// Use a Connection Pool for better stability with Drizzle
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

// Export pool so other parts of the app (like session stores) can use it
export { pool };

console.log("🐘 Database initialized with Neon Serverless (WebSocket Mode)");