import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { generateContentHash } from "@/server/evidence/embeddings/provider";
import { getEmbeddingService } from "@/server/evidence/embeddings";

const ALLOWED_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
  "application/pdf",
  "text/plain",
  "text/markdown",
];

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json", ".pdf", ".txt", ".md"];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported file type: ${file.type}` };
  }
  
  const ext = file.name.toLowerCase().substring(file.name.lastIndexOf("."));
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Unsupported file extension: ${ext}` };
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` };
  }
  
  if (file.size === 0) {
    return { valid: false, error: "File is empty" };
  }
  
  return { valid: true };
}

async function parseCSV(content: string): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, unknown>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      let val: unknown = values[i] || "";
      if (val !== "" && !isNaN(Number(val))) val = Number(val);
      row[h] = val;
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

async function parseXLSX(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: Record<string, unknown>[]; sheets: string[] }> {
  // Dynamic import to avoid loading xlsx unless needed
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  
  const results: { headers: string[]; rows: Record<string, unknown>[]; sheets: string[] } = {
    headers: [],
    rows: [],
    sheets: [],
  };
  
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];

    if (jsonData.length === 0) continue;

    const headers = jsonData[0].map((h) => String(h).trim());
    const rows: Record<string, unknown>[] = [];

    for (let i = 1; i < jsonData.length; i++) {
      const rowData = jsonData[i] ?? [];
      const row: Record<string, unknown> = {};
      headers.forEach((h, colIndex) => {
        let val: unknown = rowData[colIndex] ?? "";
        if (val !== "" && !isNaN(Number(val))) val = Number(val);
        row[h] = val;
      });
      rows.push(row);
    }
    
    results.sheets.push(sheetName);
    if (results.headers.length === 0) results.headers = headers;
    results.rows.push(...rows);
  }
  
  return results;
}

async function parseJSON(content: string): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON format");
  }
  
  if (Array.isArray(data)) {
    if (data.length === 0) return { headers: [], rows: [] };
    const headers = Object.keys(data[0] as Record<string, unknown>);
    const rows = data.map(row => {
      const rowObj: Record<string, unknown> = {};
      headers.forEach(h => {
        let val = (row as Record<string, unknown>)[h];
        if (val !== undefined && val !== "" && !isNaN(Number(val))) val = Number(val);
        rowObj[h] = val;
      });
      return rowObj;
    });
    return { headers, rows };
  }
  
  return { headers: [], rows: [] };
}

async function parseText(content: string): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  // For plain text/markdown, treat each line as a row with a "content" column
  const lines = content.trim().split(/\r?\n/).filter(l => l.trim());
  return {
    headers: ["content"],
    rows: lines.map(line => ({ content: line.trim() })),
  };
}

async function detectSchema(headers: string[], rows: Record<string, unknown>[]): Promise<{
  columns: Array<{ name: string; type: "date" | "number" | "string" | "boolean"; sampleValues: unknown[] }>;
  detectedDimensions: string[];
  detectedMeasures: string[];
  grain: string;
  dateColumns: string[];
  numericColumns: string[];
}> {
  const columns: Array<{ name: string; type: "date" | "number" | "string" | "boolean"; sampleValues: unknown[] }> = [];
  const detectedDimensions: string[] = [];
  const detectedMeasures: string[] = [];
  const dateColumns: string[] = [];
  const numericColumns: string[] = [];
  
  const sampleSize = Math.min(rows.length, 100);
  const sampleRows = rows.slice(0, sampleSize);
  
  for (const header of headers) {
    const values = sampleRows.map(r => r[header]).filter(v => v !== undefined && v !== null && v !== "");
    const uniqueValues = new Set(values.map(v => String(v)));
    
    let type: "date" | "number" | "string" | "boolean" = "string";
    let isDate = false;
    let isNumeric = false;
    let isBoolean = false;
    
    if (values.length > 0) {
      const firstVal = values[0];
      if (typeof firstVal === "boolean") {
        type = "boolean";
        isBoolean = true;
      } else if (typeof firstVal === "number") {
        type = "number";
        isNumeric = true;
      } else if (typeof firstVal === "string") {
        // Check if date
        const dateRegex = /^\d{4}-\d{2}-\d{2}/;
        if (dateRegex.test(firstVal) || firstVal.includes("/") && firstVal.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
          isDate = true;
          const allDates = values.every(v => {
            if (typeof v !== "string") return false;
            return dateRegex.test(v) || v.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
          });
          if (allDates) type = "date";
        } else {
          // Check if numeric
          const allNumeric = values.every(v => !isNaN(Number(v)) && v !== "");
          if (allNumeric) {
            type = "number";
            isNumeric = true;
          }
        }
      }
      
      if (isBoolean) type = "boolean";
      else if (isDate) { type = "date"; dateColumns.push(header); }
      else if (isNumeric) { type = "number"; numericColumns.push(header); }
      else type = "string";
      
      if (type === "number") detectedMeasures.push(header);
      else if (type === "date" || (uniqueValues.size / values.length < 0.5 && values.length > 10)) {
        detectedDimensions.push(header);
      } else {
        detectedDimensions.push(header);
      }
      
      columns.push({
        name: header,
        type,
        sampleValues: values.slice(0, 5),
      });
    }
  }
  
  // Detect grain (unique key columns)
  let grain = "row";
  if (headers.length > 0) {
    const candidateKeys = headers.filter(h => {
      const values = rows.map(r => r[h]).filter(v => v !== undefined && v !== null);
      return new Set(values).size === rows.length;
    });
    if (candidateKeys.length > 0) grain = candidateKeys.join(" + ");
  }
  
  return {
    columns,
    detectedDimensions,
    detectedMeasures,
    grain,
    dateColumns,
    numericColumns,
  };
}

function mapToCanonical(headers: string[]): Record<string, string> {
  const aliasMap: Record<string, string[]> = {
    date: ["date", "date", "month", "year", "day", "order_date", "transaction_date", "sales_date"],
    revenue: ["revenue", "sales", "amount", "net_revenue", "gross_revenue", "sales_amount", "net_sales"],
    orders: ["orders", "order_count", "num_orders", "order_count", "transactions"],
    quantity: ["quantity", "qty", "units", "units_sold"],
    discount: ["discount", "discount_pct", "discount_percent", "promo"],
    region: ["region", "territory", "area", "zone", "state", "province"],
    product: ["product", "product_name", "sku", "item", "item_name", "product_id"],
    channel: ["channel", "sales_channel", "medium", "source"],
    sessions: ["sessions", "visits", "traffic"],
    conversions: ["conversions", "conversions", "leads"],
    marketing_spend: ["marketing_spend", "spend", "ad_spend", "advertising_cost"],
    inventory: ["inventory", "stock", "stock_level", "inventory_level"],
    stockout_rate: ["stockout_rate", "stockout", "out_of_stock_rate"],
    delivery_delay: ["delivery_delay", "delivery_days", "ship_time"],
  };
  
  const result: Record<string, string> = {};
  for (const header of headers) {
    const lowerHeader = header.toLowerCase().replace(/[_\s]+/g, "_");
    for (const [canonical, aliases] of Object.entries(aliasMap)) {
      if (aliases.some(a => lowerHeader.includes(a.toLowerCase()))) {
        result[header] = canonical;
        break;
      }
    }
    if (!result[header]) result[header] = header;
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    
    const validation = validateFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentHash = await import("@/server/evidence/embeddings/provider").then(m => m.generateContentHash(buffer.toString("utf8")));
    
    // Check for duplicate
    const db = await getDB();
    const existing = await db.get("SELECT id FROM uploaded_files WHERE content_hash = ?", contentHash);
    if (existing) {
      // Return the existing dataset id too, so the caller can still open the
      // analysis for an already-ingested dataset instead of dead-ending.
      const existingDataset = await db.get(
        "SELECT id FROM uploaded_datasets WHERE file_id = ? ORDER BY id DESC LIMIT 1",
        existing.id
      );
      return NextResponse.json({
        error: "File already uploaded",
        fileId: existing.id,
        datasetId: existingDataset?.id ?? null,
      }, { status: 409 });
    }
    
    // Parse file based on type
    let parsed: { headers: string[]; rows: Record<string, unknown>[]; sheets?: string[] } = { headers: [], rows: [] };
    
    if (file.type === "text/csv" || file.name.endsWith(".csv")) {
      const content = buffer.toString("utf8");
      parsed = await parseCSV(content);
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      parsed = await parseXLSX(arrayBuffer);
    } else if (file.type === "application/json" || file.name.endsWith(".json")) {
      const content = buffer.toString("utf8");
      parsed = await parseJSON(content);
    } else if (file.type === "application/pdf") {
      // PDF parsing would require pdf-parse - for now, store as document
      parsed = { headers: ["content"], rows: [{ content: "PDF content - text extraction not implemented" }] };
    } else {
      const content = buffer.toString("utf8");
      parsed = await parseText(content);
    }
    
    // Detect schema
    const schema = await detectSchema(parsed.headers, parsed.rows);
    const columnMapping = mapToCanonical(parsed.headers);
    
    // Store file metadata
    const fileResult = await db.run(`
      INSERT INTO uploaded_files (filename, original_filename, mime_type, size_bytes, content_hash, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'uploaded', datetime('now'))
    `, file.name, file.name, file.type, file.size, contentHash);
    
    const fileId = (fileResult as { lastID: number }).lastID;

    let datasetId: number;
    try {
      // Store dataset metadata (`uploaded_datasets` timestamps with `uploaded_at`)
      const datasetResult = await db.run(`
        INSERT INTO uploaded_datasets (file_id, name, source_type, row_count, column_count, schema_hash, status, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'))
      `, fileId, file.name, file.type, parsed.rows.length, parsed.headers.length, contentHash);

      datasetId = (datasetResult as { lastID: number }).lastID;

      // Store column mappings
      for (const header of parsed.headers) {
        await db.run(`
          INSERT INTO dataset_columns (dataset_id, source_column, canonical_field, physical_type, semantic_type, role, nullable, unique_ratio)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, datasetId, header, columnMapping[header] || header,
          "string", "dimension", "dimension", 1, 0.5);
      }

      // Store rows (for structured data).
      // `uploaded_rows` holds one JSON document per row in its `data` column, so
      // arbitrary user schemas can be stored without altering the table.
      for (let i = 0; i < parsed.rows.length; i++) {
        await db.run(
          `INSERT INTO uploaded_rows (dataset_id, row_index, data) VALUES (?, ?, ?)`,
          datasetId,
          i,
          JSON.stringify(parsed.rows[i])
        );
      }
    } catch (err) {
      // Roll back the file row so a partial failure cannot register the content
      // hash and make every later retry look like a duplicate.
      await db.run("DELETE FROM uploaded_files WHERE id = ?", fileId).catch(() => {});
      throw err;
    }

    // Generate preview
    const preview = parsed.rows.slice(0, 10);
    
    return NextResponse.json({
      fileId,
      datasetId,
      filename: file.name,
      fileType: file.type,
      rowCount: parsed.rows.length,
      columnCount: parsed.headers.length,
      headers: parsed.headers,
      schema: schema,
      columnMapping,
      preview,
      status: "completed",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Upload failed" 
    }, { status: 500 });
  }
}