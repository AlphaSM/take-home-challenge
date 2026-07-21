import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clever Dictate // Enterprise",
  description: "Context-aware, multi-user dictation for teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-base text-dominant antialiased">{children}</body>
    </html>
  );
}
