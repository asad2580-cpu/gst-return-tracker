import db from "./simple-db";
import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { attachUserFromHeader } from "./auth";


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


  // Admin: list staff created by the logged-in admin
  app.get("/api/users", requireAdmin, async (req: any, res: any, next: any) => {
    try {
      const adminId = req.user?.id;
      if (!adminId) return res.status(401).json({ error: "Unauthorized" });

      // Direct SQLite query - simple and clean!
      const rows = db
        .prepare("SELECT id, email, name, role, created_by FROM users WHERE role = 'staff' AND created_by = ?")
        .all(adminId);

      return res.json(rows);
    } catch (error) {
      console.error("Error fetching staff:", error);
      next(error);
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
  return httpServer;
}