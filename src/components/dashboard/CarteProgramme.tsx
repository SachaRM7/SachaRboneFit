import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { complementTableauDeBordMemoise } from "@/services/tableau-de-bord";

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
  let blocActif;
  try {
    ({ blocActif } = await complementTableauDeBordMemoise(userId));
  } catch {
    return null;
  }
  if (!blocActif) return null;

  return (
    <Link href="/programme" className="programme-overview">
      <div className="section-heading">
        <span className="eyebrow">Phase actuelle</span>
        <ChevronRight size={17} aria-hidden />
      </div>
      <h2>{blocActif.libelleCycle}</h2>
      <div className="programme-position">
        <strong>
          {blocActif.enCalibration
            ? blocActif.seancesFaites
            : blocActif.semaine}
        </strong>
        <span>
          {blocActif.enCalibration
            ? "séances mesurées"
            : `semaine${blocActif.semainesTotal !== null ? ` sur ${blocActif.semainesTotal}` : " en cours"}`}
        </span>
      </div>
      {!blocActif.enCalibration && blocActif.semainesTotal !== null && (
        <progress
          className="cycle-progress"
          max={Math.max(1, blocActif.semainesTotal)}
          value={blocActif.semaine}
          aria-label="Semaine du cycle"
        />
      )}
      <p>
        {blocActif.seancesDeLaSemaine} séance
        {blocActif.seancesDeLaSemaine > 1 ? "s" : ""} dans ta semaine type{" "}
        <span>Voir le programme →</span>
      </p>
    </Link>
  );
}
