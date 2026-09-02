import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Activity } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

// Runs before hydration so the theme is correct on first paint - no flash,
// no client/server mismatch. Priority: stored choice > system preference >
// TRACE's dark default.
const THEME_BOOTSTRAP = `
(function () {
  try {
    var stored = localStorage.getItem("trace-theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TRACE | Business Intelligence",
  description: "AI-Powered Business Intelligence and Anomaly Investigation",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <header className="glass sticky top-0 z-50 w-full px-4 sm:px-6 py-4 flex items-center justify-between border-b border-border">
          <Link href="/" className="flex items-center gap-2 text-foreground font-semibold text-lg tracking-tight shrink-0">
            <Activity className="text-primary w-6 h-6" />
            <span>TRACE</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium text-muted-foreground overflow-x-auto">
            <Link href="/dashboard" className="px-3 py-2 rounded-lg hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 whitespace-nowrap">Dashboard</Link>
            <Link href="/data" className="px-3 py-2 rounded-lg hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 whitespace-nowrap">Data</Link>
            <Link href="/investigate" className="px-3 py-2 rounded-lg hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 whitespace-nowrap">Investigations</Link>
            <Link href="/chat" className="px-3 py-2 rounded-lg hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 whitespace-nowrap">Chat</Link>
            <span className="ml-1 sm:ml-2 pl-1 sm:pl-2 border-l border-border">
              <ThemeToggle />
            </span>
          </nav>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8">
          {children}
        </main>
      </body>
    </html>
  );
}