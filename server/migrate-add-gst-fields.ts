import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "app.db");
const db = new Database(dbPath);

console.log("Adding new fields to database...");

try {
  // Check if columns exist in clients table
  const clientsInfo = db.prepare("PRAGMA table_info(clients);").all();
  const hasGstUsername = clientsInfo.some((c: any) => c.name === "gstUsername");
  
  if (!hasGstUsername) {
    console.log("Adding gstUsername, gstPassword, remarks to clients table...");
    db.prepare("ALTER TABLE clients ADD COLUMN gstUsername TEXT;").run();
    db.prepare("ALTER TABLE clients ADD COLUMN gstPassword TEXT;").run();
    db.prepare("ALTER TABLE clients ADD COLUMN remarks TEXT;").run();
    console.log("✓ Added fields to clients table");
  } else {
    console.log("✓ Clients table already has new fields");
  }

  // Check if remarks exists in gstReturns table
  const returnsInfo = db.prepare("PRAGMA table_info(gstReturns);").all();
  const hasRemarks = returnsInfo.some((c: any) => c.name === "remarks");
  
  if (!hasRemarks) {
    console.log("Adding remarks to gstReturns table...");
    db.prepare("ALTER TABLE gstReturns ADD COLUMN remarks TEXT;").run();
    console.log("✓ Added remarks to gstReturns table");
  } else {
    console.log("✓ gstReturns table already has remarks field");
  }

  console.log("\n✓ Migration complete!");
} catch (error) {
  console.error("Migration failed:", error);
} finally {
  db.close();
}