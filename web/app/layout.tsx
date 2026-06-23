import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media Discovery",
  description: "Semantic movie discovery - microservices demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-white/10 px-6 py-4">
          <a href="/" className="text-xl font-semibold tracking-tight">
            🎬 Media<span className="text-accent">Discovery</span>
          </a>
          <span className="ml-3 text-xs text-slate-400">
            semantic search · recommender · observable microservices
          </span>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
