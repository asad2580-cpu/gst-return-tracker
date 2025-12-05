import { type User, type InsertUser, type Client, type InsertClient, type GstReturn, type InsertGstReturn, type UpdateGstReturn, users, clients, gstReturns } from "@shared/schema";
import session from "express-session";
import { db, pool } from "./db";
import { eq, and } from "drizzle-orm";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;
  
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllStaff(): Promise<User[]>;
  
  getClient(id: string): Promise<Client | undefined>;
  getClients(): Promise<Client[]>;
  getClientsByStaffId(staffId: string): Promise<Client[]>;
  createClient(client: InsertClient): Promise<Client>;
  updateClientAssignment(clientId: string, staffId: string): Promise<Client>;
  
  getReturnsByClientId(clientId: string): Promise<GstReturn[]>;
  getReturnByClientAndMonth(clientId: string, month: string): Promise<GstReturn | undefined>;
  createReturn(gstReturn: InsertGstReturn): Promise<GstReturn>;
  updateReturn(id: string, update: UpdateGstReturn): Promise<GstReturn>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getAllStaff(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, 'staff'));
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  }

  async getClients(): Promise<Client[]> {
    return await db.select().from(clients);
  }

  async getClientsByStaffId(staffId: string): Promise<Client[]> {
    return await db.select().from(clients).where(eq(clients.assignedToId, staffId));
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await db
      .insert(clients)
      .values(insertClient)
      .returning();
    return client;
  }

  async updateClientAssignment(clientId: string, staffId: string): Promise<Client> {
    const [client] = await db
      .update(clients)
      .set({ assignedToId: staffId })
      .where(eq(clients.id, clientId))
      .returning();
    return client;
  }

  async getReturnsByClientId(clientId: string): Promise<GstReturn[]> {
    return await db.select().from(gstReturns).where(eq(gstReturns.clientId, clientId));
  }

  async getReturnByClientAndMonth(clientId: string, month: string): Promise<GstReturn | undefined> {
    const [gstReturn] = await db
      .select()
      .from(gstReturns)
      .where(and(eq(gstReturns.clientId, clientId), eq(gstReturns.month, month)));
    return gstReturn || undefined;
  }

  async createReturn(insertGstReturn: InsertGstReturn): Promise<GstReturn> {
    const [gstReturn] = await db
      .insert(gstReturns)
      .values(insertGstReturn)
      .returning();
    return gstReturn;
  }

  async updateReturn(id: string, update: UpdateGstReturn): Promise<GstReturn> {
    const [gstReturn] = await db
      .update(gstReturns)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(gstReturns.id, id))
      .returning();
    return gstReturn;
  }
}

export const storage = new DatabaseStorage();
