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

type TableSpec = { name: string; createSQL: string; indexSQL: string[] };

const TABLE_SPECS: TableSpec[] = [
  {
    name: "regions",
    createSQL: `CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )`,
    indexSQL: [],
  },
  {
    name: "products",
    createSQL: `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      base_price INTEGER,
      launch_date TEXT
    )`,
    indexSQL: [],
  },
  {
    name: "data_sources",
    createSQL: `CREATE TABLE IF NOT EXISTS data_sources (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      grain TEXT NOT NULL,
      refresh_cadence TEXT NOT NULL,
      last_refreshed_at TEXT NOT NULL,
      description TEXT
    )`,
    indexSQL: [],
  },
  {
    name: "sales_transactions",
    createSQL: `CREATE TABLE IF NOT EXISTS sales_transactions (
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
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_transactions(transaction_date)",
      "CREATE INDEX IF NOT EXISTS idx_sales_region ON sales_transactions(region_id)",
      "CREATE INDEX IF NOT EXISTS idx_sales_product ON sales_transactions(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_sales_order ON sales_transactions(order_id)",
      "CREATE INDEX IF NOT EXISTS idx_sales_date_region_product ON sales_transactions(transaction_date, region_id, product_id)",
    ],
  },
  {
    name: "marketing_daily",
    createSQL: `CREATE TABLE IF NOT EXISTS marketing_daily (
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
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_marketing_date ON marketing_daily(date)",
      "CREATE INDEX IF NOT EXISTS idx_marketing_region ON marketing_daily(region_id)",
      "CREATE INDEX IF NOT EXISTS idx_marketing_product ON marketing_daily(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_marketing_channel ON marketing_daily(channel)",
      "CREATE INDEX IF NOT EXISTS idx_marketing_campaign ON marketing_daily(campaign)",
      "CREATE INDEX IF NOT EXISTS idx_marketing_date_region ON marketing_daily(date, region_id)",
    ],
  },
  {
    name: "operations_daily",
    createSQL: `CREATE TABLE IF NOT EXISTS operations_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      region_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      inventory_available INTEGER NOT NULL,
      stockout_rate REAL NOT NULL,
      delivery_delay_rate REAL NOT NULL,
      FOREIGN KEY (region_id) REFERENCES regions(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_ops_date ON operations_daily(date)",
      "CREATE INDEX IF NOT EXISTS idx_ops_region ON operations_daily(region_id)",
      "CREATE INDEX IF NOT EXISTS idx_ops_product ON operations_daily(product_id)",
      "CREATE INDEX IF NOT EXISTS idx_ops_date_region_product ON operations_daily(date, region_id, product_id)",
    ],
  },
  {
    name: "decisions",
    createSQL: `CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi TEXT NOT NULL,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )`,
    indexSQL: [],
  },
  {
    name: "documents",
    createSQL: `CREATE TABLE IF NOT EXISTS documents (
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
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_documents_region ON documents(region)",
      "CREATE INDEX IF NOT EXISTS idx_documents_product ON documents(product)",
      "CREATE INDEX IF NOT EXISTS idx_documents_topic ON documents(topic)",
      "CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(document_date)",
      "CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source)",
      "CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash)",
    ],
  },
  {
    name: "document_chunks",
    createSQL: `CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      region TEXT,
      product TEXT,
      date_start TEXT,
      date_end TEXT,
      metadata TEXT,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id)",
      "CREATE INDEX IF NOT EXISTS idx_chunks_region ON document_chunks(region)",
      "CREATE INDEX IF NOT EXISTS idx_chunks_product ON document_chunks(product)",
      "CREATE INDEX IF NOT EXISTS idx_chunks_date_start ON document_chunks(date_start)",
      "CREATE INDEX IF NOT EXISTS idx_chunks_date_end ON document_chunks(date_end)",
    ],
  },
  {
    name: "embeddings",
    createSQL: `CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chunk_id INTEGER NOT NULL,
      embedding TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'unknown',
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_embeddings_chunk ON embeddings(chunk_id)",
      "CREATE INDEX IF NOT EXISTS idx_embeddings_provider_model ON embeddings(provider, model)",
      "CREATE INDEX IF NOT EXISTS idx_embeddings_content_hash ON embeddings(content_hash)",
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_unique ON embeddings(chunk_id, provider, model, dimension)",
    ],
  },
  {
    name: "evidence_scores",
    createSQL: `CREATE TABLE IF NOT EXISTS evidence_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hypothesis_id TEXT NOT NULL,
      chunk_id INTEGER NOT NULL,
      semantic_score REAL,
      source_score REAL,
      temporal_score REAL,
      entity_score REAL,
      alignment_score REAL,
      final_score REAL,
      classification TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chunk_id) REFERENCES document_chunks(id) ON DELETE CASCADE
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_evidence_scores_hypothesis ON evidence_scores(hypothesis_id)",
      "CREATE INDEX IF NOT EXISTS idx_evidence_scores_chunk ON evidence_scores(chunk_id)",
      "CREATE INDEX IF NOT EXISTS idx_evidence_scores_classification ON evidence_scores(classification)",
    ],
  },
  {
    name: "evidence_relations",
    createSQL: `CREATE TABLE IF NOT EXISTS evidence_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hypothesis_id TEXT NOT NULL,
      evidence_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      strength REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (evidence_id) REFERENCES document_chunks(id) ON DELETE CASCADE
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_evidence_relations_hypothesis ON evidence_relations(hypothesis_id)",
      "CREATE INDEX IF NOT EXISTS idx_evidence_relations_evidence ON evidence_relations(evidence_id)",
      "CREATE INDEX IF NOT EXISTS idx_evidence_relations_relation ON evidence_relations(relation)",
    ],
  },
  {
    name: "uploaded_files",
    createSQL: `CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_uploaded_files_hash ON uploaded_files(content_hash)",
      "CREATE INDEX IF NOT EXISTS idx_uploaded_files_status ON uploaded_files(status)",
      "CREATE INDEX IF NOT EXISTS idx_uploaded_files_created ON uploaded_files(created_at)",
    ],
  },
  {
    name: "uploaded_datasets",
    createSQL: `CREATE TABLE IF NOT EXISTS uploaded_datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      column_count INTEGER NOT NULL DEFAULT 0,
      schema_hash TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'active',
      FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_uploaded_datasets_file ON uploaded_datasets(file_id)",
      "CREATE INDEX IF NOT EXISTS idx_uploaded_datasets_status ON uploaded_datasets(status)",
    ],
  },
  {
    name: "dataset_columns",
    createSQL: `CREATE TABLE IF NOT EXISTS dataset_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      source_column TEXT NOT NULL,
      canonical_field TEXT,
      physical_type TEXT NOT NULL,
      semantic_type TEXT,
      role TEXT,
      nullable INTEGER DEFAULT 1,
      unique_ratio REAL,
      FOREIGN KEY (dataset_id) REFERENCES uploaded_datasets(id) ON DELETE CASCADE
    )`,
    indexSQL: ["CREATE INDEX IF NOT EXISTS idx_dataset_columns_dataset ON dataset_columns(dataset_id)"],
  },
  {
    name: "dataset_mappings",
    createSQL: `CREATE TABLE IF NOT EXISTS dataset_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      source_column TEXT NOT NULL,
      canonical_field TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      confirmed_by_user INTEGER DEFAULT 0,
      FOREIGN KEY (dataset_id) REFERENCES uploaded_datasets(id) ON DELETE CASCADE
    )`,
    indexSQL: ["CREATE INDEX IF NOT EXISTS idx_dataset_mappings_dataset ON dataset_mappings(dataset_id)"],
  },
  {
    name: "uploaded_rows",
    createSQL: `CREATE TABLE IF NOT EXISTS uploaded_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      data TEXT NOT NULL,
      FOREIGN KEY (dataset_id) REFERENCES uploaded_datasets(id) ON DELETE CASCADE
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_uploaded_rows_dataset ON uploaded_rows(dataset_id)",
      "CREATE INDEX IF NOT EXISTS idx_uploaded_rows_index ON uploaded_rows(dataset_id, row_index)",
    ],
  },
  {
    name: "analysis_runs",
    createSQL: `CREATE TABLE IF NOT EXISTS analysis_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      metric TEXT NOT NULL,
      period TEXT NOT NULL,
      filters TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      kpi_result TEXT,
      signal_result TEXT,
      driver_result TEXT,
      evidence_result TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (dataset_id) REFERENCES uploaded_datasets(id) ON DELETE CASCADE
    )`,
    indexSQL: [
      "CREATE INDEX IF NOT EXISTS idx_analysis_runs_dataset ON analysis_runs(dataset_id)",
      "CREATE INDEX IF NOT EXISTS idx_analysis_runs_status ON analysis_runs(status)",
      "CREATE INDEX IF NOT EXISTS idx_analysis_runs_created ON analysis_runs(created_at)",
    ],
  },
];

type ColumnInfo = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };

/**
 * Adds any column that `createSQL` declares but the on-disk table is missing.
 * This is what makes migrations safe to run against a database created by an
 * older version of TRACE (e.g. an `embeddings` table from before the
 * provider/model/dimension/content_hash columns existed): `CREATE TABLE IF
 * NOT EXISTS` is a no-op once the table exists, so newly-added columns would
 * otherwise never appear on an existing database.
 *
 * The expected column list is derived by creating the same DDL in a scratch
 * in-memory database and reading it back via PRAGMA table_info, so it can
 * never drift from the CREATE TABLE statement above it.
 */
async function upgradeTableColumns(
  db: Database<sqlite3.Database, sqlite3.Statement>,
  spec: TableSpec
): Promise<void> {
  const existing: ColumnInfo[] = await db.all(`PRAGMA table_info(${spec.name})`);
  if (existing.length === 0) return; // table doesn't exist yet (fresh DB) - CREATE TABLE already handled it

  const sqlite3Mem = (await import("sqlite3")).default;
  const memDb = await open({ filename: ":memory:", driver: sqlite3Mem.Database });
  let expected: ColumnInfo[] = [];
  try {
    await memDb.exec(spec.createSQL);
    expected = await memDb.all(`PRAGMA table_info(${spec.name})`);
  } finally {
    await memDb.close();
  }

  const existingNames = new Set(existing.map((c) => c.name));
  for (const col of expected) {
    if (existingNames.has(col.name) || col.pk) continue;

    let defClause = col.type || "TEXT";
    if (col.dflt_value !== null && col.dflt_value !== undefined) {
      defClause += ` DEFAULT ${col.dflt_value}`;
    } else if (col.notnull) {
      // SQLite requires a default when adding a NOT NULL column to a table
      // that may already have rows, so backfill with a type-appropriate value.
      const fallback = /INT/i.test(col.type) ? "0" : /REAL|FLOA|DOUB/i.test(col.type) ? "0" : "''";
      defClause += ` NOT NULL DEFAULT ${fallback}`;
    }

    try {
      await db.exec(`ALTER TABLE ${spec.name} ADD COLUMN ${col.name} ${defClause}`);
      console.log(`[migrate] ${spec.name}: added missing column "${col.name}"`);
    } catch (err) {
      console.warn(`[migrate] ${spec.name}: could not add column "${col.name}":`, err);
    }
  }
}

export async function runMigrations(): Promise<void> {
  const db = await getDB();

  // 1. Ensure every table exists (no-op for tables that already exist).
  for (const spec of TABLE_SPECS) {
    await db.exec(spec.createSQL);
  }

  // 2. Upgrade any pre-existing table to have every column the current code
  //    expects (handles databases created by an older version of TRACE).
  for (const spec of TABLE_SPECS) {
    await upgradeTableColumns(db, spec);
  }

  // 3. Create indexes now that every table has the expected columns. Each
  //    statement runs independently so one failure (e.g. a UNIQUE index that
  //    can't be built because legacy data has duplicates) can't block the
  //    rest of the migration.
  for (const spec of TABLE_SPECS) {
    for (const indexSQL of spec.indexSQL) {
      try {
        await db.exec(indexSQL);
      } catch (err) {
        console.warn(`[migrate] ${spec.name}: could not create index:`, err);
      }
    }
  }
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