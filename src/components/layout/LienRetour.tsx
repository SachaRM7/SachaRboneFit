"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { cheminPrecedent } from "./SuiviNavigation";

/**
 * Une flèche « retour » qui revient vraiment en arrière.
 *
 * Si l'écran précédent est celui que vise `href`, on remonte l'historique :
 * position de défilement et filtres sont retrouvés tels qu'on les a laissés.
 * Sinon (arrivée directe par un lien, application rouverte), c'est un lien
 * ordinaire vers `href`.
 */
export function LienRetour({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (cheminPrecedent() === href.split("?")[0]) {
          e.preventDefault();
          router.back();
        }
      }}
    />
  );
}
