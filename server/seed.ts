import { db } from "./db";
import { users, clients, gstReturns } from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function seed() {
  console.log("Seeding database...");

  const adminUser = await db
    .insert(users)
    .values({
      username: "admin",
      password: await hashPassword("admin123"),
      name: "Aditi Sharma",
      email: "aditi@cafirm.com",
      role: "admin",
    })
    .returning();

  const staff1 = await db
    .insert(users)
    .values({
      username: "rahul",
      password: await hashPassword("rahul123"),
      name: "Rahul Verma",
      email: "rahul@cafirm.com",
      role: "staff",
    })
    .returning();

  const staff2 = await db
    .insert(users)
    .values({
      username: "priya",
      password: await hashPassword("priya123"),
      name: "Priya Singh",
      email: "priya@cafirm.com",
      role: "staff",
    })
    .returning();

  console.log("Created users:", { admin: adminUser[0], staff1: staff1[0], staff2: staff2[0] });

  const client1 = await db
    .insert(clients)
    .values({
      name: "TechSolutions Pvt Ltd",
      gstin: "27ABCDE1234F1Z5",
      assignedToId: staff1[0].id,
    })
    .returning();

  const client2 = await db
    .insert(clients)
    .values({
      name: "GreenLeaf Traders",
      gstin: "27FGHIJ5678K1Z2",
      assignedToId: staff1[0].id,
    })
    .returning();

  const client3 = await db
    .insert(clients)
    .values({
      name: "Sunrise Enterprises",
      gstin: "27KLMNO9012P1Z8",
      assignedToId: staff2[0].id,
    })
    .returning();

  const client4 = await db
    .insert(clients)
    .values({
      name: "BlueSky Logistics",
      gstin: "27QRSTU3456V1Z4",
      assignedToId: staff2[0].id,
    })
    .returning();

  console.log("Created clients:", [client1[0], client2[0], client3[0], client4[0]]);

  const months = ["2025-01", "2025-02", "2025-03"];
  const allClients = [client1[0], client2[0], client3[0], client4[0]];

  for (const client of allClients) {
    for (const month of months) {
      let gstr1Status: "Pending" | "Filed" | "Late" = "Pending";
      let gstr3bStatus: "Pending" | "Filed" | "Late" = "Pending";

      if (month === "2025-01") {
        gstr1Status = client.id === client4[0].id ? "Late" : "Filed";
        gstr3bStatus = client.id === client4[0].id ? "Late" : "Filed";
      } else if (month === "2025-02") {
        if (client.id === client1[0].id) {
          gstr1Status = "Filed";
          gstr3bStatus = "Pending";
        } else if (client.id === client2[0].id) {
          gstr1Status = "Late";
          gstr3bStatus = "Pending";
        } else if (client.id === client3[0].id) {
          gstr1Status = "Filed";
          gstr3bStatus = "Filed";
        } else {
          gstr1Status = "Pending";
          gstr3bStatus = "Pending";
        }
      }

      await db.insert(gstReturns).values({
        clientId: client.id,
        month,
        gstr1: gstr1Status,
        gstr3b: gstr3bStatus,
      });
    }
  }

  console.log("Created GST returns for all clients");
  console.log("\nSeed complete! You can now log in with:");
  console.log("Admin: username='admin', password='admin123'");
  console.log("Staff1: username='rahul', password='rahul123'");
  console.log("Staff2: username='priya', password='priya123'");

  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
