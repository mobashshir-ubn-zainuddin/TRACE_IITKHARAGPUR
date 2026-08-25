import { NextResponse } from "next/server";
import { getKPIDefinition, getAllKPIMetrics, normalizeMetric } from "@/server/kpi/definitions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawMetric = searchParams.get("metric");

  if (rawMetric) {
    const metric = normalizeMetric(rawMetric);
    const def = getKPIDefinition(metric);
    if (!def) {
      return NextResponse.json({ error: `Unknown metric: ${rawMetric}` }, { status: 404 });
    }
    return NextResponse.json({
      metric: def.name,
      label: def.label,
      description: def.description,
      formula: def.formula,
      source: def.source,
      sourceColumns: def.sourceColumns,
      dimensions: def.dimensions,
      unit: def.unit,
      drivers: def.drivers,
      aggregation: def.aggregation,
      refreshCadence: def.refreshCadence,
      materialityThreshold: def.materialityThreshold
    });
  }

  const metrics = getAllKPIMetrics().map(m => {
    const def = getKPIDefinition(m)!;
    return {
      metric: def.name,
      label: def.label,
      description: def.description,
      formula: def.formula,
      source: def.source,
      unit: def.unit
    };
  });

  return NextResponse.json({ metrics });
}