import { NextResponse } from "next/server";
import { getDB } from "@/server/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    
    const db = await getDB();
    
    let query = `
      SELECT f.*, d.id as dataset_id, d.name as dataset_name, d.status as dataset_status
      FROM uploaded_files f
      LEFT JOIN uploaded_datasets d ON d.file_id = f.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    
    if (status) {
      query += " AND f.status = ?";
      params.push(status);
    }
    
    query += " ORDER BY f.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    
    const files = await getDB().then(db => db.all(query, ...params));
    
    // Get total count
    let countQuery = "SELECT COUNT(*) as count FROM uploaded_files f WHERE 1=1";
    const countParams: unknown[] = [];
    if (status) {
      countQuery += " AND f.status = ?";
      countParams.push(status);
    }
    const countResult = await getDB().then(db => db.get(countQuery, ...countParams)) as { count: number };
    
    return NextResponse.json({
      files,
      total: countResult.count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List files error:", error);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}