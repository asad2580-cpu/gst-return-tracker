// server/simple-db.ts
// Simple SQLite helper (ESM-friendly)

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

// recreate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db: any = new Database(path.join(__dirname, "app.db"));
db.exec("PRAGMA foreign_keys = ON");

// create table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'staff',
    created_by INTEGER DEFAULT NULL
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gstin TEXT UNIQUE NOT NULL,
    assignedToId INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignedToId) REFERENCES users(id) ON DELETE SET NULL
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS gstReturns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clientId INTEGER NOT NULL,
    month TEXT NOT NULL,
    gstr1 TEXT NOT NULL DEFAULT 'Pending',
    gstr3b TEXT NOT NULL DEFAULT 'Pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(clientId, month),
    FOREIGN KEY (clientId) REFERENCES clients(id) ON DELETE CASCADE
  );
`).run();

// Add after the existing users table creation
db.prepare(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gstin TEXT UNIQUE NOT NULL,
    assignedToId INTEGER,
    gstUsername TEXT,
    gstPassword TEXT,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS gstReturns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clientId INTEGER NOT NULL,
    month TEXT NOT NULL,
    gstr1 TEXT DEFAULT 'Pending',
    gstr3b TEXT DEFAULT 'Pending',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (clientId) REFERENCES clients(id)
  );
`).run();


export default db;
