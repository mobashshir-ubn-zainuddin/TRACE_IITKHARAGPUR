import { runMigrations } from "../src/server/db";

async function main() {
  await runMigrations();
  console.log("Migrations completed");
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});