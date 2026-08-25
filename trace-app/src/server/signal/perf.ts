const PERF_ENABLED = process.env.PERF_ENABLED === 'true';

interface PerfEntry {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

const perfEntries: PerfEntry[] = [];

export function perfStart(name: string, metadata?: Record<string, unknown>): (metadata?: Record<string, unknown>) => void {
  if (!PERF_ENABLED) return () => {};
  const startTime = Date.now();
  return (endMetadata?: Record<string, unknown>) => {
    const endTime = Date.now();
    perfEntries.push({
      name,
      startTime,
      endTime,
      duration: endTime - startTime,
      metadata: { ...metadata, ...endMetadata }
    });
    console.log(`[PERF] ${name} ${endTime - startTime}ms`, endMetadata ? JSON.stringify(endMetadata) : '');
  };
}

export function getPerfEntries(): PerfEntry[] {
  return [...perfEntries];
}

export function clearPerfEntries(): void {
  perfEntries.length = 0;
}