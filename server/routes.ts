import express, { type Express, Request, Response, NextFunction, Router } from "express";
import { createServer, type Server } from "http";
import * as dotenv from 'dotenv';
import { Resend } from 'resend';

// Database & Schema
import { db } from "./db";
import { users, clients, gstReturns, otpCodes, assignmentLogs } from "@shared/schema";

// Drizzle ORM Helpers
import { eq, and, ne, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Auth Middleware
import { setupAuth, attachUserFromHeader } from "./auth";

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

  try {
    // 1. Check if Admin exists using Drizzle select
    const results = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.email, normalizedAdminEmail),
          eq(users.role, 'admin')
        )
      )
      .limit(1);

    const admin = results[0];
    if (!admin) return res.status(404).send("No administrator found.");

    // 2. Generate OTP and Expiry
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Now a Date object

    // 3. PostgreSQL Upsert (Insert or Update on Conflict)
    // Note: This requires a unique constraint on (email, type) in your schema.ts
    await db.insert(otpCodes)
      .values({
        email: normalizedAdminEmail,
        otp: otp,
        type: 'authorization',
        expiresAt: expiresAt,
        attemptCount: 0,
        lastSentAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [otpCodes.email, otpCodes.type],
        set: {
          otp: otp,
          expiresAt: expiresAt,
          attemptCount: 0,
          lastSentAt: new Date(),
        },
      });

    // 4. Send Email
    await resend.emails.send({
      from: 'fileDX <onboarding@resend.dev>',
      to: normalizedAdminEmail,
      subject: 'Staff Registration OTP',
      html: `<p>A staff member is registering. Provide them this code: <strong>${otp}</strong></p>`,
    });

    console.log(`--- OTP [${otp}] saved to Postgres for Admin [${normalizedAdminEmail}] ---`);
    res.json({ message: "OTP sent to your Admin's email." });

  } catch (error) {
    console.error("Verify Admin Error:", error);
    res.status(500).send("Failed to process request.");
  }
});

  // Get all clients (admin sees all, staff sees only assigned)
  app.get("/api/clients", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const user = req.user;
    let clientsList;

    // 1. Fetch the list of clients based on Role
    if (user.role === 'admin') {
      // Admin sees ALL clients
      clientsList = await db.select().from(clients);
    } else {
      // Staff only sees their assigned clients
      clientsList = await db
        .select()
        .from(clients)
        .where(eq(clients.assignedToId, user.id));
    }

    // 2. Fetch returns for each client
    // Since we use 'await', we use Promise.all to run these in parallel
    const clientsWithReturns = await Promise.all(
      clientsList.map(async (client) => {
        const returns = await db
          .select()
          .from(gstReturns)
          .where(eq(gstReturns.clientId, client.id));
          
        return { 
          ...client, 
          returns 
        };
      })
    );

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
    
    // 1. Validation
    if (!name || !gstin || !assignedToId) {
      return res.status(400).json("Missing required fields: name, gstin, or assignedToId");
    }

    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin.toUpperCase())) {
      return res.status(400).json("Invalid GSTIN format");
    }

    // 2. Check existing GSTIN (Asynchronous)
    const existing = await db.select().from(clients).where(eq(clients.gstin, gstin.toUpperCase())).limit(1);
    if (existing[0]) {
      return res.status(400).json("A client with this GSTIN already exists");
    }

    // 3. Start Transaction
    const finalData = await db.transaction(async (tx) => {
      // Insert Client and get the new record back immediately with .returning()
      const [newClient] = await tx.insert(clients).values({
        name,
        gstin: gstin.toUpperCase(),
        assignedToId,
        gstUsername: gstUsername || null,
        gstPassword: gstPassword || null,
        remarks: remarks || null,
      }).returning();

      // Logic for generating months
      const currentDate = new Date();
      const returnPeriodDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const currentReturnPeriodStr = `${returnPeriodDate.getFullYear()}-${String(returnPeriodDate.getMonth() + 1).padStart(2, '0')}`;
      
      const months = [];
      for (let i = 0; i < 3; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      }

      // Insert Returns
      for (const month of months) {
        let status: "Pending" | "Filed" | "Late" = 'Pending';
        if (previousReturns === 'mark_all_previous') {
          const [y, m] = month.split('-').map(Number);
          const [cy, cm] = currentReturnPeriodStr.split('-').map(Number);
          if (new Date(y, m - 1) < new Date(cy, cm - 1)) status = 'Filed';
        }

        await tx.insert(gstReturns).values({
          clientId: newClient.id,
          month,
          gstr1: status,
          gstr3b: status,
        });
      }

      // Fetch the newly created returns to return to the frontend
      const returns = await tx.select().from(gstReturns).where(eq(gstReturns.clientId, newClient.id));
      
      return { ...newClient, returns };
    });

    res.status(201).json(finalData);
  } catch (error) {
    console.error("Error creating client:", error);
    next(error);
  }
});

// Bulk Create Clients (Admin only)
app.post("/api/clients/bulk", requireAdmin, async (req, res, next) => {
  try {
    const clientsData = req.body; 
    if (!Array.isArray(clientsData)) {
      return res.status(400).json("Data must be an array of clients");
    }

    // 1. Fetch all staff to map Email -> ID (Drizzle Async)
    const staffRows = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.role, 'staff'));
    
    const staffMap = new Map(staffRows.map(s => [s.email.toLowerCase().trim(), s.id]));

    // 2. Prepare GSTIN regex
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    // 3. START POSTGRES TRANSACTION
    // In Drizzle, we use await db.transaction(async (tx) => { ... })
    const insertedIds = await db.transaction(async (tx) => {
      const results = [];

      for (const item of clientsData) {
        const name = item.name;
        const gstin = item.gstin?.toUpperCase().trim();
        const staffEmail = item.staffEmail?.toLowerCase().trim();
        const { gstUsername, gstPassword, remarks } = item;

        // Validation
        const assignedToId = staffMap.get(staffEmail);
        if (!assignedToId) {
          throw new Error(`Staff email "${item.staffEmail}" not found. Please ensure this staff exists.`);
        }

        if (!gstin || !gstinRegex.test(gstin)) {
          throw new Error(`Invalid GSTIN format for client "${name}": ${item.gstin}`);
        }

        // Check for existing GSTIN
        const existing = await tx
          .select({ name: clients.name })
          .from(clients)
          .where(eq(clients.gstin, gstin))
          .limit(1);

        if (existing[0]) {
          throw new Error(`GSTIN ${gstin} is already assigned to "${existing[0].name}"`);
        }

        // Insert Client and get ID
        const [newClient] = await tx.insert(clients).values({
          name,
          gstin,
          assignedToId,
          gstUsername: gstUsername || null,
          gstPassword: gstPassword || null,
          remarks: remarks || null,
        }).returning({ id: clients.id });

        const clientId = newClient.id;

        // Generate 3 months of returns
        const currentDate = new Date();
        for (let i = 0; i < 3; i++) {
          const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          
          await tx.insert(gstReturns).values({
            clientId: clientId,
            month: month,
            gstr1: 'Pending',
            gstr3b: 'Pending'
          });
        }
        
        results.push(clientId);
      }
      return results;
    });

    res.status(201).json({ message: `Successfully imported ${insertedIds.length} clients` });
  } catch (error: any) {
    console.error("Bulk import failed:", error);
    // Drizzle transactions automatically rollback if an error is thrown inside
    res.status(400).json({ error: error.message });
  }
});

// Update client details (admin only) // Add neq to your imports at the top

app.patch("/api/clients/:id", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const { name, gstin, assignedToId, gstUsername, gstPassword, remarks } = req.body;
    const clientId = req.params.id;
    
    // 1. Check if client exists
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    
    if (!client) {
      return res.status(404).json("Client not found");
    }

    // 2. Logic: Determine if a reassignment is happening
    const isReassigning = assignedToId !== undefined && assignedToId !== client.assignedToId;

    // 3. GSTIN Validation logic
    if (gstin && gstin !== client.gstin) {
      const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstinRegex.test(gstin.toUpperCase())) {
        return res.status(400).json("Invalid GSTIN format");
      }

      const [existingClient] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.gstin, gstin.toUpperCase()), ne(clients.id, clientId)))
        .limit(1);

      if (existingClient) {
        return res.status(400).json("A client with this GSTIN already exists");
      }
    }

    // 4. Perform the Update and optional Log within a Transaction
    const updatedData = await db.transaction(async (tx) => {
      const [updatedClient] = await tx
        .update(clients)
        .set({
          name: name ?? client.name,
          gstin: gstin ? gstin.toUpperCase() : client.gstin,
          assignedToId: assignedToId !== undefined ? assignedToId : client.assignedToId,
          gstUsername: gstUsername !== undefined ? gstUsername : client.gstUsername,
          gstPassword: gstPassword !== undefined ? gstPassword : client.gstPassword,
          remarks: remarks !== undefined ? remarks : client.remarks,
        })
        .where(eq(clients.id, clientId))
        .returning();

      // 5. Record History Log if reassigned
      if (isReassigning) {
        await tx.insert(assignmentLogs).values({
          clientId: clientId,
          fromStaffId: client.assignedToId, // Old Staff ID
          toStaffId: assignedToId,         // New Staff ID
          adminId: req.user.id,            // Admin ID from auth middleware
        });
      }

      // 6. Fetch latest returns to return complete object
      const returns = await tx
        .select()
        .from(gstReturns)
        .where(eq(gstReturns.clientId, clientId));

      return { ...updatedClient, returns };
    });

    res.json(updatedData);
  } catch (error) {
    console.error("Error updating client:", error);
    next(error);
  }
});

    // 6. Return updated data (Your existing code)

  // Reassign client to different staff (admin only)
  app.patch("/api/clients/:id/assign", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const { staffId } = req.body;
    if (!staffId) {
      return res.status(400).json("staffId is required");
    }

    // 1. Perform update and get the result back in one trip
    const [updatedClient] = await db
      .update(clients)
      .set({ assignedToId: staffId })
      .where(eq(clients.id, req.params.id))
      .returning();

    // 2. Check if client existed (if no row was returned, the ID was wrong)
    if (!updatedClient) {
      return res.status(404).json("Client not found");
    }

    res.json(updatedClient);
  } catch (error) {
    console.error("Error assigning client:", error);
    next(error);
  }
});


app.get("/api/clients/:id/history", async (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const clientId = req.params.id;

  try {
    // 1. Create Aliases for the Users table
    const fromStaff = alias(users, "fromStaff");
    const toStaff = alias(users, "toStaff");
    const admin = alias(users, "admin");

    // 2. Perform the Triple Join
    const history = await db
      .select({
        id: assignmentLogs.id,
        timestamp: assignmentLogs.createdAt,
        fromStaffName: fromStaff.name,
        toStaffName: toStaff.name,
        adminName: admin.name,
      })
      .from(assignmentLogs)
      .leftJoin(fromStaff, eq(assignmentLogs.fromStaffId, fromStaff.id))
      .innerJoin(toStaff, eq(assignmentLogs.toStaffId, toStaff.id))
      .innerJoin(admin, eq(assignmentLogs.adminId, admin.id))
      .where(eq(assignmentLogs.clientId, clientId))
      .orderBy(desc(assignmentLogs.createdAt));

    res.json(history);
  } catch (error) {
    console.error("History Fetch Error:", error);
    res.status(500).json({ message: "Failed to fetch history" });
  }
});

  // Get returns for a specific client
  app.get("/api/clients/:clientId/returns", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { clientId } = req.params;

    // 1. Fetch the client to check ownership/existence
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      return res.status(404).json("Client not found");
    }

    // 2. Security Check (Admin or Assigned Staff only)
    const user = req.user;
    if (user.role !== 'admin' && client.assignedToId !== user.id) {
      return res.status(403).json("Forbidden: Cannot access other staff's clients");
    }

    // 3. Fetch all returns for this client
    const returnsList = await db
      .select()
      .from(gstReturns)
      .where(eq(gstReturns.clientId, clientId))
      .orderBy(desc(gstReturns.month)); // Optional: keeps them in order by date

    res.json(returnsList);
  } catch (error) {
    console.error("Error fetching returns:", error);
    next(error);
  }
});

  // Create a return for a specific month (if it doesn't exist)
  app.post("/api/clients/:clientId/returns", requireAuth, async (req: any, res: any, next: any) => {
  try {
    const { clientId } = req.params;
    const { month } = req.body;

    if (!month) {
      return res.status(400).json("Month is required");
    }

    // 1. Fetch client and verify permissions
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (!client) {
      return res.status(404).json("Client not found");
    }

    const user = req.user;
    if (user.role !== 'admin' && client.assignedToId !== user.id) {
      return res.status(403).json("Forbidden: Cannot modify other staff's clients");
    }

    // 2. Check if return already exists for this month
    const [existingReturn] = await db
      .select()
      .from(gstReturns)
      .where(
        and(
          eq(gstReturns.clientId, clientId),
          eq(gstReturns.month, month)
        )
      )
      .limit(1);
    
    if (existingReturn) {
      return res.json(existingReturn);
    }

    // 3. Create new return and return it immediately
    const [newReturn] = await db
      .insert(gstReturns)
      .values({
        clientId: clientId,
        month: month,
        gstr1: 'Pending',
        gstr3b: 'Pending'
      })
      .returning();

    res.status(201).json(newReturn);
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
    const returnId = req.params.id;

    // 1. Get current return
    const [currentReturn] = await db
      .select()
      .from(gstReturns)
      .where(eq(gstReturns.id, returnId))
      .limit(1);

    if (!currentReturn) {
      return res.status(404).json("Return not found");
    }

    // 2. Logic to calculate the previous month string
    const currentMonth = currentReturn.month; // e.g., "2024-03"
    const [year, month] = currentMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    // 3. Fetch previous month's return for validation
    const [prevReturn] = await db
      .select()
      .from(gstReturns)
      .where(
        and(
          eq(gstReturns.clientId, currentReturn.clientId),
          eq(gstReturns.month, prevMonthStr)
        )
      )
      .limit(1);

    // 4. Validation: Sequential Filing Rules
    if (gstr1 === 'Filed' || gstr3b === 'Filed') {
      if (prevReturn && (prevReturn.gstr1 !== 'Filed' || prevReturn.gstr3b !== 'Filed')) {
        return res.status(400).json("Cannot mark as Filed: Previous month's GSTR-1 and GSTR-3B must both be Filed first");
      }
    }

    // 5. Validation: GSTR-1 must come before GSTR-3B
    if (gstr3b === 'Filed') {
      const gstr1Status = gstr1 !== undefined ? gstr1 : currentReturn.gstr1;
      if (gstr1Status !== 'Filed') {
        return res.status(400).json("Cannot mark GSTR-3B as Filed: GSTR-1 must be Filed first");
      }
    }

    // 6. Build and Execute Update
    // Drizzle ignores 'undefined' values in the object, so we only update what's sent
    const updatePayload: any = {};
    if (gstr1 !== undefined) updatePayload.gstr1 = gstr1;
    if (gstr3b !== undefined) updatePayload.gstr3b = gstr3b;

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json("No fields to update");
    }

    const [updatedReturn] = await db
      .update(gstReturns)
      .set(updatePayload)
      .where(eq(gstReturns.id, returnId))
      .returning();

    res.json(updatedReturn);
  } catch (error) {
    console.error("Error updating return:", error);
    next(error);
  }
});

// GET only the staff created by the logged-in Admin
app.get("/api/users", requireAuth, async (req: any, res) => {
  const user = req.user;

  try {
    if (user.role === 'admin') {
      // Admins see staff they created
      const staff = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(
          and(
            eq(users.createdBy, user.id),
            eq(users.role, 'staff')
          )
        );
      return res.json(staff);
    }

    // Staff members see only themselves (formatted as an array for UI consistency)
    return res.json([{
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }]);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
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
    const [existing] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.email, normalizedEmail),
          eq(otpCodes.type, type)
        )
      )
      .limit(1);

    if (existing && existing.lastSentAt) {
      // Postgres TIMESTAMP comes back as a Date object, convert to ms
      const lastSentMs = existing.lastSentAt.getTime();
      const secondsSinceLast = (now - lastSentMs) / 1000;
      
      // Calculate wait time based on previous attempts
      const waitRequired = BACKOFF_TIMERS[Math.min(existing.attemptCount ?? 0, BACKOFF_TIMERS.length - 1)];

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
    const expiresAt = new Date(now + (10 * 60 * 1000)); // 10 minute expiry as Date
    const newAttemptCount = existing ? (existing.attemptCount ?? 0) + 1 : 0;

    // 3. Persist to Database (Postgres Upsert)
    // IMPORTANT: Requires unique constraint on (email, type) in schema.ts
    await db.insert(otpCodes)
      .values({
        email: normalizedEmail,
        otp,
        type,
        expiresAt,
        attemptCount: newAttemptCount,
        lastSentAt: new Date(now),
      })
      .onConflictDoUpdate({
        target: [otpCodes.email, otpCodes.type],
        set: {
          otp,
          expiresAt,
          attemptCount: newAttemptCount,
          lastSentAt: new Date(now),
        }
      });

    // 4. DEVELOPMENT LOGGING
    console.log("\n--- 🛡️ NEW OTP GENERATED (POSTGRES) ---");
    console.log(`📍 TARGET: ${normalizedEmail}`);
    console.log(`🔢 CODE:   ${otp}`);
    console.log(`⏳ NEXT RETRY: ${BACKOFF_TIMERS[Math.min(newAttemptCount, BACKOFF_TIMERS.length - 1)]}s`);
    console.log("---------------------------\n");

    // 5. Attempt Email Delivery via Resend
    try {
      await resend.emails.send({
        from: 'fileDX <onboarding@resend.dev>',
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
      // Soft success for development
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

app.post("/api/otp/verify", async (req, res) => {
  try {
    const { email, otp, type } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Find the specific record
    const [record] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.email, normalizedEmail),
          eq(otpCodes.otp, otp),
          eq(otpCodes.type, type)
        )
      )
      .limit(1);

    // 2. Check if OTP exists
    if (!record) {
      return res.status(400).json({ error: "Invalid code." });
    }

    // 3. Expiry check 
    // Since record.expiresAt is a Date object from Postgres, 
    // we compare it directly with the current date.
    if (new Date() > record.expiresAt) {
      return res.status(400).json({ error: "Code has expired. Request a new one." });
    }

    // Success - We keep the record for the actual registration/action step
    res.json({ success: true, message: "Code is valid." });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ error: "Failed to verify code." });
  }
});
  return httpServer;
}