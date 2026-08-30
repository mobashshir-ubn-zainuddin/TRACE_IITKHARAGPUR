"use client";

import { useState, useCallback } from "react";

interface UploadedFile {
  id: number;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
  dataset?: {
    id: number;
    name: string;
    row_count: number;
    column_count: number;
    status: string;
  };
}

interface UploadState {
  file: File | null;
  preview: {
    headers: string[];
    rows: Record<string, unknown>[];
    rowCount: number;
    columnCount: number;
    schema: {
      columns: Array<{
        name: string;
        type: string;
        sampleValues: unknown[];
      }>;
      detectedDimensions: string[];
      detectedMeasures: string[];
      grain: string;
    } | null;
    columnMapping: Record<string, string>;
  } | null;
  uploading: boolean;
  error: string | null;
  success: boolean;
}

export default function DataPage() {
  const [files, setFiles] = useState<[]>();
  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    preview: null,
    uploading: false,
    error: null,
    success: false,
  });
  const [activeTab, setActiveTab] = useState<"upload" | "files">("upload");

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      if (res.ok) {
        const data = await res.json();
        // setFiles(data.files); // TypeScript will infer
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
    }
  }, []);

  const handleFileSelect = async (file: File) => {
    setUploadState(prev => ({ ...prev, file, error: null, success: false, preview: null }));
    
    // Validate file
    const allowedTypes = [
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/json",
      "application/pdf",
      "text/plain",
      "text/markdown",
    ];
    
    if (!["text/csv", "application/csv", "application/vnd.ms-excel", 
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/json", "application/pdf", "text/plain", "text/markdown"].includes(file.type)) {
      setUploadState(prev => ({ ...prev, error: "Unsupported file type" }));
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      setUploadState(prev => ({ ...prev, error: "File size exceeds 50MB limit" }));
      return;
    }
    
    // Generate preview
    try {
      const preview = await generatePreview(file);
      setUploadState(prev => ({ ...prev, preview, error: null }));
    } catch (error) {
      setUploadState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : "Failed to preview file" 
      }));
    }
  };

  const generatePreview = async (file: File) => {
    const text = await file.text();
    const ext = file.name.toLowerCase().split(".").pop();
    
    let headers: string[] = [];
    let rows: Record<string, unknown>[] = [];
    
    if (file.name.endsWith(".csv")) {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length > 0) {
        headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        for (let i = 1; i < Math.min(lines.length, 11); i++) {
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
      }
    } else if (file.name.endsWith(".json")) {
      const data = JSON.parse(file);
      if (Array.isArray(data) && data.length > 0) {
        headers = Object.keys(data[0]);
        rows = data.slice(0, 10).map(row => {
          const row: Record<string, unknown> = {};
          Object.keys(data[0]).forEach(k => {
            let val = (row as Record<string, unknown>)[k];
            if (val !== undefined && val !== "" && !isNaN(Number(val))) val = Number(val);
            row[k] = val;
          });
          return row;
        });
      }
    } else {
      // Text/Markdown/PDF - treat as text
      headers = ["content"];
      const lines = file.split(/\r?\n/).filter(l => l.trim());
      rows = lines.slice(0, 10).map(line => ({ content: line.trim() }));
    }
    
    // Detect schema
    const schema = detectSchema(headers, rows);
    const columnMapping = mapToCanonical(headers);
    
    return {
      headers,
      rows: rows.slice(0, 10),
      rowCount: rows.length,
      columnCount: headers.length,
      schema,
      columnMapping,
    };
  };

  const detectSchema = (headers: string[], rows: Record<string, unknown>[]) => {
    const columns = [];
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
        } else if (typeof firstVal === "number") {
          type = "number";
        } else if (typeof firstVal === "string") {
          const dateRegex = /^\d{4}-\d{2}-\d{2}/;
          if (dateRegex.test(firstVal) || firstVal.includes("/") && firstVal.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
            const allDates = values.every(v => {
              if (typeof v !== "string") return false;
              return v.match(/^\d{4}-\d{2}-\d{2}$/) || v.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
            });
            if (allDates) { type = "date"; isDate = true; }
          } else {
            const allNumeric = values.every(v => !isNaN(Number(v)) && v !== "");
            if (allNumeric) { type = "number"; isNumeric = true; }
          }
        }
        
        if (isBoolean) type = "boolean";
        else if (isDate) { type = "date"; }
        else if (isNumeric) { type = "number"; }
        else type = "string";
        
if (type === "number") detectedMeasures.push(header);
        else detectedDimensions.push(header);
      }
    }
  
  return {
      columns: headers.map(h => ({ name: h, type: "string" })),
      detectedDimensions,
      detectedMeasures,
      grain: "row",
    };
  }

  const mapToCanonical = (headers: string[]) => {
    const mapping: Record<string, string[]> = {
      date: ["date", "month", "year", "day", "order_date", "transaction_date", "sales_date"],
      revenue: ["revenue", "sales", "amount", "net_revenue", "gross_revenue", "sales_amount"],
      orders: ["orders", "order_count", "num_orders", "transactions"],
      quantity: ["quantity", "qty", "units", "units_sold"],
      discount: ["discount", "discount_pct", "discount_percent", "promo"],
      region: ["region", "territory", "area", "zone", "state", "province"],
      product: ["product", "product_name", "sku", "item", "item_name"],
      channel: ["channel", "sales_channel", "medium", "source"],
      sessions: ["sessions", "visits", "traffic"],
      conversions: ["conversions", "conversions", "leads"],
      marketing_spend: ["marketing_spend", "spend", "ad_spend", "advertising_cost"],
      inventory: ["inventory", "stock", "stock_level", "inventory_level"],
      stockout_rate: ["stockout_rate", "stockout", "out_of_stock_rate"],
      delivery_delay: ["delivery_delay", "delivery_days", "ship_time"],
    };
    
    const mapping: Record<string, string> = {};
    for (const header of headers) {
      const lowerHeader = header.toLowerCase().replace(/[_\s]+/g, "_");
      for (const [canonical, aliases] of Object.entries(mapping)) {
        if (aliases.some(a => lowerHeader.includes(a.toLowerCase()))) {
          mapping[header] = canonical;
          break;
        }
      }
      if (!mapping[header]) mapping[header] = header;
    }
    return mapping;
  }

  const handleUpload = async () => {
    const { file, preview } = uploadState;
    if (!file || !preview) return;
    
    setUploadState(prev => ({ ...prev, uploading: true, error: null }));
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        // Handle duplicate file case (409)
        if (res.status === 409) {
          setUploadState(prev => ({ 
            ...prev, 
            uploading: false, 
            error: null,
            success: true 
          }));
          // Redirect to dashboard after short delay
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 1500);
          return;
        }
        throw new Error(error.error || "Upload failed");
      }
      
      const result = await res.json();
      setUploadState(prev => ({ 
        ...prev, 
        uploading: false, 
        success: true,
        error: null 
      }));
      
      // Redirect to dashboard after successful upload
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
      
    } catch (error) {
      setUploadState(prev => ({ 
        ...prev, 
        uploading: false, 
        error: error instanceof Error ? error.message : "Upload failed" 
      }));
    }
  };

  const handleRemoveFile = (fileId: number) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    
    fetch(`/api/files/${fileId}`, { method: "DELETE" })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          fetchFiles();
        }
      })
      .catch(console.error);
  };

  // Preview content extracted to avoid JSX parsing issues
  const previewContent = uploadState.preview ? (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3">File Preview</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">Rows</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.rowCount || 0}</p>
        </div>
        <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">Columns</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.columnCount || 0}</p>
        </div>
        <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">Detected Dimensions</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.schema?.detectedDimensions?.length || 0}</p>
        </div>
        <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
          <p className="text-sm text-gray-500 dark:text-gray-400">Detected Measures</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.schema?.detectedMeasures?.length || 0}</p>
        </div>
      </div>
      
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Column Mapping</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-zinc-700">
                <th className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">Source Column</th>
                <th className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">Mapped To</th>
                <th className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">Type</th>
              </tr>
            </thead>
            <tbody>
              {uploadState.preview?.headers?.map((header: string) => (
                <tr key={header} className="border-b border-gray-100 dark:border-zinc-700">
                  <td className="p-2 font-mono text-gray-900 dark:text-white">{header}</td>
                  <td className="p-2">
                    <select
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                      defaultValue={uploadState.preview?.columnMapping?.[header] || header}
                    >
                      <option value="date">Date</option>
                      <option value="revenue">Revenue</option>
                      <option value="orders">Orders</option>
                      <option value="quantity">Quantity</option>
                      <option value="discount">Discount</option>
                      <option value="region">Region</option>
                      <option value="product">Product</option>
                      <option value="channel">Channel</option>
                      <option value="sessions">Sessions</option>
                      <option value="conversions">Conversions</option>
                      <option value="marketing_spend">Marketing Spend</option>
                      <option value="inventory">Inventory</option>
                      <option value="stockout_rate">Stockout Rate</option>
                      <option value="delivery_delay">Delivery Delay</option>
                      <option value={header}>{header} (Custom)</option>
                    </select>
                  </td>
                  <td className="p-2 font-mono text-gray-600 dark:text-gray-400">
                    {uploadState.preview?.schema?.columns?.find(c => c.name === header)?.type || "string"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="mb-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-2">Data Preview</h4>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-zinc-700">
                  {uploadState.preview?.headers?.map((header: string) => (
                    <th key={header} className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uploadState.preview?.rows?.map((row: Record<string, unknown>, i: number) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-zinc-700">
                    {uploadState.preview?.headers?.map((header: string) => (
                      <td key={header} className="p-2 text-gray-900 dark:text-white">
                        {row[header] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="p-8 min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black dark:text-white">Data Sources</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Upload and manage your business data files
          </p>
        </div>
        
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === "upload" 
                ? "bg-blue-600 text-white" 
                : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            Upload Data
          </button>
          <button
            onClick={() => setActiveTab("files")}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === "files" 
                ? "bg-blue-600 text-white" 
                : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            My Files
          </button>
        </div>
        
        {activeTab === "upload" ? (
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-zinc-700">
            <h2 className="text-xl font-semibold mb-4 text-black dark:text-white">Upload Data File</h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select File
              </label>
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  uploadState.file 
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                    : "border-gray-300 dark:border-zinc-600"
                }`}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".csv,.xlsx,.xls,.json,.pdf,.txt,.md"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
                {uploadState.file ? (
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="mt-2 text-lg font-medium text-gray-900 dark:text-white">{uploadState.file?.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {(uploadState.file?.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <button
                      onClick={() => setUploadState(prev => ({ ...prev, file: null, preview: null }))}
                      className="mt-4 text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Drag & drop your file here</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">or click to browse</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">CSV, XLSX, JSON, PDF, TXT, MD • Max 50MB</p>
                  </div>
                )}
          </div>
            </div>
            
            {uploadState.error && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-700 dark:text-red-300 font-medium">Error</p>
                <p className="text-red-600 dark:text-red-400 text-sm mt-1">{uploadState.error}</p>
              </div>
            )}
            
{uploadState.preview ? (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">File Preview</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Rows</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.rowCount || 0}</p>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Columns</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.columnCount || 0}</p>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Detected Dimensions</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.schema?.detectedDimensions?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-800 rounded-lg">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Detected Measures</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{uploadState.preview?.schema?.detectedMeasures?.length || 0}</p>
                  </div>
                </div>
                
                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Column Mapping</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-zinc-700">
                          <th className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">Source Column</th>
                          <th className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">Mapped To</th>
                          <th className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadState.preview?.headers?.map((header: string) => (
                          <tr key={header} className="border-b border-gray-100 dark:border-zinc-700">
                            <td className="p-2 font-mono text-gray-900 dark:text-white">{header}</td>
                            <td className="p-2">
                              <select
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-zinc-600 rounded bg-white dark:bg-zinc-800"
                                defaultValue={uploadState.preview?.columnMapping?.[header] || header}
                              >
                                <option value="date">Date</option>
                                <option value="revenue">Revenue</option>
                                <option value="orders">Orders</option>
                                <option value="quantity">Quantity</option>
                                <option value="discount">Discount</option>
                                <option value="region">Region</option>
                                <option value="product">Product</option>
                                <option value="channel">Channel</option>
                                <option value="sessions">Sessions</option>
                                <option value="conversions">Conversions</option>
                                <option value="marketing_spend">Marketing Spend</option>
                                <option value="inventory">Inventory</option>
                                <option value="stockout_rate">Stockout Rate</option>
                                <option value="delivery_delay">Delivery Delay</option>
                                <option value={header}>{header} (Custom)</option>
                              </select>
                            </td>
                            <td className="p-2 font-mono text-gray-600 dark:text-gray-400">
                              {uploadState.preview?.schema?.columns?.find(c => c.name === header)?.type || "string"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">Data Preview</h4>
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-zinc-700">
                            {uploadState.preview?.headers?.map((header: string) => (
                              <th key={header} className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {uploadState.preview?.rows?.map((row: Record<string, unknown>, i: number) => (
                            <tr key={i} className="border-b border-gray-100 dark:border-zinc-700">
                              {uploadState.preview?.headers?.map((header: string) => (
                                <td key={header} className="p-2 text-gray-900 dark:text-white">
                                  {row[header] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            
            {uploadState.success && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-green-700 dark:text-green-300 font-medium">Upload Successful!</p>
                <p className="text-green-600 dark:text-green-400 text-sm mt-1">
                  File uploaded and processed successfully.
                </p>
              </div>
            )}
            
            {uploadState.uploading && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-zinc-800 rounded-xl p-8 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-lg font-medium text-gray-900 dark:text-white">Processing file...</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">This may take a moment for large files</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-zinc-700">
              <h2 className="text-xl font-semibold text-black dark:text-white">Uploaded Files</h2>
              <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your uploaded data files</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-700">
                    <th className="text-left p-4 font-medium text-gray-700 dark:text-gray-300">File</th>
                    <th className="text-left p-4 font-medium text-gray-700 dark:text-gray-300">Type</th>
                    <th className="text-right p-4 font-medium text-gray-700 dark:text-gray-300">Size</th>
                    <th className="text-left p-4 font-medium text-gray-700 dark:text-gray-300">Status</th>
                    <th className="text-left p-4 font-medium text-gray-700 dark:text-gray-300">Dataset</th>
                    <th className="text-right p-4 font-medium text-gray-700 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((file: any) => (
                    <tr key={file.id} className="border-b border-gray-100 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                      <td className="p-4">
                        <p className="font-medium text-gray-900 dark:text-white">{file.original_filename || file.filename}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{file.mime_type}</p>
                      </td>
                      <td className="p-4 text-gray-600 dark:text-gray-400">{file.mime_type}</td>
                      <td className="text-right p-4 text-gray-600 dark:text-gray-400">
                        {(file.size_bytes / 1024 / 1024).toFixed(2)} MB
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          file.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 text-green-700' :
                          file.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 text-red-700' :
                          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 text-yellow-700'
                        }`}>
                          {file.status}
                        </span>
                      </td>
                      <td className="p-4">
                        {file.dataset ? (
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{file.dataset.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {file.dataset.row_count} rows • {file.dataset.column_count} cols
                            </p>
                          </div>
) : (
                          <span className="text-gray-500 dark:text-gray-400 text-sm">Not analyzed</span>
                        )}
                      </td>
                      <td className="text-right p-4">
                        <div className="flex items-center gap-2">
                          {file.dataset && (
                            <button
                              onClick={() => window.location.href = `/investigate?dataset=${file.dataset.id}`}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Analyze
                            </button>
)}
                          <button
                            onClick={() => handleRemoveFile(file.id)}
                            className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {files.length === 0 && (
              <div className="p-12 text-center">
                <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No files uploaded yet</p>
                <p className="mt-2 text-gray-500 dark:text-gray-400">Upload your first data file to get started</p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Upload File
                </button>
              </div>
            )}
          </div>
)}
          </div>
      </div>
    </div>
  return (
    <div className="p-8 min-h-screen bg-zinc-100 dark:bg-zinc-900">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black dark:text-white">Data Sources</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Upload and manage your business data files
          </p>
        </div>
        
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === "upload" 
                ? "bg-blue-600 text-white" 
                : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            Upload Data
          </button>
          <button
            onClick={() => setActiveTab("files")}
            className={`px-4 py-2 rounded-lg font-medium ${
              activeTab === "files" 
                ? "bg-blue-600 text-white" 
                : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300"
            }`}
          >
            My Files
          </button>
        </div>
        
        {activeTab === "upload" ? (
          <UploadTab 
            uploadState={uploadState} 
            previewContent={previewContent} 
            setUploadState={setUploadState} 
            handleUpload={handleUpload} 
            handleFileSelect={handleFileSelect} 
            setActiveTab={setActiveTab}
            router={router}
          />
        ) : (
          <FilesTab 
            files={files} 
            handleRemoveFile={handleRemoveFile} 
            setActiveTab={setActiveTab}
          />
        )}
      </div>
    </div>
  );
}