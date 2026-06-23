import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Geist for UI, JetBrains Mono (tabular) for all numerics (locked design).
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Crowd · Hyperliquid perp positioning",
  description:
    "How crowded each Hyperliquid perp is, what the crowd pays to stay in, and how it compares across venues.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
