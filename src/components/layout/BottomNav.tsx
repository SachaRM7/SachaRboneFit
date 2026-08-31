"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Dumbbell, TrendingUp, Menu } from "lucide-react";

/**
 * Barre de navigation.
 *
 * Elle portait six onglets, dont deux se recouvraient — « Dashboard » et
 * « Séance » menaient au même geste — et deux menaient à des écrans de
 * configuration consultés une fois par mois. Les applications de référence en
 * tiennent trois ou quatre. La bibliothèque et les salles rejoignent « Plus »,
 * d'où elles sont atteignables en un geste supplémentaire.
 */
const ONGLETS = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/sessions/new", label: "Séance", icon: Dumbbell },
  { href: "/progression", label: "Progression", icon: TrendingUp },
  { href: "/settings", label: "Plus", icon: Menu },
];

/** Les écrans « Plus » regroupent ce qui ne se consulte pas à chaque séance. */
const RATTACHEMENTS: Record<string, string> = {
  "/exercises": "/settings",
  "/gyms": "/settings",
  "/profil": "/settings",
  "/historique": "/settings",
  "/programme": "/settings",
  "/bodyweight": "/settings",
};

export function BottomNav() {
  const chemin = usePathname();

  // L'onglet actif se déterminait par égalité stricte : ouvrir la fiche d'un
  // exercice n'allumait plus rien, et on ne savait plus où l'on était.
  const rattachement = Object.entries(RATTACHEMENTS).find(([prefixe]) =>
    chemin.startsWith(prefixe),
  )?.[1];

  const actif = (href: string) => {
    if (rattachement) return href === rattachement;
    if (href === "/dashboard") return chemin === "/dashboard" || chemin === "/";
    return chemin.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-papier border-t border-filet z-50">
      <div className="flex items-center justify-around h-full max-w-lg mx-auto px-2">
        {ONGLETS.map(({ href, label, icon: Icone }) => {
          const estActif = actif(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={estActif ? "page" : undefined}
              className={`flex flex-col items-center justify-center w-20 h-14 rounded-lg transition-colors ${
                estActif ? "text-encre" : "text-encre-3"
              }`}
            >
              <Icone className="w-6 h-6" strokeWidth={estActif ? 2.25 : 1.75} />
              <span className="text-[11px] mt-0.5 font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
