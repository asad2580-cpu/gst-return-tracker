import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum('role', ['admin', 'staff']);
export const gstStatusEnum = pgEnum('gst_status', ['Pending', 'Filed', 'Late']);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: roleEnum("role").notNull().default('staff'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  gstin: varchar("gstin", { length: 15 }).notNull().unique(),
  assignedToId: varchar("assigned_to_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gstReturns = pgTable("gst_returns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id, { onDelete: 'cascade' }).notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  gstr1: gstStatusEnum("gstr1").notNull().default('Pending'),
  gstr3b: gstStatusEnum("gstr3b").notNull().default('Pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  clients: many(clients),
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

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
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

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type GstReturn = typeof gstReturns.$inferSelect;
export type InsertGstReturn = z.infer<typeof insertGstReturnSchema>;
export type UpdateGstReturn = z.infer<typeof updateGstReturnSchema>;
