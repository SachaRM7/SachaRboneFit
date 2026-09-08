import type { Metadata, Viewport } from "next";
import { Outfit, Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/ThemeProvider";

// Polices variables auto-hébergées par Next pour toute l'interface.
const heading = Outfit({ subsets: ["latin"], display: "swap", variable: "--police-titre" });
const body = Geist({ subsets: ["latin"], display: "swap", variable: "--police-texte" });

export const metadata: Metadata = {
  title: "Sport Perso",
  description: "Suivi de musculation perso",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sport",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F6F6" },
    { media: "(prefers-color-scheme: dark)", color: "#111A1C" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${heading.variable} ${body.variable}`}>
      <body className="bg-papier text-encre min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
