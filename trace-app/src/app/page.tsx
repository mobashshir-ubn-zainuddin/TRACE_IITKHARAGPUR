"use client";

import { Activity, ArrowDownRight, ArrowUpRight, AlertTriangle, ArrowRight } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Mock Data
const revenueData = [
  { val: 10 }, { val: 10.1 }, { val: 9.9 }, { val: 10.2 }, { val: 10 }, { val: 9.18 }
];
const ordersData = [
  { val: 50 }, { val: 52 }, { val: 51 }, { val: 49 }, { val: 50 }, { val: 49 }
];
const aovData = [
  { val: 200 }, { val: 198 }, { val: 202 }, { val: 205 }, { val: 200 }, { val: 187 }
];

function KpiCard({ 
  title, 
  value, 
  change, 
  trend, 
  data, 
  isAnomaly = false 
}: { 
  title: string, 
  value: string, 
  change: string, 
  trend: 'up' | 'down' | 'neutral', 
  data: { val: number }[],
  isAnomaly?: boolean 
}) {
  const isDown = trend === 'down';
  const color = isAnomaly ? 'var(--destructive)' : (isDown ? 'var(--destructive)' : 'var(--success)');
  
  return (
    <div className={cn("glass-panel p-6 rounded-2xl flex flex-col gap-4 relative overflow-hidden transition-all duration-300 hover:border-primary/50 group", isAnomaly && "border-destructive/50")}>
      {isAnomaly && (
        <div className="absolute top-0 right-0 bg-destructive/20 text-destructive text-xs px-3 py-1 font-semibold rounded-bl-xl flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> HIGH IMPACT
        </div>
      )}
      
      <div className="flex justify-between items-start z-10">
        <div>
          <p className="text-muted-foreground font-medium text-sm mb-1">{title}</p>
          <h3 className="text-3xl font-bold tracking-tight text-foreground">{value}</h3>
          <div className="flex items-center gap-1 mt-2">
            {isDown ? <ArrowDownRight className="w-4 h-4 text-destructive" /> : <ArrowUpRight className="w-4 h-4 text-success" />}
            <span className={cn("text-sm font-semibold", isDown ? "text-destructive" : "text-success")}>
              {change}
            </span>
            <span className="text-muted-foreground text-xs ml-1">vs last month</span>
          </div>
        </div>
      </div>

      <div className="h-16 w-full -mx-2 z-0 opacity-50 group-hover:opacity-100 transition-opacity">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`color-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="val" stroke={color} strokeWidth={2} fillOpacity={1} fill={`url(#color-${title})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      {isAnomaly && (
        <div className="mt-2 z-10">
          <Link href="/investigate" className="inline-flex items-center justify-center w-full bg-destructive/10 hover:bg-destructive/20 text-destructive font-medium py-2 rounded-lg transition-colors gap-2 text-sm">
            Investigate Anomaly <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Business Overview</h1>
        <p className="text-muted-foreground">Monitor your key performance indicators and AI-detected anomalies.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard 
          title="Total Revenue" 
          value="₹9.18M" 
          change="-8.2%" 
          trend="down" 
          data={revenueData} 
          isAnomaly={true}
        />
        <KpiCard 
          title="Average Order Value" 
          value="₹187" 
          change="-6.1%" 
          trend="down" 
          data={aovData} 
        />
        <KpiCard 
          title="Total Orders" 
          value="49.2K" 
          change="-2.0%" 
          trend="down" 
          data={ordersData} 
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        <div className="glass-panel p-6 rounded-2xl border border-border">
          <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" /> Active Investigations
          </h3>
          <div className="flex flex-col gap-3">
            <div className="p-4 rounded-xl bg-card/50 border border-border flex items-center justify-between hover:bg-card transition-colors cursor-pointer">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">Revenue Decline in North India</span>
                <span className="text-xs text-muted-foreground">Detected 2 hours ago • High Severity</span>
              </div>
              <Link href="/investigate" className="text-sm font-medium text-primary flex items-center gap-1 hover:underline">
                View <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
        
        <div className="glass-panel p-6 rounded-2xl border border-border">
          <h3 className="text-lg font-semibold mb-4 text-foreground">System Health</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Data Completeness</span>
              <span className="font-medium text-success">98%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div className="bg-success h-2 rounded-full" style={{width: '98%'}}></div>
            </div>
            
            <div className="flex justify-between items-center text-sm pt-2">
              <span className="text-muted-foreground">Signal Engine Status</span>
              <span className="font-medium text-success">Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}