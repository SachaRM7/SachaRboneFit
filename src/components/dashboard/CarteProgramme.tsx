import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { complementTableauDeBord } from "@/services/tableau-de-bord";

/**
 * Le raccourci vers l'écran Programme, rendu à part.
 *
 * Il est alimenté par `vueDuProgramme` — huit requêtes, et la lecture la plus
 * chère de l'accueil. Elle retenait l'affichage du bonjour et de l'état du
 * jour pour annoncer une semaine de cycle que personne ne consulte en urgence.
 *
 * `complementTableauDeBord` est mémoïsée pour la durée du rendu : ce bloc et
 * le complément ci-dessous l'appellent tous les deux, la lecture se fait une
 * fois, et les deux limites de suspension s'ouvrent ensemble.
 */
export async function CarteProgramme({ userId }: { userId: string }) {
  const { blocActif } = await complementTableauDeBord(userId);
  if (!blocActif) return null;

  return (
    <div className="px-4 pb-2">
      {/* Le programme n'a pas d'onglet — c'est une décision assumée : ce n'est
          pas une destination quotidienne. Mais il ne doit pas être à deux
          gestes pour autant. Toute la carte est le lien : un second gros bouton
          entrerait en concurrence avec celui de la séance du jour. */}
      <Link
        href="/programme"
        className="flex items-center gap-3 rounded-xl border border-filet bg-carte px-4 py-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-encre text-sm font-medium truncate">
            {blocActif.libelleCycle}
          </span>
          <span className="block text-encre-3 text-xs mt-0.5">
            {blocActif.enCalibration ? (
              <>
                <span className="chiffres">{blocActif.seancesFaites}</span> séance
                {blocActif.seancesFaites > 1 ? "s" : ""} mesurée
                {blocActif.seancesFaites > 1 ? "s" : ""}
              </>
            ) : (
              <>
                Semaine <span className="chiffres">{blocActif.semaine}</span>
                {blocActif.semainesTotal !== null && (
                  <> sur <span className="chiffres">{blocActif.semainesTotal}</span></>
                )}
              </>
            )}
            {" · "}
            <span className="chiffres">{blocActif.seancesDeLaSemaine}</span> séance
            {blocActif.seancesDeLaSemaine > 1 ? "s" : ""} cette semaine
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-encre-3 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}
