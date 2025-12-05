import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertClientSchema, insertGstReturnSchema, updateGstReturnSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).send("Unauthorized");
  }
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated() || req.user?.role !== 'admin') {
    return res.status(403).send("Forbidden: Admin access required");
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.get("/api/users/staff", requireAuth, async (req, res, next) => {
    try {
      const staff = await storage.getAllStaff();
      res.json(staff);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/clients", requireAuth, async (req, res, next) => {
    try {
      const user = req.user!;
      let clientsList;
      
      if (user.role === 'admin') {
        clientsList = await storage.getClients();
      } else {
        clientsList = await storage.getClientsByStaffId(user.id);
      }

      const clientsWithReturns = await Promise.all(
        clientsList.map(async (client) => {
          const returns = await storage.getReturnsByClientId(client.id);
          return { ...client, returns };
        })
      );

      res.json(clientsWithReturns);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/clients", requireAdmin, async (req, res, next) => {
    try {
      const validation = insertClientSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).send(fromZodError(validation.error).toString());
      }

      const existingClient = await storage.getClientByGstin(validation.data.gstin);
      if (existingClient) {
        return res.status(400).send("A client with this GSTIN already exists");
      }

      const client = await storage.createClient(validation.data);

      const currentDate = new Date();
      const months = [];
      for (let i = 0; i < 3; i++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
      }

      for (const month of months) {
        await storage.createReturn({
          clientId: client.id,
          month,
          gstr1: 'Pending',
          gstr3b: 'Pending',
        });
      }

      const returns = await storage.getReturnsByClientId(client.id);
      res.status(201).json({ ...client, returns });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/clients/:id/assign", requireAdmin, async (req, res, next) => {
    try {
      const { staffId } = req.body;
      if (!staffId) {
        return res.status(400).send("staffId is required");
      }

      const client = await storage.updateClientAssignment(req.params.id, staffId);
      res.json(client);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/clients/:clientId/returns", requireAuth, async (req, res, next) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).send("Client not found");
      }

      const user = req.user!;
      if (user.role !== 'admin' && client.assignedToId !== user.id) {
        return res.status(403).send("Forbidden: Cannot access other staff's clients");
      }

      const returns = await storage.getReturnsByClientId(req.params.clientId);
      res.json(returns);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/clients/:clientId/returns", requireAuth, async (req, res, next) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).send("Client not found");
      }

      const user = req.user!;
      if (user.role !== 'admin' && client.assignedToId !== user.id) {
        return res.status(403).send("Forbidden: Cannot modify other staff's clients");
      }

      const existingReturn = await storage.getReturnByClientAndMonth(req.params.clientId, req.body.month);
      if (existingReturn) {
        return res.json(existingReturn);
      }

      const gstReturn = await storage.createReturn({
        clientId: req.params.clientId,
        month: req.body.month,
        gstr1: 'Pending',
        gstr3b: 'Pending',
      });
      
      res.status(201).json(gstReturn);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/returns/:id", requireAuth, async (req, res, next) => {
    try {
      const validation = updateGstReturnSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).send(fromZodError(validation.error).toString());
      }

      const gstReturn = await storage.updateReturn(req.params.id, validation.data);
      res.json(gstReturn);
    } catch (error) {
      next(error);
    }
  });

  return httpServer;
}
