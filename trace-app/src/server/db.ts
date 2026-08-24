// src/server/db.ts
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";

const dbPath = path.join(process.cwd(), "db", "trace.db");

let dbInstance: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDB(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (dbInstance) return dbInstance;
  // Ensure db directory exists
  const fs = await import("fs");
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
  dbInstance = await open({ filename: dbPath, driver: sqlite3.Database });
  return dbInstance;
}

export async function runMigrations(): Promise<void> {
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
}
