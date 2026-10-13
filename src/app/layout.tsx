import type { Metadata, Viewport } from "next";
import { Outfit, Geist } from "next/font/google";
import "./globals.css";
import "./live-session.css";
import "./live-focus.css";
import "./overview.css";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { ConfirmationGlobale } from "@/components/ui/confirmation";
import { Toaster } from "@/components/ui/sonner";

// Polices variables auto-hébergées par Next pour toute l'interface.
const heading = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--police-titre",
});
const body = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--police-texte",
});

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
    { media: "(prefers-color-scheme: light)", color: "#F7F7F2" },
    { media: "(prefers-color-scheme: dark)", color: "#151C18" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${heading.variable} ${body.variable}`}
    >
      <body className="bg-papier text-encre min-h-screen antialiased">
        <ThemeProvider>
          {children}
          <ConfirmationGlobale />
          {/* Les `toast()` de l'app n'avaient nulle part où s'afficher : ce
              composant n'avait jamais été monté. En haut, pour ne masquer ni
              « Valider la série » ni la barre de navigation. */}
          <Toaster position="top-center" offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }} />
        </ThemeProvider>
      </body>
    </html>
  );
}
