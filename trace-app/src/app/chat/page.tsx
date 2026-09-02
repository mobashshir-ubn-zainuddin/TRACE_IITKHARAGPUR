"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Send, Loader2, Sparkles, MessageSquare, X, Copy, Check, AlertCircle } from "lucide-react";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: Array<{ id: string; label: string; text: string }>;
}

interface ChatResponse {
  response: string;
  sources?: Array<{ id: string; label: string; text: string }>;
  error?: string;
}

const CONTEXT_QUESTIONS = [
  "Explain the current business performance",
  "What are the biggest drivers?",
  "What evidence supports the main finding?",
  "How should I interpret the dashboard?",
  "What should I investigate next?",
];

const GENERAL_QUESTIONS = ["How do I use TRACE?"];

const UPLOAD_FIRST_MESSAGE =
  "Upload and analyze a dataset from the Data page first. Once the analysis completes, I can explain the results and answer questions about the data.";

export default function ChatPage() {
  // useSearchParams() requires a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground text-sm">Loading chat...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const analysisId = searchParams.get("analysisId");
  const datasetId = searchParams.get("datasetId");
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisContext, setAnalysisContext] = useState<any>(null);
  const [resolvedAnalysisId, setResolvedAnalysisId] = useState<string | null>(analysisId);
  const [contextLoading, setContextLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // If the page wasn't given an explicit ?analysisId, fall back to the most
  // recent completed analysis (same behavior /api/analyze GET already uses
  // for other entry points) so the user never has to paste an id manually.
  const fetchAnalysisContext = useCallback(async () => {
    setContextLoading(true);
    try {
      const url = analysisId ? `/api/analyze?analysisId=${analysisId}` : "/api/analyze";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAnalysisContext(data);
        setResolvedAnalysisId(data?.id != null ? String(data.id) : null);
      } else {
        setAnalysisContext(null);
        setResolvedAnalysisId(null);
      }
    } catch (err) {
      console.warn("Failed to load analysis context for chat:", err);
      setAnalysisContext(null);
      setResolvedAnalysisId(null);
    } finally {
      setContextLoading(false);
    }
  }, [analysisId]);

  useEffect(() => {
    fetchAnalysisContext();
  }, [fetchAnalysisContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async (messageOverride?: string) => {
    const message = messageOverride ?? input;
    if (!message.trim() || loading) return;
    
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    if (!messageOverride) setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send the resolved id (falls back to the latest completed
          // analysis when the URL didn't carry one) - the API looks it up
          // fresh from analysis_runs so it's always correctly normalized.
          analysisId: resolvedAnalysisId,
          datasetId,
          message,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `API error: ${res.status}`);
      }

      const data: ChatResponse = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
        sources: data.sources,
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get response";
      setError(errorMessage);
      
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: `I apologize, but I encountered an error: ${errorMessage}. Please try again or rephrase your question.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, resolvedAnalysisId, datasetId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedClick = (question: string) => {
    handleSend(question);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] min-h-[28rem] rounded-2xl overflow-hidden border border-border bg-zinc-100 dark:bg-zinc-900">
      {/* Header - not sticky: the global nav header above is already sticky,
          so stacking a second sticky bar here would overlap it. */}
      <header className="glass w-full px-6 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-4">
          <Link href={datasetId ? "/data" : "/investigate"} className="p-2 rounded-full hover:bg-muted transition-colors border border-transparent hover:border-border">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <span>TRACE Chat</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {contextLoading
                ? "Loading analysis..."
                : resolvedAnalysisId
                ? `Analysis: ${resolvedAnalysisId}`
                : "No analysis context"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {analysisContext?.kpi_result && (
            <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full font-medium">
              {analysisContext.kpi_result.label} {analysisContext.kpi_result.changePct >= 0 ? "↑" : "↓"} {Math.abs(analysisContext.kpi_result.changePct || 0).toFixed(1)}%
            </span>
          )}
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
          <span className="text-sm text-destructive flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Ask TRACE about this investigation</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              {contextLoading
                ? "Loading analysis context..."
                : resolvedAnalysisId
                ? "I have access to the full analysis including KPI signals, driver hypotheses, evidence, and recommendations. Ask me anything about the findings."
                : UPLOAD_FIRST_MESSAGE}
            </p>
            {!contextLoading && (
              <>
                <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
                  {(resolvedAnalysisId ? CONTEXT_QUESTIONS : []).map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSuggestedClick(q)}
                      className="px-4 py-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-2xl">
                  {GENERAL_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSuggestedClick(q)}
                      className="px-4 py-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex-1 max-w-[80%] ${message.role === "user" ? "text-right" : ""}`}>
              <div className={`inline-block px-4 py-2 rounded-2xl ${message.role === "user" 
                ? "bg-primary text-primary-foreground rounded-tr-sm" 
                : "bg-white dark:bg-zinc-800 text-foreground rounded-tl-sm border border-border"
              }`}>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                  <span>{message.timestamp.toLocaleTimeString()}</span>
                  {message.sources && message.sources.length > 0 && (
                    <>
                      <span className="text-primary">•</span>
                      <span>{message.sources.length} source{message.sources.length > 1 ? "s" : ""}</span>
                    </>
                  )}
                </div>
                {message.sources && message.sources.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-primary cursor-pointer hover:underline">View sources</summary>
                    <div className="mt-2 space-y-1">
                      {message.sources.map((src, i) => (
                        <div key={i} className="text-xs text-muted-foreground bg-muted/50 p-2 rounded text-left">
                          <strong>{src.label}</strong>: {src.text.substring(0, 200)}{src.text.length > 200 ? "..." : ""}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {message.role === "assistant" && (
                  <div className="flex items-center gap-1 mt-1">
                    <button 
                      onClick={() => copyToClipboard(message.content)}
                      className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      title="Copy"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <div className="border-t border-border bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm p-4">
        <div className="max-w-4xl mx-auto flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={resolvedAnalysisId ? "Ask about this investigation..." : "Ask how to use TRACE, or upload data to ask about your results..."}
            disabled={loading}
            className="flex-1 min-h-[44px] max-h-48 px-4 py-3 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            rows={1}
          />
          <button
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            aria-label="Send message"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Press Enter to send, Shift+Enter for new line. {resolvedAnalysisId ? "Analysis context loaded." : "No analysis context - I can still answer general/website questions."}
        </p>
      </div>
    </div>
  );
}