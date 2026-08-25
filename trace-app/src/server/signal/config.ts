import { SignalConfig, DEFAULT_SIGNAL_CONFIG } from "./types";

let signalConfig: SignalConfig = { ...DEFAULT_SIGNAL_CONFIG };

export function getSignalConfig(): SignalConfig {
  return signalConfig;
}

export function updateSignalConfig(updates: Partial<SignalConfig>): void {
  signalConfig = { ...signalConfig, ...updates };
}

export function resetSignalConfig(): void {
  signalConfig = { ...DEFAULT_SIGNAL_CONFIG };
}