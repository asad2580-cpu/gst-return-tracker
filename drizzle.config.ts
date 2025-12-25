import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./shared/schema.ts", // Point to your schema
  out: "./drizzle",            // Where migration files live
  dialect: "postgresql",       // Tell it we are using Postgres
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Use the secret from .env
  },
});