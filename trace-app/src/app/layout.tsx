import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Activity } from "lucide-react";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <header className="glass sticky top-0 z-50 w-full px-6 py-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2 text-primary-foreground font-semibold text-lg">
            <Activity className="text-primary w-6 h-6" />
            <span>TRACE</span>
          </div>
          <nav className="flex gap-6 text-sm font-medium text-muted-foreground">
            <a href="/" className="hover:text-primary-foreground transition-colors">Dashboard</a>
            <a href="#" className="hover:text-primary-foreground transition-colors">Investigations</a>
            <a href="#" className="hover:text-primary-foreground transition-colors">Settings</a>
          </nav>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8">
          {children}
        </main>
      </body>
    </html>
  );
}