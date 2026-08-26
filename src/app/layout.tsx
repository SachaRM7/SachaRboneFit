import type { Metadata, Viewport } from "next";
import { Fraunces, Karla } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/layout/ThemeProvider";

/**
 * Typographie de la direction Carnet.
 *
 * Elle n'avait jamais ete chargee : `globals.css` declarait
 * `--font-sans: var(--font-sans)`, une reference circulaire donc invalide, et
 * aucune police n'etait importee. L'application tombait sur les polices par
 * defaut du navigateur — ce qui n'avait aucun rapport avec la maquette.
 *
 * Fraunces porte les titres et les chiffres, Karla le reste.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--police-titre",
  axes: ["SOFT", "WONK", "opsz"],
});

const karla = Karla({
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
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#16181C" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${fraunces.variable} ${karla.variable}`}>
      <body className="bg-papier text-encre min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
