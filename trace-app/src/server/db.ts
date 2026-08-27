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
  
  // Drop and recreate marketing_daily to ensure schema is correct
  await db.exec(`DROP TABLE IF EXISTS marketing_daily;`);

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

    -- ===== MODULE 4: UNSTRUCTURED EVIDENCE TABLES =====
    
    -- Documents table
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      title TEXT,
      document_type TEXT,
      region TEXT,
      product TEXT,
      topic TEXT,
      document_date TEXT,
      authority_score REAL DEFAULT 0.5,
      created_at TEXT NOT NULL,
      content_hash TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_region ON documents(region);
    CREATE INDEX IF NOT EXISTS idx_documents_product ON documents(product);
    CREATE INDEX IF NOT EXISTS idx_documents_topic ON documents(topic);
    CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(document_date);
    CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
    CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);

    -- Document chunks table
    CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      region TEXT,
      product TEXT,
      date_start TEXT,
      date_end TEXT,
      metadata TEXT,  -- JSON metadata
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_region ON document_chunks(region);
    CREATE INDEX IF NOT EXISTS idx_chunks_product ON document_chunks(product);
    CREATE INDEX IF NOT EXISTS idx_chunks_date_start ON document_chunks(date_start);
    CREATE INDEX IF NOT EXISTS idx_chunks_date_end ON document_chunks(date_end);

    -- Embeddings table
    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chunk_id INTEGER NOT NULL,
      embedding TEXT NOT NULL,  -- JSON serialized vector
      provider TEXT NOT NULL DEFAULT 'unknown',
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON embeddings(chunk_id);
    CREATE INDEX IF NOT EXISTS idx_embeddings_provider_model ON embeddings(provider, model);
    CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash ON embeddings(content_hash);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_unique ON embeddings(chunk_id, provider, model, dimension);

    -- Evidence scores table
    CREATE TABLE IF NOT EXISTS evidence_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hypothesis_id TEXT NOT NULL,
      chunk_id INTEGER NOT NULL,
      semantic_score REAL,
      source_score REAL,
      temporal_score REAL,
      entity_score REAL,
      alignment_score REAL,
      final_score REAL,
      classification TEXT,  -- support | contradict | neutral
      created_at TEXT NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_scores_hypothesis ON evidence_scores(hypothesis_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_scores_chunk ON evidence_scores(chunk_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_scores_classification ON evidence_scores(classification);

    -- Evidence relations table (for graph)
    CREATE TABLE IF NOT EXISTS evidence_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hypothesis_id TEXT NOT NULL,
      evidence_id INTEGER NOT NULL,
      relation TEXT NOT NULL,  -- supports | contradicts | neutral
      strength REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (evidence_id) REFERENCES document_chunks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_relations_hypothesis ON evidence_relations(hypothesis_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_relations_evidence ON evidence_relations(evidence_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_relations_relation ON evidence_relations(relation);
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