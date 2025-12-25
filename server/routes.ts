import { Resend } from 'resend';
import { tempOTPs } from "./otp-store"; // Remove the local tempOTPs variable you added earlier
import * as dotenv from 'dotenv';
import db from "./simple-db";
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { attachUserFromHeader } from "./auth";
import { Router } from "express";

dotenv.config(); 

// 2. Initialize Resend correctly
// Use only ONE declaration for resend
const resend = new Resend(process.env.RESEND_API_KEY);

// 3. Define your router
const router = Router();

// Industry Standard Backoff: 1m, 2m, 5m, 10m, 30m
const BACKOFF_TIMERS = [60, 120, 300, 600, 1800];

function getRequiredWaitTime(attemptCount: number): number {
  // If they've tried more than 5 times, keep it at 30 mins
  const index = Math.min(attemptCount, BACKOFF_TIMERS.length - 1);
  return BACKOFF_TIMERS[index];
}

interface BulkClientInput {
  name: string;
  gstin: string;
  staffEmail: string;
  gstUsername?: string;
  gstPassword?: string;
  remarks?: string;
}



/** Typed auth middlewares (safe checks) */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  // only call isAuthenticated if it's present and a function
  const authed = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : false;
  if (!authed) {
    return res.status(401).json("Unauthorized");
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authed = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : false;
  if (!authed || req.user?.role !== "admin") {
    return res.status(403).json("Forbidden: Admin access required");
  }
  next();
}




export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  app.use(attachUserFromHeader);
  // Ensure Express parses incoming JSON payloads
  app.use(express.json());

  // Temporary memory to store OTPs. 
// Format: { "admin@email.com": { otp: "123456", expires: 1700000000 } }
const tempOTPs: Record<string, { otp: string, expires: number }> = {};

/** Helper to generate a random 6-digit OTP */
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// --- NEW ENDPOINT: VERIFY ADMIN & SEND OTP ---
// server/routes.ts
app.post("/api/verify-admin", async (req, res) => {
  const { adminEmail } = req.body;
  if (!adminEmail) return res.status(400).send("Admin email is required");

  const normalizedAdminEmail = adminEmail.toLowerCase().trim();
  const admin = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'admin'").get(normalizedAdminEmail);
  
  if (!admin) return res.status(404).send("No administrator found.");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000;

  // USE THE NEW SCHEMA COLUMNS: email, type, expires_at
  db.prepare(`
    INSERT OR REPLACE INTO otp_codes (email, otp, type, expires_at, attempt_count, last_sent_at) 
    VALUES (?, ?, 'authorization', ?, 0, ?)
  `).run(normalizedAdminEmail, otp, expiresAt, Date.now());

  try {
    await resend.emails.send({
      from: 'GST Pro <onboarding@resend.dev>',
      to: normalizedAdminEmail,
      subject: 'Staff Registration OTP',
      html: `<p>A staff member is registering. Provide them this code: <strong>${otp}</strong></p>`,
    });
    
    console.log(`--- OTP [${otp}] saved to DB for Admin [${normalizedAdminEmail}] ---`);
    res.json({ message: "OTP sent to your Admin's email." });
  } catch (error) {
    res.status(500).send("Failed to send email via Resend.");
  }
});

  // Get all clients (admin sees all, staff sees only assigned)
  app.get("/api/clients", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const user = req.user;
      let clientsList;
      
      if (user.role === 'admin') {
        // Admin sees ALL clients
        clientsList = db.prepare("SELECT * FROM clients").all();
      } else {
        // Staff only sees their assigned clients
        clientsList = db.prepare("SELECT * FROM clients WHERE assignedToId = ?").all(user.id);
      }

      // Get returns for each client
      const clientsWithReturns = clientsList.map((client: any) => {
        const returns = db.prepare("SELECT * FROM gstReturns WHERE clientId = ?").all(client.id);
        return { ...client, returns };
      });

      res.json(clientsWithReturns);
    } catch (error) {
      console.error("Error fetching clients:", error);
      next(error);
    }
  });

  // Create a new client (admin only)
  // Create a new client (admin only)
app.post("/api/clients", requireAdmin, async (req, res, next) => {
  try {
    const { name, gstin, assignedToId, gstUsername, gstPassword, remarks, previousReturns } = req.body;
    
    // Validate required inputs
    if (!name || !gstin || !assignedToId) {
      return res.status(400).json("Missing required fields: name, gstin, or assignedToId");
    }

    // Validate GSTIN format
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin.toUpperCase())) {
      return res.status(400).json("Invalid GSTIN format");
    }

    // Check if GSTIN already exists
    const existingClient = db.prepare("SELECT * FROM clients WHERE gstin = ?").get(gstin);
    if (existingClient) {
      return res.status(400).json("A client with this GSTIN already exists");
    }

    // Insert new client with all fields
    const result = db.prepare(
      `INSERT INTO clients (name, gstin, assignedToId, gstUsername, gstPassword, remarks) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name, gstin, assignedToId, gstUsername || null, gstPassword || null, remarks || null);

    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(result.lastInsertRowid);

    // Create returns for last 3 months
      // Create returns for last 3 months
const currentDate = new Date();
// Current return period is the previous month (GST returns are filed for previous month)
const returnPeriodDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
const currentReturnPeriod = `${returnPeriodDate.getFullYear()}-${String(returnPeriodDate.getMonth() + 1).padStart(2, '0')}`;
const months = [];
for (let i = 0; i < 3; i++) {
  const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
  months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
}

for (const month of months) {
  // Determine status: if previousReturns is "mark_all_previous" and month is before current return period, mark as Filed
  let status = 'Pending';
  if (previousReturns === 'mark_all_previous') {
  const [y, m] = month.split('-').map(Number);
  const [cy, cm] = currentReturnPeriod.split('-').map(Number);
  const monthDate = new Date(y, m - 1);
  const currentDate = new Date(cy, cm - 1);
  if (monthDate < currentDate) status = 'Filed';
}
  db.prepare(
    "INSERT INTO gstReturns (clientId, month, gstr1, gstr3b) VALUES (?, ?, ?, ?)"
  ).run(client.id, month, status, status);
}

    const returns = db.prepare("SELECT * FROM gstReturns WHERE clientId = ?").all(client.id);
    res.status(201).json({ ...client, returns });
  } catch (error) {
    console.error("Error creating client:", error);
    next(error);
  }
});

// Bulk Create Clients (Admin only)
app.post("/api/clients/bulk", requireAdmin, async (req, res, next) => {
  try {
    const clients = req.body; // Expecting an array of client objects
    if (!Array.isArray(clients)) {
      return res.status(400).json("Data must be an array of clients");
    }

    // 1. Fetch all staff to map Email -> ID (assuming Excel uses email to identify staff)
    // 1. Fetch all staff and normalize their emails for a perfect match
    const staffRows = db.prepare("SELECT id, email FROM users WHERE role = 'staff'").all() as {id: number, email: string}[];
    
    // We create a Map where keys are lowercase and trimmed: ' admin@gmail.com ' becomes 'admin@gmail.com'
    const staffMap = new Map(staffRows.map(s => [s.email.toLowerCase().trim(), s.id]));

    // 2. Prepare the GSTIN regex
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    // 3. START TRANSACTION
    const runTransaction = db.transaction((clientData: BulkClientInput[]) => {
      const results = [];

      for (const item of clientData) {
        // Clean the incoming Excel data
        const name = item.name;
        const gstin = item.gstin?.toUpperCase().trim();
        const staffEmail = item.staffEmail?.toLowerCase().trim();
        const { gstUsername, gstPassword, remarks } = item;

        // Validation: Look up the ID using the cleaned email
        const assignedToId = staffMap.get(staffEmail);
        
        if (!assignedToId) {
          throw new Error(`Staff email "${item.staffEmail}" not found. Please ensure this staff exists in the Staff Management tab.`);
        }

        if (!gstin || !gstinRegex.test(gstin)) {
          throw new Error(`Invalid GSTIN format for client "${name}": ${item.gstin}`);
        }

        // Check for existing GSTIN
        const existing = db.prepare("SELECT name FROM clients WHERE gstin = ?").get(gstin);
        if (existing) {
          throw new Error(`GSTIN ${gstin} is already assigned to "${existing.name}"`);
        }

        // Insert Client
        const result = db.prepare(
          `INSERT INTO clients (name, gstin, assignedToId, gstUsername, gstPassword, remarks) 
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(name, gstin, assignedToId, gstUsername || null, gstPassword || null, remarks || null);

        const clientId = result.lastInsertRowid;

        // Generate 3 months of returns
        const currentDate = new Date();
        for (let i = 0; i < 3; i++) {
          const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          db.prepare(
            "INSERT INTO gstReturns (clientId, month, gstr1, gstr3b) VALUES (?, ?, 'Pending', 'Pending')"
          ).run(clientId, month);
        }
        
        results.push(clientId);
      }
      return results;
    });

    // 4. EXECUTE
    const insertedIds = runTransaction(clients);

    res.status(201).json({ message: `Successfully imported ${insertedIds.length} clients` });
  } catch (error: any) {
    console.error("Bulk import failed:", error);
    // SQLite transactions automatically rollback if an error is thrown inside
    res.status(400).json({ error: error.message });
  }
});

// Update client details (admin only)
app.patch("/api/clients/:id", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const { name, gstin, assignedToId, gstUsername, gstPassword, remarks } = req.body;
    
    // Check if client exists
    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
    if (!client) {
      return res.status(404).json("Client not found");
    }

    // If GSTIN is being changed, validate it
    if (gstin && gstin !== client.gstin) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstin.toUpperCase())) {
        return res.status(400).json("Invalid GSTIN format");
      }

      // Check if new GSTIN already exists
      const existingClient = db.prepare("SELECT * FROM clients WHERE gstin = ? AND id != ?").get(gstin, req.params.id);
      if (existingClient) {
        return res.status(400).json("A client with this GSTIN already exists");
      }
    }

    // Update client
    db.prepare(
      `UPDATE clients 
       SET name = ?, gstin = ?, assignedToId = ?, gstUsername = ?, gstPassword = ?, remarks = ?
       WHERE id = ?`
    ).run(
      name || client.name,
      gstin || client.gstin,
      assignedToId !== undefined ? assignedToId : client.assignedToId,
      gstUsername !== undefined ? gstUsername : client.gstUsername,
      gstPassword !== undefined ? gstPassword : client.gstPassword,
      remarks !== undefined ? remarks : client.remarks,
      req.params.id
    );

    const updatedClient = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
    const returns = db.prepare("SELECT * FROM gstReturns WHERE clientId = ?").all(req.params.id);
    
    res.json({ ...updatedClient, returns });
  } catch (error) {
    console.error("Error updating client:", error);
    next(error);
  }
});

  // Reassign client to different staff (admin only)
  app.patch("/api/clients/:id/assign", requireAdmin, async (req: any, res: any, next: any) => {
    try {
      const { staffId } = req.body;
      if (!staffId) {
        return res.status(400).json("staffId is required");
      }

      // Check if client exists
      const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
      if (!client) {
        return res.status(404).json("Client not found");
      }

      // Update assignment
      db.prepare("UPDATE clients SET assignedToId = ? WHERE id = ?").run(staffId, req.params.id);
      const updatedClient = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
      
      res.json(updatedClient);
    } catch (error) {
      console.error("Error assigning client:", error);
      next(error);
    }
  });

  // Get returns for a specific client
  app.get("/api/clients/:clientId/returns", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.clientId);
      if (!client) {
        return res.status(404).json("Client not found");
      }

      const user = req.user;
      if (user.role !== 'admin' && client.assignedToId !== user.id) {
        return res.status(403).json("Forbidden: Cannot access other staff's clients");
      }

      const returns = db.prepare("SELECT * FROM gstReturns WHERE clientId = ?").all(req.params.clientId);
      res.json(returns);
    } catch (error) {
      console.error("Error fetching returns:", error);
      next(error);
    }
  });

  // Create a return for a specific month (if it doesn't exist)
  app.post("/api/clients/:clientId/returns", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.clientId);
      if (!client) {
        return res.status(404).json("Client not found");
      }

      const user = req.user;
      if (user.role !== 'admin' && client.assignedToId !== user.id) {
        return res.status(403).json("Forbidden: Cannot modify other staff's clients");
      }

      const { month } = req.body;
      if (!month) {
        return res.status(400).json("Month is required");
      }

      // Check if return already exists for this month
      const existingReturn = db.prepare(
        "SELECT * FROM gstReturns WHERE clientId = ? AND month = ?"
      ).get(req.params.clientId, month);
      
      if (existingReturn) {
        return res.json(existingReturn);
      }

      // Create new return
      const result = db.prepare(
        "INSERT INTO gstReturns (clientId, month, gstr1, gstr3b) VALUES (?, ?, 'Pending', 'Pending')"
      ).run(req.params.clientId, month);

      const gstReturn = db.prepare("SELECT * FROM gstReturns WHERE id = ?").get(result.lastInsertRowid);
      res.status(201).json(gstReturn);
    } catch (error) {
      console.error("Error creating return:", error);
      next(error);
    }
  });

  // Update return status (GSTR-1 or GSTR-3B)
  // Update return status (GSTR-1 or GSTR-3B) - Admin only with validation rules
// Update return status (GSTR-1 or GSTR-3B) - Admin only with validation rules
app.patch("/api/returns/:id", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const { gstr1, gstr3b } = req.body;
    
    // Get current return
    const currentReturn: any = db.prepare("SELECT * FROM gstReturns WHERE id = ?").get(req.params.id);
    if (!currentReturn) {
      return res.status(404).json("Return not found");
    }

    // Get previous month's return for validation
    const currentMonth = currentReturn.month;
    const [year, month] = currentMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const prevReturn: any = db.prepare("SELECT * FROM gstReturns WHERE clientId = ? AND month = ?").get(currentReturn.clientId, prevMonth);

    // Validation: Cannot mark as Filed if previous month's GSTR-1 and GSTR-3B are not both Filed
    if (gstr1 === 'Filed' || gstr3b === 'Filed') {
      if (prevReturn && (prevReturn.gstr1 !== 'Filed' || prevReturn.gstr3b !== 'Filed')) {
        return res.status(400).json("Cannot mark as Filed: Previous month's GSTR-1 and GSTR-3B must both be Filed first");
      }
    }

    // Validation: Cannot mark GSTR-3B as Filed until GSTR-1 is Filed
    if (gstr3b === 'Filed') {
      const gstr1Status = gstr1 !== undefined ? gstr1 : currentReturn.gstr1;
      if (gstr1Status !== 'Filed') {
        return res.status(400).json("Cannot mark GSTR-3B as Filed: GSTR-1 must be Filed first");
      }
    }

    // Build update query dynamically based on what fields are provided
    const updates = [];
    const values = [];
    
    if (gstr1 !== undefined) {
      updates.push("gstr1 = ?");
      values.push(gstr1);
    }
    if (gstr3b !== undefined) {
      updates.push("gstr3b = ?");
      values.push(gstr3b);
    }
    
    if (updates.length === 0) {
      return res.status(400).json("No fields to update");
    }
    
    // Add return ID to end of values array
    values.push(req.params.id);
    
    // Execute update
    db.prepare(`UPDATE gstReturns SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    
    // Return updated record
    const gstReturn = db.prepare("SELECT * FROM gstReturns WHERE id = ?").get(req.params.id);
    
    res.json(gstReturn);
  } catch (error) {
    console.error("Error updating return:", error);
    next(error);
  }
});

// server/routes.ts

// Define backoff intervals in seconds: 1m, 2m, 5m, 10m, 30m
const BACKOFF_TIMERS = [60, 120, 300, 600, 1800];

// GET only the staff created by the logged-in Admin
app.get("/api/users", requireAuth, (req: any, res) => {
  const user = req.user;

  if (user.role === 'admin') {
    // Admins see staff they created
    const staff = db.prepare(`
      SELECT id, name, email, role 
      FROM users 
      WHERE created_by = ? AND role = 'staff'
    `).all(user.id);
    return res.json(staff);
  } 

  // Staff members see only themselves (or an empty list depending on your UI)
  return res.json([user]);
});

app.post("/api/otp/request", async (req, res) => {
  try {
    const { email, type } = req.body; // type: 'identity' or 'authorization'
    
    if (!email || !['identity', 'authorization'].includes(type)) {
      return res.status(400).json({ error: "Valid email and type are required." });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const now = Date.now();

    // 1. Check for Throttling (Rate Limiting)
    const existing = db.prepare(
      "SELECT * FROM otp_codes WHERE email = ? AND type = ?"
    ).get(normalizedEmail, type) as any;

    if (existing) {
      const secondsSinceLast = (now - existing.last_sent_at) / 1000;
      const waitRequired = BACKOFF_TIMERS[Math.min(existing.attempt_count, BACKOFF_TIMERS.length - 1)];

      if (secondsSinceLast < waitRequired) {
        const remaining = Math.ceil(waitRequired - secondsSinceLast);
        return res.status(429).json({ 
          error: `Rate limit exceeded. Please wait ${remaining}s.`,
          retryAfter: remaining 
        });
      }
    }

    // 2. Generate OTP Data
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + (10 * 60 * 1000); // 10 minute expiry
    const newAttemptCount = existing ? existing.attempt_count + 1 : 0;

    // 3. Persist to Database
    db.prepare(`
      INSERT OR REPLACE INTO otp_codes (email, otp, type, expires_at, attempt_count, last_sent_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(normalizedEmail, otp, type, expiresAt, newAttemptCount, now);

    // 4. DEVELOPMENT LOGGING (Your "Virtual Inbox")
    console.log("\n--- 🛡️ NEW OTP GENERATED ---");
    console.log(`📍 TARGET: ${normalizedEmail}`);
    console.log(`🏷️  TYPE:   ${type.toUpperCase()}`);
    console.log(`🔢 CODE:   ${otp}`);
    console.log(`⏳ NEXT RETRY: ${BACKOFF_TIMERS[Math.min(newAttemptCount, BACKOFF_TIMERS.length - 1)]}s`);
    console.log("---------------------------\n");

    // 5. Attempt Email Delivery via Resend
    try {
      await resend.emails.send({
        from: 'GST Pro <onboarding@resend.dev>',
        to: normalizedEmail,
        subject: type === 'identity' ? "Verify Your Email" : "Admin Authorization Required",
        html: `<strong>Your verification code is: ${otp}</strong><p>This code expires in 10 minutes.</p>`,
      });
      
      return res.json({ 
        success: true, 
        message: "Code sent successfully.",
        nextRetryIn: BACKOFF_TIMERS[Math.min(newAttemptCount, BACKOFF_TIMERS.length - 1)]
      });

    } catch (emailError) {
      // In development, we treat email failure as a "soft success"
      // because we have the terminal log to fall back on.
      console.warn(`⚠️ Resend failed (likely unverified email): ${normalizedEmail}`);
      return res.json({ 
        success: true, 
        message: "Development Mode: Code logged to server console.",
        nextRetryIn: BACKOFF_TIMERS[Math.min(newAttemptCount, BACKOFF_TIMERS.length - 1)]
      });
    }

  } catch (error) {
    console.error("OTP Request Error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.post("/api/otp/verify", (req, res) => {
  const { email, otp, type } = req.body;
  const normalizedEmail = email.toLowerCase().trim();

  const record = db.prepare(
    "SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND type = ?"
  ).get(normalizedEmail, otp, type) as any;

  if (!record) {
    return res.status(400).json({ error: "Invalid code." });
  }

  if (Date.now() > record.expires_at) {
    return res.status(400).json({ error: "Code has expired. Request a new one." });
  }

  // We DON'T delete it yet. We delete it only after successful registration 
  // in auth.ts to ensure the "session" of verification stays active.
  res.json({ success: true, message: "Code is valid." });
});
  return httpServer;
}