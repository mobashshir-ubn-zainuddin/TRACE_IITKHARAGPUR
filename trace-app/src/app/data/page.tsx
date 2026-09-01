"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json", ".pdf", ".txt", ".md"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const CANONICAL_FIELDS = [
  "date",
  "revenue",
  "orders",
  "quantity",
  "discount",
  "region",
  "product",
  "channel",
  "sessions",
  "conversions",
  "marketing_spend",
  "inventory",
  "stockout_rate",
  "delivery_delay",
];

const CANONICAL_ALIASES: Record<string, string[]> = {
  date: ["date", "month", "day", "order_date", "transaction_date", "sales_date"],
  revenue: ["revenue", "sales", "amount", "net_revenue", "gross_revenue", "net_sales"],
  orders: ["orders", "order_count", "transactions"],
  quantity: ["quantity", "qty", "units"],
  discount: ["discount", "promo"],
  region: ["region", "territory", "area", "zone", "state"],
  product: ["product", "sku", "item"],
  channel: ["channel", "medium", "source"],
  sessions: ["sessions", "visits", "traffic"],
  conversions: ["conversions", "leads"],
  marketing_spend: ["marketing_spend", "spend", "ad_spend"],
  inventory: ["inventory", "stock"],
  stockout_rate: ["stockout_rate", "stockout"],
  delivery_delay: ["delivery_delay", "delivery_days", "ship_time"],
};

type ColumnType = "date" | "number" | "string";

interface PreviewColumn {
  name: string;
  type: ColumnType;
}

interface FilePreview {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  columnCount: number;
  columns: PreviewColumn[];
  dimensions: string[];
  measures: string[];
  columnMapping: Record<string, string>;
}

interface UploadedFileRow {
  id: number;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  dataset_id: number | null;
  dataset_name: string | null;
}

function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
}

function coerce(value: string): unknown {
  if (value === "") return "";
  if (!Number.isNaN(Number(value))) return Number(value);
  return value;
}

function detectType(values: unknown[]): ColumnType {
  const present = values.filter((v) => v !== undefined && v !== null && v !== "");
  if (present.length === 0) return "string";
  if (present.every((v) => typeof v === "number")) return "number";
  if (
    present.every(
      (v) => typeof v === "string" && (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v))
    )
  ) {
    return "date";
  }
  return "string";
}

function mapToCanonical(header: string): string {
  const normalized = header.toLowerCase().replace(/[\s-]+/g, "_");
  for (const [canonical, aliases] of Object.entries(CANONICAL_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) return canonical;
  }
  return header;
}

function buildPreview(headers: string[], rows: Record<string, unknown>[]): FilePreview {
  const columns: PreviewColumn[] = headers.map((header) => ({
    name: header,
    type: detectType(rows.map((row) => row[header])),
  }));

  const columnMapping: Record<string, string> = {};
  headers.forEach((header) => {
    columnMapping[header] = mapToCanonical(header);
  });

  return {
    headers,
    rows: rows.slice(0, 10),
    rowCount: rows.length,
    columnCount: headers.length,
    columns,
    dimensions: columns.filter((c) => c.type !== "number").map((c) => c.name),
    measures: columns.filter((c) => c.type === "number").map((c) => c.name),
    columnMapping,
  };
}

async function generatePreview(file: File): Promise<FilePreview | null> {
  const ext = fileExtension(file.name);

  if (ext === ".csv" || ext === ".txt" || ext === ".md") {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length === 0) return null;

    if (ext !== ".csv") {
      const rows = lines.map((line) => ({ content: line.trim() }));
      return buildPreview(["content"], rows);
    }

    const headers = splitCsvLine(lines[0]);
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = splitCsvLine(lines[i]);
      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        row[header] = coerce(values[idx] ?? "");
      });
      rows.push(row);
    }
    return buildPreview(headers, rows);
  }

  if (ext === ".json") {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const headers = Object.keys(parsed[0] as Record<string, unknown>);
    const rows = (parsed as Record<string, unknown>[]).map((row) => {
      const next: Record<string, unknown> = {};
      headers.forEach((header) => {
        next[header] = row[header];
      });
      return next;
    });
    return buildPreview(headers, rows);
  }

  // XLSX / PDF are parsed server-side during upload.
  return null;
}

export default function DataPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"upload" | "files">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFileRow[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch("/api/files");
      if (res.ok) {
        const data = await res.json();
        setFiles(Array.isArray(data.files) ? data.files : []);
      }
    } catch (err) {
      console.error("Failed to fetch files:", err);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  const showFilesTab = () => {
    setActiveTab("files");
    void fetchFiles();
  };

  const resetSelection = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setStatus(null);
  };

  const handleFileSelect = async (selected: File) => {
    setError(null);
    setStatus(null);
    setPreview(null);

    const ext = fileExtension(selected.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFile(null);
      setError(`Unsupported file type: ${ext || "unknown"}`);
      return;
    }
    if (selected.size === 0) {
      setFile(null);
      setError("File is empty");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError("File size exceeds the 50MB limit");
      return;
    }

    setFile(selected);

    try {
      const generated = await generatePreview(selected);
      setPreview(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview file");
    }
  };

  /**
   * Runs the TRACE M1→M4 pipeline for the ingested dataset and stores the run,
   * so the dashboard and investigation views have an analysis to open.
   * A failure here must never block the flow — the dashboard reads the
   * governed dataset directly.
   */
  const runAnalysis = async (datasetId: number | null) => {
    if (!datasetId) return;
    try {
      await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasetId, metric: "revenue", period: "2026-08" }),
      });
    } catch (err) {
      console.warn("Analysis could not be started:", err);
    }
  };

  const handleUpload = async () => {
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    setStatus("Uploading dataset...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const payload = await res.json().catch(() => ({}));

      if (res.ok || res.status === 409) {
        setStatus(
          res.ok
            ? `Dataset uploaded successfully — ${payload.rowCount ?? 0} rows, ${payload.columnCount ?? 0} columns. Running TRACE analysis...`
            : "Demo dataset already ingested. Running TRACE analysis..."
        );
        await runAnalysis(payload.datasetId ?? null);
        setStatus("Analysis ready. Loading dashboard...");
        router.push("/dashboard");
        return;
      }

      setError(payload.error || `Upload failed (HTTP ${res.status})`);
      setStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStatus(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Data Sources</h1>
        <p className="text-muted-foreground">
          Upload your business data. TRACE profiles the schema, maps it to governed KPI fields, and runs the
          intelligence pipeline.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setActiveTab("upload")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "upload"
              ? "bg-primary text-primary-foreground"
              : "glass-panel text-muted-foreground hover:text-foreground"
          }`}
        >
          Upload Data
        </button>
        <button
          onClick={showFilesTab}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "files"
              ? "bg-primary text-primary-foreground"
              : "glass-panel text-muted-foreground hover:text-foreground"
          }`}
        >
          My Files
        </button>
      </div>

      {activeTab === "upload" ? (
        <div className="glass-panel rounded-2xl border border-border p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Upload Data File</h2>
            <p className="text-sm text-muted-foreground mt-1">
              CSV, XLSX, JSON, PDF, TXT or MD · max 50MB
            </p>
          </div>

          <label
            htmlFor="file-input"
            className={`block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              file ? "border-primary/60 bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            <input
              id="file-input"
              type="file"
              accept={ALLOWED_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) void handleFileSelect(selected);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="w-10 h-10 text-primary" />
                <p className="text-base font-medium text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <UploadCloud className="w-10 h-10 text-muted-foreground" />
                <p className="text-base font-medium text-foreground">Click to browse for a dataset</p>
                <p className="text-sm text-muted-foreground">
                  Try the bundled demo dataset: <span className="font-mono">demo-sales-data.csv</span>
                </p>
              </div>
            )}
          </label>

          {file && (
            <button
              onClick={resetSelection}
              className="self-start inline-flex items-center gap-1 text-sm text-destructive hover:underline"
            >
              <X className="w-4 h-4" /> Remove file
            </button>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Upload error</p>
                <p className="text-sm text-destructive/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          {status && !error && (
            <div className="rounded-xl border border-success/40 bg-success/10 p-4 flex items-start gap-3">
              {uploading ? (
                <Loader2 className="w-5 h-5 text-success shrink-0 mt-0.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
              )}
              <p className="text-sm text-success">{status}</p>
            </div>
          )}

          {preview && (
            <div className="rounded-2xl border border-border bg-card/40 p-5 flex flex-col gap-5">
              <h3 className="font-semibold text-foreground">File Preview</h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Rows" value={preview.rowCount} />
                <Stat label="Columns" value={preview.columnCount} />
                <Stat label="Dimensions" value={preview.dimensions.length} />
                <Stat label="Measures" value={preview.measures.length} />
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-2">Column Mapping</h4>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left p-2 font-medium text-muted-foreground">Source Column</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Mapped To</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.headers.map((header) => {
                        const mapped = preview.columnMapping[header] ?? header;
                        const type = preview.columns.find((c) => c.name === header)?.type ?? "string";
                        return (
                          <tr key={header} className="border-t border-border">
                            <td className="p-2 font-mono text-foreground">{header}</td>
                            <td className="p-2">
                              <select
                                defaultValue={CANONICAL_FIELDS.includes(mapped) ? mapped : "__custom"}
                                className="w-full px-2 py-1 rounded bg-card border border-border text-foreground text-sm"
                              >
                                {CANONICAL_FIELDS.map((field) => (
                                  <option key={field} value={field}>
                                    {field}
                                  </option>
                                ))}
                                <option value="__custom">{header} (unmapped)</option>
                              </select>
                            </td>
                            <td className="p-2 font-mono text-muted-foreground">{type}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-foreground mb-2">Data Preview</h4>
                <div className="overflow-x-auto rounded-xl border border-border max-h-72">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        {preview.headers.map((header) => (
                          <th key={header} className="text-left p-2 font-medium text-muted-foreground whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {preview.headers.map((header) => (
                            <td key={header} className="p-2 text-foreground whitespace-nowrap">
                              {String(row[header] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {uploading ? "Uploading..." : "Upload & Analyze"}
          </button>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Uploaded Datasets</h2>
            <button
              onClick={() => void fetchFiles()}
              className="text-sm text-primary hover:underline"
            >
              Refresh
            </button>
          </div>

          {filesLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading files...
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Database className="w-8 h-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">No datasets uploaded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-3 font-medium text-muted-foreground">File</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Size</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="p-3 text-foreground">{row.original_filename || row.filename}</td>
                      <td className="p-3 font-mono text-muted-foreground">
                        {fileExtension(row.filename) || row.mime_type}
                      </td>
                      <td className="p-3 text-muted-foreground">{(row.size_bytes / 1024).toFixed(1)} KB</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-success/15 text-success">
                          {row.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{row.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
