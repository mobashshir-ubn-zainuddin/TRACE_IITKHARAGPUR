// src/server/types.ts
export interface EvidenceItem {
  id: number;
  text: string;
  source: string;
  region: string;
  topic: string;
  date: string; // YYYY-MM-DD
  // embedding added at runtime
  embedding?: number[];
}

export interface DecisionItem {
  kpi: string;
  action: string;
  timestamp: string; // ISO string
}
