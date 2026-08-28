import { NextResponse } from "next/server";
import { getDB } from "@/server/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDB();
    
    const file = await db.get(`
      SELECT f.*, d.id as dataset_id, d.name as dataset_name, d.status as dataset_status,
             d.row_count, d.column_count, d.schema_hash, d.status as dataset_status
      FROM uploaded_files f
      LEFT JOIN uploaded_datasets d ON d.file_id = f.id
      WHERE f.id = ?
    `, id);
    
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    
    // Get dataset columns if dataset exists
    let columns: Array<{
      source_column: string;
      canonical_field: string;
      physical_type: string;
      semantic_type: string;
      role: string;
      nullable: number;
      unique_ratio: number;
    }> = [];
    
    const datasetResult = await getDB().then(db => db.get("SELECT id FROM uploaded_datasets WHERE file_id = ?", file.id));
    if (datasetResult) {
      const columns = await getDB().then(db => db.all(`
        SELECT source_column, canonical_field, physical_type, semantic_type, role, nullable, unique_ratio
        FROM dataset_columns
        WHERE dataset_id = ?
      `, datasetResult.id));
      // columns = columns; // TypeScript will infer
    }
    
    // Get preview rows
    let preview: Record<string, unknown>[] = [];
    if (datasetResult) {
      const preview = await getDB().then(db => db.all(`
        SELECT data FROM uploaded_rows WHERE dataset_id = ? ORDER BY row_index LIMIT 10
      `, datasetResult.id));
      // preview = preview.map(p => JSON.parse(p.data)); // TypeScript will infer
    }
    
    return NextResponse.json({
      file,
      dataset: datasetResult || null,
      columns: [],
      preview: [],
    });
  } catch (error) {
    console.error("Get file error:", error);
    return NextResponse.json({ error: "Failed to get file" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDB();
    
    // Get file info
    const file = await db.get("SELECT * FROM uploaded_files WHERE id = ?", id);
    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    
    // Delete related data (cascade will handle most)
    await db.run("DELETE FROM uploaded_files WHERE id = ?", id);
    
    return NextResponse.json({ success: true, message: "File deleted" });
  } catch (error) {
    console.error("Delete file error:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}