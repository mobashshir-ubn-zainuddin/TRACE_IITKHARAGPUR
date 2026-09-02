import Link from "next/link";
import {
  ArrowRight,
  Database,
  Activity,
  GitBranch,
  FileSearch,
  ShieldCheck,
  MessageSquareText,
  Compass,
  BarChart3,
  Scale,
  GitCompareArrows,
  MessagesSquare,
  Sparkles,
} from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import FeatureCard from "@/components/FeatureCard";
import TraceWorkflow, { type WorkflowStage } from "@/components/TraceWorkflow";

const workflowStages: WorkflowStage[] = [
  { number: "01", title: "Data", description: "Governed business data — seeded sales/marketing/operations tables, plus uploaded CSV, XLSX, JSON, PDF, TXT or MD files.", icon: Database },
  { number: "02", title: "Signal", description: "Detect material KPI movements: month-over-month change, z-score/robust z-score deviation, seasonality and statistical significance.", icon: Activity },
  { number: "03", title: "Driver", description: "Rank candidate explanatory factors using association, Shapley-style contribution, and segment-level consistency checks.", icon: GitBranch },
  { number: "04", title: "Evidence", description: "Retrieve and score structured and unstructured evidence for each hypothesis, and flag contradictions between sources.", icon: FileSearch },
  { number: "05", title: "Confidence", description: "Quantify uncertainty per hypothesis and distinguish an associated, candidate driver from a confirmed cause.", icon: ShieldCheck },
  { number: "06", title: "Story", description: "Turn the KPI, driver and evidence chain into a decision-ready explanation on the Dashboard and Investigation pages.", icon: Compass },
  { number: "07", title: "Action", description: "Ask TRACE Chat what to investigate next — grounded in the same KPI, driver and evidence context, never invented.", icon: MessageSquareText },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-28 md:gap-36 pb-16">
      {/* ================= HERO ================= */}
      <section className="flex flex-col items-center text-center gap-8 pt-8 md:pt-16 animate-in fade-in duration-700">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/60 text-xs font-medium text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Decision Intelligence, not just another dashboard
        </span>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl text-balance">
          From Business Signals to <span className="text-primary">Confident Decisions</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed text-balance">
          TRACE transforms business data into explainable intelligence — detecting material changes,
          identifying likely drivers, tracing evidence, and helping teams decide what to do next.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Explore Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#workflow"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            See How TRACE Works
          </a>
        </div>

        {/* DATA -> SIGNAL -> DRIVER -> EVIDENCE -> DECISION strip */}
        <div className="w-full max-w-4xl mt-8 glass-panel rounded-2xl border border-border p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 text-sm font-medium">
            {["Data", "Signal", "Driver", "Evidence", "Confidence", "Decision"].map((step, i, arr) => (
              <div key={step} className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-muted text-foreground whitespace-nowrap">{step}</span>
                {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= WHAT IS TRACE ================= */}
      <section className="flex flex-col gap-12">
        <SectionHeading
          eyebrow="What is TRACE?"
          title="Beyond dashboards"
          subtitle="TRACE is an AI-native business intelligence and decision-intelligence platform built to move beyond dashboards."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
          <div className="glass-panel rounded-2xl border border-border p-6 flex flex-col gap-4">
            <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Traditional BI</span>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="px-3 py-1.5 rounded-lg bg-muted">Charts</span>
              <ArrowRight className="w-4 h-4" />
              <span className="px-3 py-1.5 rounded-lg bg-muted">Metrics</span>
              <ArrowRight className="w-4 h-4" />
              <span className="px-3 py-1.5 rounded-lg bg-muted">Reports</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Traditional BI tells teams <span className="text-foreground">&ldquo;what happened?&rdquo;</span> — and stops there.
            </p>
          </div>

          <div className="glass-panel rounded-2xl border border-primary/40 p-6 flex flex-col gap-4">
            <span className="text-xs font-semibold tracking-widest uppercase text-primary">TRACE</span>
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {["Data", "KPI", "Signal", "Driver", "Evidence", "Confidence", "Action"].map((s, i, arr) => (
                <span key={s} className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary">{s}</span>
                  {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              TRACE extends that workflow to <span className="text-foreground">why it happened</span>, what evidence
              supports the explanation, how confident TRACE is, and what to investigate or do next.
            </p>
          </div>
        </div>
      </section>

      {/* ================= WORKFLOW ================= */}
      <section id="workflow" className="flex flex-col gap-14 scroll-mt-20">
        <SectionHeading
          eyebrow="Intelligence Workflow"
          title="Seven stages, one investigation"
          subtitle="Every TRACE analysis run moves through the same governed pipeline, end to end."
        />
        <TraceWorkflow stages={workflowStages} />
      </section>

      {/* ================= WHY TRACE ================= */}
      <section className="flex flex-col gap-12">
        <SectionHeading eyebrow="Why TRACE" title="Built for trustworthy analysis" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={GitCompareArrows}
            title="Explainable Intelligence"
            description="Every major finding is tied to measurable signals, ranked drivers and retrieved evidence — not a black box."
          />
          <FeatureCard
            icon={FileSearch}
            title="Evidence-Grounded Analysis"
            description="TRACE distinguishes supported findings from open hypotheses, and surfaces uncertainty instead of hiding it."
          />
          <FeatureCard
            icon={Scale}
            title="Materiality-Aware Signals"
            description="Not every change matters. TRACE prioritizes movements by statistical significance and business materiality."
          />
          <FeatureCard
            icon={BarChart3}
            title="Decision Context"
            description="Move from a KPI movement to a ranked investigation and a recommended next step, in one workflow."
          />
          <FeatureCard
            icon={MessagesSquare}
            title="Human-in-the-Loop"
            description="Analysts can challenge findings, inspect the underlying evidence, and continue the investigation through Chat."
          />
        </div>
      </section>

      {/* ================= PRODUCT EXPERIENCE ================= */}
      <section className="flex flex-col gap-12">
        <SectionHeading
          eyebrow="Product Experience"
          title="One workflow, start to finish"
          subtitle="The same path every time: upload data, let TRACE analyze it, then explore the results."
        />
        <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
          {[
            { label: "Data", href: "/data" },
            { label: "Upload dataset", href: "/data" },
            { label: "Analyze", href: "/data" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "Investigate", href: "/investigate" },
            { label: "Chat", href: "/chat" },
          ].map((step, i, arr) => (
            <span key={step.label + i} className="flex items-center gap-3">
              <Link
                href={step.href}
                className="px-4 py-2 rounded-lg glass-panel border border-border text-sm font-medium text-foreground hover:border-primary/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                {step.label}
              </Link>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </span>
          ))}
        </div>
      </section>

      {/* ================= TRUST / RESPONSIBLE AI ================= */}
      <section className="flex flex-col gap-12">
        <SectionHeading eyebrow="Responsible AI" title="TRACE knows when it doesn't know" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
          <ul className="glass-panel rounded-2xl border border-border p-6 flex flex-col gap-4 text-sm">
            {[
              ["Statistical significance", "Movements are only flagged as signals once they clear a z-score / robust z-score threshold, not on raw magnitude alone."],
              ["Evidence confidence", "Each hypothesis carries a confidence score built from association strength, evidence availability and segment consistency."],
              ["Contradiction detection", "TRACE surfaces evidence that contradicts a hypothesis, not just evidence that supports it."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">{title}</p>
                  <p className="text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <ul className="glass-panel rounded-2xl border border-border p-6 flex flex-col gap-4 text-sm">
            {[
              ["Provenance", "Findings link back to the source table, document or evidence chunk they were computed or retrieved from."],
              ["Correlation ≠ causation", "TRACE labels drivers as associated candidates, never confirmed causes, until evidence supports otherwise."],
              ["Insufficient evidence states", "When the current analysis can't support an answer, TRACE says so explicitly instead of guessing."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">{title}</p>
                  <p className="text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-center text-sm text-muted-foreground max-w-xl mx-auto font-mono">
          &ldquo;Candidate driver ≠ confirmed cause.&rdquo;
        </p>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="glass-panel rounded-3xl border border-border p-10 md:p-16 flex flex-col items-center text-center gap-6">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground text-balance">
          Turn business data into decisions.
        </h2>
        <p className="text-muted-foreground text-lg max-w-xl text-balance">
          Investigate the signal. Trace the evidence. Make the decision.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Open TRACE Dashboard <ArrowRight className="w-4 h-4" />
        </Link>
      </section>
    </div>
  );
}
