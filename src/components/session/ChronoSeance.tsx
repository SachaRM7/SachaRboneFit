"use client";
import { useEffect, useState } from "react";
import {
  dureeDeLaSeance,
  formaterEcoulee,
  messageDuree,
  tonDuree,
  type DureeDeLaSeance,
} from "@/lib/engine/duree-seance";

/**
 * Le temps écoulé depuis le début de la séance.
 *
 * Il n'existait pas. L'onboarding demandait une durée idéale et une durée
 * maximale, et personne ne les regardait ensuite — jusqu'à une modale de fin
 * qui annonçait « 105 min / cible 60 min » à quelqu'un qui n'avait jamais vu
 * le temps défiler.
 *
 * Il est discret par construction : une ligne, en haut, qui ne demande rien.
 * Elle informe quand la durée idéale approche, avertit quand le maximum
 * approche, et ne dit jamais d'arrêter — l'application ignore si cette séance
 * est celle qu'on attendait toute la semaine.
 */
const CLASSES = {
  neutre: "text-encre-3",
  note: "text-encre-2",
  avertissement: "text-perte font-medium",
} as const;

export function ChronoSeance({
  demarreeA,
  dureeCibleMinutes,
  dureeMaxMinutes,
}: {
  demarreeA: number;
  dureeCibleMinutes?: number | null;
  dureeMaxMinutes?: number | null;
}) {
  const [duree, setDuree] = useState<DureeDeLaSeance | null>(null);

  useEffect(() => {
    const relire = () =>
      setDuree(dureeDeLaSeance({
        demarreeA,
        maintenant: Date.now(),
        dureeCibleMinutes,
        dureeMaxMinutes,
      }));

    // La minute est la bonne granularité : personne ne regarde les secondes
    // d'une séance, et un rendu par seconde pour un texte qui change toutes
    // les soixante n'apporte rien.
    relire();
    const id = setInterval(relire, 10_000);
    const surRetour = () => document.visibilityState === "visible" && relire();
    document.addEventListener("visibilitychange", surRetour);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", surRetour);
    };
  }, [demarreeA, dureeCibleMinutes, dureeMaxMinutes]);

  if (!duree) return null;

  const message = messageDuree(duree);
  const ton = tonDuree(duree.etat);

  return (
    <div className="px-4 pt-2 flex items-baseline gap-2">
      <span className="chiffres text-xs tabular-nums text-encre-2">
        {formaterEcoulee(duree.ecouleeSecondes)}
      </span>
      {message && <span className={`text-xs ${CLASSES[ton]}`}>{message}</span>}
    </div>
  );
}
