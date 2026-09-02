import type { LucideIcon } from "lucide-react";

export interface WorkflowStage {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Vertical numbered stage list connected by a rail line - reads as a product
 * architecture diagram (data -> signal -> driver -> evidence -> confidence ->
 * story -> action), not a marketing infographic.
 */
export default function TraceWorkflow({ stages }: { stages: WorkflowStage[] }) {
  return (
    <ol className="relative flex flex-col gap-2 max-w-2xl mx-auto">
      <div className="absolute left-[23px] top-6 bottom-6 w-px bg-border" aria-hidden="true" />
      {stages.map((stage) => {
        const Icon = stage.icon;
        return (
          <li key={stage.number} className="relative flex gap-5 py-4">
            <div className="relative z-10 shrink-0 w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col gap-1 pt-1.5">
              <span className="text-xs font-mono font-semibold text-primary tracking-wider">{stage.number}</span>
              <h3 className="text-base font-semibold text-foreground">{stage.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{stage.description}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
