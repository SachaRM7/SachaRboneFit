import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * L'en-tête de toute page qui n'est pas une racine de la navigation basse.
 *
 * Le retour existait sur deux ou trois écrans, chacun avec sa propre mise en
 * page. Partout ailleurs, revenir supposait le geste Safari — invisible pour
 * qui ne le connaît pas, et impossible quand l'application est installée en
 * plein écran depuis l'écran d'accueil.
 *
 * La règle est simple : Accueil, Séance, Progression et Plus sont des racines
 * et n'ont pas de retour ; tout le reste en a un, au même endroit, avec la
 * même cible explicite. Une cible nommée plutôt qu'un `router.back()` : après
 * un rechargement ou une arrivée par lien, l'historique du navigateur ne dit
 * plus d'où l'on vient, et « retour » doit rester vrai.
 */
export function EnTeteSecondaire({
  titre,
  vers,
  libelleRetour = "Retour",
  action,
}: {
  titre: string;
  vers: string;
  libelleRetour?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-center gap-1 -ml-2">
      <Link
        href={vers}
        aria-label={libelleRetour}
        className="shrink-0 p-2 rounded-lg text-encre-2 hover:text-encre active:bg-papier-2"
      >
        <ArrowLeft className="w-5 h-5" aria-hidden />
      </Link>
      <h1 className="text-xl font-bold text-encre min-w-0 flex-1 truncate">{titre}</h1>
      {action}
    </header>
  );
}
