// src/server/utils.ts
import { promises as fs } from "fs";
import path from "path";

export const dataDir = path.join(process.cwd(), "public", "data");

export async function readJSON<T>(filename: string): Promise<T> {
  const filePath = path.join(dataDir, filename);
  const data = await fs.readFile(filePath, "utf-8");
  return JSON.parse(data) as T;
}

export async function writeJSON<T>(filename: string, obj: T): Promise<void> {
  const filePath = path.join(dataDir, filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), "utf-8");
}

export async function appendJSON<T>(filename: string, entry: T): Promise<void> {
  const arr = await readJSON<T[]>(filename).catch(() => [] as T[]);
  arr.push(entry);
  await writeJSON(filename, arr);
}
