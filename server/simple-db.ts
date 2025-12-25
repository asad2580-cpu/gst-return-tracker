// server/simple-db.ts
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db: any = new Database(path.join(__dirname, "app.db"));
db.exec("PRAGMA foreign_keys = ON");

// 1. Users Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'staff',
    created_by INTEGER DEFAULT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );
`).run();

// 2. Clients Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gstin TEXT UNIQUE NOT NULL,
    assignedToId INTEGER DEFAULT NULL,
    gstUsername TEXT,
    gstPassword TEXT,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignedToId) REFERENCES users(id) ON DELETE SET NULL
  );
`).run();

// 3. GST Returns Table
db.prepare(`
  CREATE TABLE IF NOT EXISTS gstReturns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clientId INTEGER NOT NULL,
    month TEXT NOT NULL,
    gstr1 TEXT NOT NULL DEFAULT 'Pending',
    gstr3b TEXT NOT NULL DEFAULT 'Pending',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clientId, month),
    FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
  );
`).run();

// 4. OTP Codes Table (Clean & Unified)
// 4. OTP Codes Table (Clean & Unified)
// Using a single backtick string for the entire block
db.exec(`
  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    type TEXT NOT NULL, 
    expires_at INTEGER NOT NULL,
    attempt_count INTEGER DEFAULT 0,
    last_sent_at INTEGER NOT NULL,
    UNIQUE(email, type)
  );
`);

console.log("✅ Database initialized and OTP table locked.");

export default db;