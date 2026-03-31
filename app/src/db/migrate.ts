import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const P = "[pilox]";

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(P, "migrate: DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  console.log(P, "migrate: running migrations...");

  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log(P, "migrate: completed successfully");
  } catch (error) {
    console.error(P, "migrate: failed:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();
