// src/server/db.ts
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import path from "path";

const dbPath = path.join(process.cwd(), "db", "trace.db");

let dbInstance: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function getDB(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (dbInstance) return dbInstance;
  const fs = await import("fs");
  await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
  dbInstance = await open({ filename: dbPath, driver: sqlite3.Database });
  await dbInstance.exec("PRAGMA foreign_keys = ON;");
  return dbInstance;
}

export async function runMigrations(): Promise<void> {
  const db = await getDB();
  await db.exec(`
    -- Dimensions
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      base_price INTEGER,
      launch_date TEXT
    );

    -- Data sources metadata
    CREATE TABLE IF NOT EXISTS data_sources (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      grain TEXT NOT NULL,
      refresh_cadence TEXT NOT NULL,
      last_refreshed_at TEXT NOT NULL,
      description TEXT
    );

    -- Sales transactions (grain: transaction)
    CREATE TABLE IF NOT EXISTS sales_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      region_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      gross_revenue INTEGER NOT NULL,
      discount INTEGER NOT NULL DEFAULT 0,
      net_revenue INTEGER NOT NULL,
      FOREIGN KEY (region_id) REFERENCES regions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_sales_region ON sales_transactions(region_id);
    CREATE INDEX IF NOT EXISTS idx_sales_product ON sales_transactions(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_order ON sales_transactions(order_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date_region_product ON sales_transactions(transaction_date, region_id, product_id);

    -- Marketing daily (grain: daily)
    CREATE TABLE IF NOT EXISTS marketing_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      region_id INTEGER NOT NULL,
      product_id INTEGER,
      channel TEXT NOT NULL,
      campaign TEXT NOT NULL,
      sessions INTEGER NOT NULL,
      conversions INTEGER NOT NULL,
      marketing_spend INTEGER NOT NULL,
      attributed_revenue INTEGER NOT NULL,
      FOREIGN KEY (region_id) REFERENCES regions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_marketing_date ON marketing_daily(date);
    CREATE INDEX IF NOT EXISTS idx_marketing_region ON marketing_daily(region_id);
    CREATE INDEX IF NOT EXISTS idx_marketing_product ON marketing_daily(product_id);
    CREATE INDEX IF NOT EXISTS idx_marketing_channel ON marketing_daily(channel);
    CREATE INDEX IF NOT EXISTS idx_marketing_campaign ON marketing_daily(campaign);
    CREATE INDEX IF NOT EXISTS idx_marketing_date_region ON marketing_daily(date, region_id);

    -- Operations daily (grain: daily)
    CREATE TABLE IF NOT EXISTS operations_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      region_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      inventory_available INTEGER NOT NULL,
      stockout_rate REAL NOT NULL,
      delivery_delay_rate REAL NOT NULL,
      FOREIGN KEY (region_id) REFERENCES regions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ops_date ON operations_daily(date);
    CREATE INDEX IF NOT EXISTS idx_ops_region ON operations_daily(region_id);
    CREATE INDEX IF NOT EXISTS idx_ops_product ON operations_daily(product_id);
    CREATE INDEX IF NOT EXISTS idx_ops_date_region_product ON operations_daily(date, region_id, product_id);

    -- Decisions (existing)
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);
}

// Repository functions for KPI calculations
export async function getRegions(): Promise<Array<{id: number, name: string}>> {
  const db = await getDB();
  return db.all("SELECT id, name FROM regions ORDER BY id");
}

export async function getProducts(): Promise<Array<{id: number, name: string, category: string | null}>> {
  const db = await getDB();
  return db.all("SELECT id, name, category FROM products ORDER BY id");
}

export async function getDataSources(): Promise<Array<{id: number, name: string, source_type: string, grain: string, refresh_cadence: string, last_refreshed_at: string, description: string | null}>> {
  const db = await getDB();
  return db.all("SELECT * FROM data_sources");
}