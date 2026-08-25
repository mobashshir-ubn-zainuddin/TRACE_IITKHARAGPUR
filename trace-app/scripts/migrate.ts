import { runMigrations } from "../src/server/db";

async function main() {
  try {
    await runMigrations();
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();