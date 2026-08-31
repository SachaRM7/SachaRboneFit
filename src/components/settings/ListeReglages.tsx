"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Les entrées de l'écran « Plus ».
 *
 * Chacune tenait dans une carte complète : un en-tête avec icône, un titre,
 * une phrase de description et un bouton pleine largeur. Six cartes de cent
 * dix pixels pour six liens de navigation — il fallait faire défiler trois
 * écrans pour atteindre la déconnexion.
 *
 * Une ligne suffit à un lien. La description reste, en second rang, pour les
 * entrées dont le nom ne suffit pas ; les autres n'en ont pas besoin.
 */

export interface Entree {
  href: string;
  libelle: string;
  /** Facultative : « Salles » n'a pas besoin qu'on explique ce que c'est. */
  description?: string;
  icone: LucideIcon;
}

export function GroupeReglages({ titre, entrees }: { titre: string; entrees: Entree[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">{titre}</h2>
      <ul className="rounded-xl border border-filet bg-carte divide-y divide-filet">
        {entrees.map(({ href, libelle, description, icone: Icone }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5">
              <Icone className="w-4 h-4 text-encre-2 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-encre text-sm font-medium">{libelle}</span>
                {description && (
                  <span className="block text-encre-3 text-xs mt-0.5">{description}</span>
                )}
              </span>
              <ChevronRight className="w-4 h-4 text-encre-3 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Une action, pas une navigation : même hauteur, pas de chevron. */
export function LigneAction({
  libelle,
  description,
  icone: Icone,
  onClick,
  disabled,
  danger,
}: {
  libelle: string;
  description?: string;
  icone: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
    >
      <Icone className={`w-4 h-4 shrink-0 ${danger ? "text-perte" : "text-encre-2"}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${danger ? "text-perte" : "text-encre"}`}>
          {libelle}
        </span>
        {description && <span className="block text-encre-3 text-xs mt-0.5">{description}</span>}
      </span>
    </button>
  );
}
