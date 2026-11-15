import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GFP — Mes dépenses",
  description: "Importe ton relevé, tes dépenses se trient toutes seules.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "GFP", statusBarStyle: "default" },
  icons: { icon: "/favicon.ico", apple: "/icon-apple-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#121316" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
