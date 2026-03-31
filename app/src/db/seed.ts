import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hash } from "bcryptjs";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const P = "[pilox]";

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(P, "seed: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  const adminEmail = "admin@pilox.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme";

  console.log(P, "seed: seeding database...");

  try {
    // Check if admin already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    const passwordHash = await hash(adminPassword, 12);
    if (existing) {
      // In CI / ephemeral DBs we want a deterministic admin password for Playwright.
      // Updating is safe here because this seed is only used for local dev + CI.
      await db
        .update(users)
        .set({
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(users.email, adminEmail));
      console.log(P, "seed: admin user already exists, password updated");
    } else {
      await db.insert(users).values({
        name: "Admin",
        email: adminEmail,
        passwordHash,
        role: "admin",
      });

      console.log(P, `seed: admin user created: ${adminEmail}`);
    }

    // Viewer account for E2E (role-gated UI). Same password as admin in CI unless E2E_VIEWER_PASSWORD is set.
    if (process.env.CI === "true") {
      const viewerEmail = "viewer@pilox.local";
      const [viewerExists] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, viewerEmail))
        .limit(1);
      if (!viewerExists) {
        const viewerPassword =
          process.env.E2E_VIEWER_PASSWORD?.trim() ||
          process.env.E2E_ADMIN_PASSWORD?.trim() ||
          adminPassword;
        await db.insert(users).values({
          name: "Viewer (CI)",
          email: viewerEmail,
          passwordHash: await hash(viewerPassword, 12),
          role: "viewer",
        });
        console.log(P, `seed: viewer user created for CI: ${viewerEmail}`);
      }
    }
  } catch (error) {
    console.error(P, "seed: failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
