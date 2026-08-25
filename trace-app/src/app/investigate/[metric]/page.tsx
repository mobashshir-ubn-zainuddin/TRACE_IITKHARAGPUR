'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

const metricLabels: Record<string, { name: string; icon: string }> = {
  revenue: { name: 'Revenue', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  orders: { name: 'Orders', icon: 'M16 11V7a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2zm0 0h-8M16 11l-5 5m0 0l-5-5m5 5v12' },
  'average-order-value': { name: 'Average Order Value', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  aov: { name: 'Average Order Value', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
};

export default function InvestigatePage() {
  const params = useParams();
  const metricId = params.metric as string;
  const metric = metricLabels[metricId] || { name: metricId, icon: '' };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </Link>
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
              Investigate: {metric.name}
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Root cause analysis and hypothesis generation for {metric.name.toLowerCase()} anomaly
            </p>
          </header>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-8">
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-6">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={metric.icon} />
              </svg>
            </div>
            <h2 className="text-xl font-medium text-slate-900 dark:text-slate-100 mb-3">
              Investigation Module
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
              This is a placeholder for the &quot;WHY&quot; investigation view. The RAG pipeline, hypothesis engine, evidence scoring, and recommendation engine will be implemented here.
            </p>
            <div className="space-y-3 text-left max-w-md mx-auto text-sm">
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-slate-600 dark:text-slate-300">Hypothesis generation from anomaly context</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-slate-600 dark:text-slate-300">Evidence retrieval & scoring</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-slate-600 dark:text-slate-300">Uncertainty quantification</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-slate-600 dark:text-slate-300">Actionable recommendations</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-6 lg:px-8">
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          TRACE Investigation — Prototype v0.1
        </p>
      </footer>
    </div>
  );
}