// src/server/signal/index.ts
// Thin, purpose-built contract on top of the KPI engine: "did something
// actually change, or is this normal business noise?" Everything downstream
// (RAG, hypotheses, uncertainty) consumes this compact signal rather than
// re-deriving anomaly logic.
import { computeKPI } from "../kpi";

export interface KPISignal {
  kpi: string;
  label: string;
  period: string;
  region?: string;
  product?: string;
  value: number;
  previousValue: number;
  change_pct: number;
  is_anomaly: boolean;
  severity: 'low' | 'medium' | 'high';
  zScore: number;
  normalRange: { low: number; high: number };
}

export async function getSignal(
  metric: string,
  month: string,
  filters?: { region?: string; product?: string; channel?: string }
): Promise<KPISignal> {
  const kpi = await computeKPI(metric, month, filters);
  return {
    kpi: kpi.metric,
    label: kpi.label,
    period: kpi.period,
    region: filters?.region,
    product: filters?.product,
    value: kpi.value,
    previousValue: kpi.previousValue,
    change_pct: kpi.changePct,
    is_anomaly: !!kpi.is_anomaly,
    severity: kpi.severity ?? 'low',
    zScore: kpi.zScore ?? 0,
    normalRange: kpi.normalRange ?? { low: 0, high: 0 },
  };
}
