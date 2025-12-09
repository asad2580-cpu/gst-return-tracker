import db from "./simple-db";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { attachUserFromHeader } from "./auth";


/** Typed auth middlewares (safe checks) */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  // only call isAuthenticated if it's present and a function
  const authed = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : false;
  if (!authed) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authed = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : false;
  if (!authed || req.user?.role !== "admin") {
    return res.status(403).send("Forbidden: Admin access required");
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);
  app.use(attachUserFromHeader);

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
  app.post("/api/clients", requireAdmin, async (req, res, next) => {
  try {
    const { name, gstin, assignedToId, gstUsername, gstPassword, remarks } = req.body;
    
    // Validate required inputs
    if (!name || !gstin || !assignedToId) {
      return res.status(400).send("Missing required fields: name, gstin, or assignedToId");
    }

    // Validate GSTIN format
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin.toUpperCase())) {
      return res.status(400).send("Invalid GSTIN format");
    }

    // Check if GSTIN already exists
    const existingClient = db.prepare("SELECT * FROM clients WHERE gstin = ?").get(gstin);
    if (existingClient) {
      return res.status(400).send("A client with this GSTIN already exists");
    }

    // Insert new client with all fields
    const result = db.prepare(
      `INSERT INTO clients (name, gstin, assignedToId, gstUsername, gstPassword, remarks) 
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(name, gstin, assignedToId, gstUsername || null, gstPassword || null, remarks || null);

    const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(result.lastInsertRowid);

    // Create returns for last 3 months
    const currentDate = new Date();
    const months = [];
    for (let i = 0; i < 3; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }

    for (const month of months) {
      db.prepare(
        "INSERT INTO gstReturns (clientId, month, gstr1, gstr3b) VALUES (?, ?, 'Pending', 'Pending')"
      ).run(client.id, month);
    }

    const returns = db.prepare("SELECT * FROM gstReturns WHERE clientId = ?").all(client.id);
    res.status(201).json({ ...client, returns });
  } catch (error) {
    console.error("Error creating client:", error);
    next(error);
  }
});

  // Reassign client to different staff (admin only)
  app.patch("/api/clients/:id/assign", requireAdmin, async (req: any, res: any, next: any) => {
    try {
      const { staffId } = req.body;
      if (!staffId) {
        return res.status(400).send("staffId is required");
      }

      // Check if client exists
      const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id);
      if (!client) {
        return res.status(404).send("Client not found");
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
        return res.status(404).send("Client not found");
      }

      const user = req.user;
      if (user.role !== 'admin' && client.assignedToId !== user.id) {
        return res.status(403).send("Forbidden: Cannot access other staff's clients");
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
        return res.status(404).send("Client not found");
      }

      const user = req.user;
      if (user.role !== 'admin' && client.assignedToId !== user.id) {
        return res.status(403).send("Forbidden: Cannot modify other staff's clients");
      }

      const { month } = req.body;
      if (!month) {
        return res.status(400).send("Month is required");
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
  app.patch("/api/returns/:id", requireAuth, async (req: any, res: any, next: any) => {
    try {
      const { gstr1, gstr3b } = req.body;
      
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
        return res.status(400).send("No fields to update");
      }
      
      // Add return ID to end of values array
      values.push(req.params.id);
      
      // Execute update
      db.prepare(`UPDATE gstReturns SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      
      // Return updated record
      const gstReturn = db.prepare("SELECT * FROM gstReturns WHERE id = ?").get(req.params.id);
      
      if (!gstReturn) {
        return res.status(404).send("Return not found");
      }
      
      res.json(gstReturn);
    } catch (error) {
      console.error("Error updating return:", error);
      next(error);
    }
  });

  return httpServer;
}