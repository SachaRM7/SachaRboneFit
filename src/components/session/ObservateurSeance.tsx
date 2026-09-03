"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import {
  evenementsDeLaSeance,
  interventionsUtiles,
  libelleFactuel,
  type EvenementSeance,
  type PrescriptionObservee,
} from "@/lib/engine/evenements-seance";

/**
 * Le Coach regarde la séance pendant qu'elle a lieu.
 *
 * Il n'intervenait qu'à deux moments : quand on lui écrivait, et au débrief.
 * Entre les deux, l'application mesurait des faits — repos écourtés, effort
 * bien au-delà de la cible, séries ajoutées — que personne ne lisait avant le
 * lendemain.
 *
 * Ce composant ne décide de rien : il rend visible ce que le moteur a retenu.
 * Toute la politique — quels faits, combien de fois, et s'il reste de la séance
 * pour en faire quelque chose — vit dans `engine/evenements-seance`, testable
 * sans rendre de React. Aucun appel au modèle n'a lieu ici : le Coach ne
 * s'ouvre que si la personne le demande, avec le fait déjà en main.
 */
export function ObservateurSeance({
  prescriptions,
  ordreDesExercices,
  onDemanderCoach,
}: {
  prescriptions: PrescriptionObservee[];
  /** Les instances dans l'ordre de la séance, pour savoir ce qu'il reste. */
  ordreDesExercices: string[];
  onDemanderCoach?: (evenement: EvenementSeance, fait: string) => void;
}) {
  const { active } = useSessionStore();
  const [ecartes, setEcartes] = useState<string[]>([]);

  const series = active?.sets ?? [];

  const aSignaler = useMemo(() => {
    if (series.length === 0 || prescriptions.length === 0) return [];

    const evenements = evenementsDeLaSeance(
      series.map((s) => ({
        exerciseInstanceId: s.exerciseInstanceId,
        numeroSerie: s.numeroSerie,
        repsEffectuees: s.repsEffectuees,
        charge: s.charge,
        rpeEffectif: s.rpeEffectif,
        reposReelSecondes: s.reposReelSecondes,
        reposIgnore: s.reposIgnore,
      })),
      prescriptions,
    );

    return interventionsUtiles(evenements, (instanceId) => {
      const prescrite = prescriptions.find((p) => p.exerciseInstanceId === instanceId);
      const faites = series.filter((s) => s.exerciseInstanceId === instanceId).length;
      const rang = ordreDesExercices.indexOf(instanceId);
      return {
        seriesRestantesSurLExercice: Math.max(0, (prescrite?.seriesCibles ?? 0) - faites),
        exercicesRestants: rang < 0 ? 0 : Math.max(0, ordreDesExercices.length - rang - 1),
      };
    });
  }, [series, prescriptions, ordreDesExercices]);

  // Un fait écarté ne revient pas : le signaler deux fois pendant la même
  // séance, c'est exactement le harcèlement qu'on veut éviter.
  const aMontrer = aSignaler.filter((e) => !ecartes.includes(cle(e)));
  if (aMontrer.length === 0) return null;

  // Un seul à la fois, le plus récent : trois encarts empilés au milieu d'une
  // séance ne se lisent pas.
  const evenement = aMontrer[aMontrer.length - 1]!;
  const fait = libelleFactuel(evenement);

  return (
    <div className="px-4 pb-2">
      <div className="bg-carte border border-filet rounded-xl p-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-encre text-sm font-medium">{titre(evenement)}</p>
          <p className="text-encre-2 text-xs mt-0.5">{fait}</p>
          {onDemanderCoach && (
            <button
              type="button"
              onClick={() => onDemanderCoach(evenement, fait)}
              className="mt-2 text-xs text-encre underline underline-offset-4"
            >
              En parler au coach
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEcartes((l) => [...l, cle(evenement)])}
          aria-label="Masquer ce constat"
          className="shrink-0 p-1 text-encre-3 hover:text-encre"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function cle(e: EvenementSeance): string {
  return `${e.type}:${e.exerciseInstanceId}`;
}

/**
 * Le titre nomme le constat, jamais la conduite à tenir.
 *
 * Décider quoi faire d'un repos écourté demande de savoir pourquoi il l'a été
 * — le temps qui manque, l'impatience, une machine convoitée. C'est une
 * conversation, pas un encart ; l'encart se contente de rendre le fait visible.
 */
function titre(e: EvenementSeance): string {
  switch (e.type) {
    case "repos_ecourte":
      return "Tes repos sont plus courts que prévu";
    case "repos_rallonge":
      return "Tes repos s'allongent";
    case "effort_au_dela_de_la_cible":
      return "Cette série a été plus dure que visé";
    case "effort_en_deca_de_la_cible":
      return "Cette série a été plus facile que visé";
    case "reps_sous_la_fourchette":
      return "Tu es sous la fourchette prévue";
    case "series_hors_prescription":
      return "Tu as fait plus de séries que prévu";
  }
}
