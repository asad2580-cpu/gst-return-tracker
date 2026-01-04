import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, pgEnum, uuid, integer, AnyPgColumn, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum('role', ['admin', 'staff']);
export const gstStatusEnum = pgEnum('gst_status', ['Pending', 'Filed', 'Late']);

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  otp: text("otp").notNull(),
  type: text("type").notNull(), 
  expiresAt: timestamp("expires_at").notNull(),
  attemptCount: integer("attempt_count").default(0),
  lastSentAt: timestamp("last_sent_at").notNull(),
}, (table) => ({
  // IMPORTANT: This allows the .onConflictDoUpdate logic to work!
  emailTypeIdx: uniqueIndex("email_type_idx").on(table.email, table.type),
}));

export const deletedClientsLog = pgTable("deleted_clients_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientName: text("client_name").notNull(),
  gstin: text("gstin").notNull(),
  deletedBy: uuid("deleted_by").notNull(),
  reason: text("reason").notNull(),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
});

// Add to shared/schema.ts
export const deletedStaffLog = pgTable("deleted_staff_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffEmail: text("staff_email").notNull(), // This was missing!
  staffName: text("staff_name").notNull(),
  adminName: text("admin_name").notNull(),
  reason: text("reason").notNull(),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
});

export const passwordHistory = pgTable("password_history", {
  id: serial("id").primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  // Use uuid for industry-standard unique IDs in Postgres
  id: uuid("id").primaryKey().defaultRandom(), 
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: roleEnum("role").notNull().default('staff'),
  createdBy: uuid("created_by").references((): any => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  gstin: text("gstin").notNull().unique(),
  createdBy: uuid("created_by").references(() => users.id),
  assignedToId: uuid("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  gstUsername: text("gst_username"),
  gstPassword: text("gst_password"),
  remarks: text("remarks"),
  returnStartDate: text("return_start_date"), // Optional: e.g., "2023-01"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gstReturns = pgTable("gst_returns", {
  // 1. Use uuid() to match the rest of your app
  id: uuid("id").primaryKey().defaultRandom(),
  
  // 2. CHANGE THIS from varchar() to uuid() 
  // It must match clients.id exactly!
  clientId: uuid("client_id")
    .references(() => clients.id, { onDelete: 'cascade' })
    .notNull(),
    
  month: varchar("month", { length: 7 }).notNull(),
  gstr1: gstStatusEnum("gstr1").notNull().default('Pending'),
  gstr3b: gstStatusEnum("gstr3b").notNull().default('Pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  clients: many(clients),
  // Allows you to do: db.query.users.findMany({ with: { creator: true } })
  creator: one(users, {
    fields: [users.createdBy],
    references: [users.id],
    relationName: "userCreator",
  }),
  createdUsers: many(users, { relationName: "userCreator" }),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  assignedTo: one(users, {
    fields: [clients.assignedToId],
    references: [users.id],
  }),
  returns: many(gstReturns),
}));

export const gstReturnsRelations = relations(gstReturns, ({ one }) => ({
  client: one(clients, {
    fields: [gstReturns.clientId],
    references: [clients.id],
  }),
}));

// Add the .extend block to include the verification fields
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  otp: z.string().optional(),
  adminEmail: z.string().optional(),
  adminOtp: z.string().optional(),
});

// This line ensures the 'RegisterData' used in Login.tsx now recognizes adminOtp

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
}).extend({
  // These extra fields help our backend logic but aren't stored in the 'clients' table directly
  initialHistoryStatus: z.enum(['Pending', 'Filed']).optional(),
});

export const insertGstReturnSchema = createInsertSchema(gstReturns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateGstReturnSchema = z.object({
  gstr1: z.enum(['Pending', 'Filed', 'Late']).optional(),
  gstr3b: z.enum(['Pending', 'Filed', 'Late']).optional(),
});

// 2. Make staffId nullable in assignmentLogs
export const assignmentLogs = pgTable("assignment_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  fromStaffId: uuid("from_staff_id").references(() => users.id),
  toStaffId: uuid("to_staff_id").references(() => users.id), // Remove .notNull()
  adminId: uuid("admin_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 2. Define the relations so Drizzle knows how to join these tables
export const assignmentLogsRelations = relations(assignmentLogs, ({ one }) => ({
  client: one(clients, {
    fields: [assignmentLogs.clientId],
    references: [clients.id],
  }),
  fromStaff: one(users, {
    fields: [assignmentLogs.fromStaffId],
    references: [users.id],
    relationName: "fromStaff",
  }),
  toStaff: one(users, {
    fields: [assignmentLogs.toStaffId],
    references: [users.id],
    relationName: "toStaff",
  }),
  admin: one(users, {
    fields: [assignmentLogs.adminId],
    references: [users.id],
  }),

  
  
}));



export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type GstReturn = typeof gstReturns.$inferSelect;
export type InsertGstReturn = z.infer<typeof insertGstReturnSchema>;
export type UpdateGstReturn = z.infer<typeof updateGstReturnSchema>;
export type RegisterData = z.infer<typeof insertUserSchema>;
export type AssignmentLog = typeof assignmentLogs.$inferSelect;