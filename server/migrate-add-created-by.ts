// server/migrate-add-created-by.ts
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

// recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "app.db");
const db = new Database(dbPath);

console.log("Connected to", dbPath);

// Check if column exists
const info = db.prepare("PRAGMA table_info(users);").all();
const hasCreatedBy = info.some((c: any) => c.name === "created_by");

if (hasCreatedBy) {
  console.log("Column 'created_by' already exists — nothing to do.");
  db.close();
  process.exit(0);
}

console.log("Adding 'created_by' column to users table...");
db.prepare("ALTER TABLE users ADD COLUMN created_by INTEGER DEFAULT NULL;").run();
console.log("Done. 'created_by' column added.");

db.close();
