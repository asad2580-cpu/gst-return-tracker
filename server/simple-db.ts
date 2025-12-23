// server/simple-db.ts
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db: any = new Database(path.join(__dirname, "app.db"));
db.exec("PRAGMA foreign_keys = ON");

// 1. Users Table (Added Foreign Key for created_by)
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

// 2. Clients Table (Merged with GST credentials and remarks)
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

// 3. GST Returns Table (Merged with status and unique constraint)
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

// server/simple-db.ts
db.prepare(`
  CREATE TABLE IF NOT EXISTS otp_codes (
    admin_email TEXT PRIMARY KEY,
    otp TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
`).run();

export default db;