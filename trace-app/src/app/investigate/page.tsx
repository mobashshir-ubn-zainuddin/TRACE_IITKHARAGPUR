"use client";

import { useState } from "react";
import { ArrowLeft, BrainCircuit, BarChart3, AlertTriangle, Network, ShieldAlert, CheckCircle2, RotateCw } from "lucide-react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { EvidenceGraph } from "@/components/EvidenceGraph";

// Mock data for Driver Decomposition (Waterfall chart approximation)
const decompositionData = [
  { name: "Previous", value: 10, fill: "var(--muted-foreground)" },
  { name: "AOV Decline", value: -0.61, fill: "var(--destructive)" },
  { name: "Orders Decline", value: -0.2, fill: "var(--destructive)" },
  { name: "Pricing", value: 0.06, fill: "var(--success)" },
  { name: "Refunds", value: -0.07, fill: "var(--destructive)" },
  { name: "Current", value: 9.18, fill: "var(--primary)" },
];

export default function InvestigatePage() {
  const [isChallenging, setIsChallenging] = useState(false);
  const [conclusionStatus, setConclusionStatus] = useState<'supported' | 'ambiguous'>('supported');

  const handleChallenge = () => {
    setIsChallenging(true);
    // Simulate an AI re-evaluation
    setTimeout(() => {
      setIsChallenging(false);
      setConclusionStatus('ambiguous');
    }, 2000);
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-full hover:bg-muted transition-colors border border-transparent hover:border-border">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-destructive" />
              Revenue Decline in North India
            </h1>
            <p className="text-muted-foreground">Detailed AI investigation and root cause analysis</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleChallenge}
            disabled={isChallenging || conclusionStatus === 'ambiguous'}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isChallenging ? <RotateCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            Challenge Conclusion
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KPI Storytelling */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            AI Synthesis
          </h3>
          <div className="prose prose-invert max-w-none">
            <p className="text-lg leading-relaxed text-foreground/90">
              Revenue decreased <strong className="text-destructive">8.2%</strong> in North India compared with the previous month, significantly below its historical baseline.
            </p>
            <p className="text-muted-foreground mt-4">
              The decline was primarily associated with a <span className="text-destructive font-medium">6.1% decrease in AOV</span> and a <span className="text-destructive font-medium">19% decrease in premium-category sales</span>, while order volume declined only 2%.
            </p>
            
            {conclusionStatus === 'supported' ? (
              <div className="mt-6 p-4 bg-primary/10 border border-primary/20 rounded-xl transition-all">
                <p className="text-primary-foreground font-medium mb-2">Conclusion:</p>
                <p className="text-primary-foreground/80 text-sm">
                  <strong>Delivery reliability</strong> is the strongest supported explanation (78% confidence), with SLA breaches increasing 27% and delivery-related complaints increasing 34%. 
                  <br/><br/>
                  <span className="opacity-70 italic">Note: Competitor delivery data is unavailable, so this should be treated as a supported hypothesis rather than confirmed causation.</span>
                </p>
              </div>
            ) : (
              <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl transition-all">
                <p className="text-destructive font-medium mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Conclusion Challenged & Revised:
                </p>
                <p className="text-destructive/80 text-sm">
                  After evaluating alternative hypotheses, we found that <strong>competitor prices decreased 12%</strong> in the same period. 
                  <br/><br/>
                  <strong>Conclusion is now ambiguous.</strong> Delivery reliability confidence dropped to 68%, while Competitor Pricing is at 67%. No single cause has sufficient evidence.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Driver Decomposition */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Driver Decomposition
          </h3>
          <p className="text-sm text-muted-foreground mb-4">Breakdown of the -8.2% revenue change</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={decompositionData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}M`} />
                <Tooltip 
                  cursor={{ fill: 'var(--muted)' }}
                  contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                  formatter={(value: number) => [`₹${value}M`, 'Contribution']}
                />
                <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                  {decompositionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Evidence Graph */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Evidence Reasoning Graph
        </h3>
        <p className="text-sm text-muted-foreground mb-4">Visual representation of hypothesis support and contradictions.</p>
        <EvidenceGraph />
      </div>

      {/* Recommendation Engine */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" />
          Recommended Actions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-t-lg">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Action</th>
                <th className="px-4 py-3">Impact</th>
                <th className="px-4 py-3">Urgency</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3 rounded-tr-lg"></th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border hover:bg-muted/20 transition-colors">
                <td className="px-4 py-4 font-medium text-foreground">Investigate premium SLA breaches in North India</td>
                <td className="px-4 py-4"><span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-semibold">High</span></td>
                <td className="px-4 py-4"><span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-semibold">High</span></td>
                <td className="px-4 py-4">81%</td>
                <td className="px-4 py-4 text-right">
                  <button className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded font-medium text-xs transition-colors">Take Action</button>
                </td>
              </tr>
              <tr className="border-b border-border hover:bg-muted/20 transition-colors">
                <td className="px-4 py-4 font-medium text-foreground">Contact affected premium customers</td>
                <td className="px-4 py-4"><span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-semibold">Medium</span></td>
                <td className="px-4 py-4"><span className="px-2 py-1 bg-destructive/10 text-destructive rounded text-xs font-semibold">High</span></td>
                <td className="px-4 py-4">74%</td>
                <td className="px-4 py-4 text-right">
                  <button className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded font-medium text-xs transition-colors">Take Action</button>
                </td>
              </tr>
              <tr className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-4 font-medium text-foreground">Collect missing competitor pricing data</td>
                <td className="px-4 py-4"><span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-semibold">Medium</span></td>
                <td className="px-4 py-4"><span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-semibold">Medium</span></td>
                <td className="px-4 py-4">67%</td>
                <td className="px-4 py-4 text-right">
                  <button className="px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded font-medium text-xs transition-colors">Take Action</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
