import type { Metadata } from "next";

// Tailwind entry point. Without this import no admin styling is emitted at all.
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NextPress — Headless CMS",
    template: "%s | NextPress",
  },
  description: "A modern, extensible headless CMS built with Next.js.",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
