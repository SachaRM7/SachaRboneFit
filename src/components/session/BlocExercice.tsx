"use client";
import { useEffect, useState } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { Check, Minus, Plus } from "lucide-react";

export interface ExercicePrescrit {
  id: string;
  planItemId?: string;
  nom: string;
  machineNom: string;
  slug?: string | null;
  seriesCibles: number;
  seriesPrevuesAvantAjustement?: number | null;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible?: number | null;
  tempo?: string | null;
  reposSecondes?: number | null;
  incrementsPossibles: number[];
  poidsNonCompte?: number | null;
  chargeSuggeree?: number | null;
  repsSuggerees?: number[] | null;
  messageProgression?: string | null;
  raisonSubstitution?: string | null;
  historique?: { charge: number; reps: number }[];
}

interface Props {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  /** Déclenché à chaque série validée, pour lancer le repos. */
  onSerieValidee: (reposSecondes: number | null) => void;
  onExerciceTermine: () => void;
}

/**
 * Saisie d'un exercice pendant la séance.
 *
 * Trois défauts corrigés par rapport à l'écran d'origine :
 * - la performance précédente s'affiche (elle recevait une liste toujours vide) ;
 * - la charge part de la suggestion, plus du plus petit incrément ;
 * - une série déjà validée peut être corrigée en la sélectionnant.
 */
export function BlocExercice({ exercice, rpeReduction, onSerieValidee, onExerciceTermine }: Props) {
  const { upsertSet, active } = useSessionStore();

  const seriesDejaSaisies = (active?.sets ?? []).filter((s) => s.exerciseInstanceId === exercice.id);
  const premiereNonSaisie =
    Array.from({ length: exercice.seriesCibles }, (_, i) => i + 1).find(
      (n) => !seriesDejaSaisies.some((s) => s.numeroSerie === n),
    ) ?? exercice.seriesCibles;

  const [serieCourante, setSerieCourante] = useState(premiereNonSaisie);
  const increment = exercice.incrementsPossibles[0] ?? 2.5;

  const valeursInitiales = () => {
    const dejaSaisie = seriesDejaSaisies.find((s) => s.numeroSerie === serieCourante);
    if (dejaSaisie) {
      return {
        charge: dejaSaisie.charge ?? 0,
        reps: dejaSaisie.repsEffectuees ?? exercice.fourchetteRepsMin,
        rpe: dejaSaisie.rpeEffectif ?? 8,
      };
    }
    return {
      charge: exercice.chargeSuggeree ?? exercice.historique?.[0]?.charge ?? 0,
      reps: exercice.repsSuggerees?.[serieCourante - 1] ?? exercice.fourchetteRepsMin,
      rpe: Math.max(6, (exercice.rpeCible ?? 8) - rpeReduction),
    };
  };

  const [valeurs, setValeurs] = useState(valeursInitiales);

  // Revenir sur une série déjà saisie doit recharger SES valeurs.
  useEffect(() => {
    setValeurs(valeursInitiales());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serieCourante, exercice.id]);

  const modifier = (champ: "charge" | "reps" | "rpe", delta: number, min = 0) =>
    setValeurs((v) => ({ ...v, [champ]: Math.max(min, Number((v[champ] + delta).toFixed(2))) }));

  const valider = () => {
    let reposReelSecondes: number | null = null;
    if (active?.restStartTimestamp) {
      reposReelSecondes = Math.floor((Date.now() - active.restStartTimestamp) / 1000);
    }

    upsertSet({
      exerciseInstanceId: exercice.id,
      numeroSerie: serieCourante,
      repsEffectuees: valeurs.reps,
      charge: valeurs.charge,
      rpeEffectif: valeurs.rpe,
      validatedAt: Date.now(),
      reposReelSecondes,
    });

    const restantes = Array.from({ length: exercice.seriesCibles }, (_, i) => i + 1).filter(
      (n) => n !== serieCourante && !seriesDejaSaisies.some((s) => s.numeroSerie === n),
    );

    if (restantes.length === 0) {
      onExerciceTermine();
      return;
    }

    setSerieCourante(restantes[0]!);
    onSerieValidee(exercice.reposSecondes ?? null);
  };

  const dejaValidee = seriesDejaSaisies.some((s) => s.numeroSerie === serieCourante);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        {exercice.slug && (
          <IllustrationExercice
            slug={exercice.slug}
            nom={exercice.nom}
            anime
            className="w-14 h-14 shrink-0 text-encre-3"
          />
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-encre leading-tight">{exercice.nom}</h2>
          <p className="text-encre-3 text-xs mt-1">
            {exercice.machineNom}
            {exercice.tempo ? ` · tempo ${exercice.tempo}` : ""}
            {exercice.incrementsPossibles.length > 0 ? ` · incréments ${exercice.incrementsPossibles.join(", ")} kg` : ""}
          </p>
        </div>
      </div>

      {exercice.raisonSubstitution && (
        <p className="text-sm text-encre-2 border-l-2 border-filet pl-3 py-0.5">
          {exercice.raisonSubstitution}
        </p>
      )}

      {exercice.historique && exercice.historique.length > 0 ? (
        <div className="border-l-2 border-filet pl-3 py-0.5 text-sm text-encre-2 leading-relaxed">
          <span className="text-encre-3 italic">La dernière fois</span>
          <br />
          {exercice.historique[0]!.charge} kg × {exercice.historique.map((h) => h.reps).join(" / ")}
          {exercice.messageProgression && (
            <span className="block text-gain font-semibold mt-0.5">{exercice.messageProgression}</span>
          )}
        </div>
      ) : (
        <p className="text-sm text-encre-3 border-l-2 border-filet pl-3 py-0.5">
          Première fois sur cette machine.
        </p>
      )}

      <div className="text-center pt-1">
        <p className="chiffres text-5xl font-semibold text-encre leading-none">
          {valeurs.charge}
          <span className="text-base font-medium text-encre-3 ml-1">kg</span>
        </p>
        {exercice.chargeSuggeree != null && valeurs.charge === exercice.chargeSuggeree && (
          <p className="text-xs text-gain font-semibold mt-1.5">Charge suggérée</p>
        )}
        {exercice.poidsNonCompte ? (
          <p className="text-xs text-encre-3 mt-1">Plateforme {exercice.poidsNonCompte} kg non comptée</p>
        ) : null}
        <div className="flex items-center justify-center gap-3 mt-3">
          <Button variant="outline" aria-label={`Retirer ${increment} kg`}
            className="w-14 h-12 rounded-full border-filet bg-carte text-encre-2"
            onClick={() => modifier("charge", -increment)}>
            <Minus className="w-5 h-5" />
          </Button>
          <span className="chiffres text-xs text-encre-3 w-10 text-center">{increment}</span>
          <Button variant="outline" aria-label={`Ajouter ${increment} kg`}
            className="w-14 h-12 rounded-full border-filet bg-carte text-encre-2"
            onClick={() => modifier("charge", increment)}>
            <Plus className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-filet pt-3">
        <span className="text-sm text-encre-2">Répétitions</span>
        <div className="flex items-center gap-3">
          <Button variant="outline" aria-label="Une répétition de moins"
            className="w-10 h-9 rounded-full border-filet bg-carte text-encre-2"
            onClick={() => modifier("reps", -1, 1)}>
            <Minus className="w-4 h-4" />
          </Button>
          <span className="chiffres text-2xl font-semibold text-encre w-8 text-center">{valeurs.reps}</span>
          <Button variant="outline" aria-label="Une répétition de plus"
            className="w-10 h-9 rounded-full border-filet bg-carte text-encre-2"
            onClick={() => modifier("reps", 1, 1)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-filet pt-3">
        <span className="text-sm text-encre-2">
          Effort perçu
          {rpeReduction > 0 && <span className="text-encre-3 text-xs ml-1">(allégé de {rpeReduction})</span>}
        </span>
        <div className="flex items-center gap-3">
          <Button variant="outline" aria-label="Effort perçu inférieur"
            className="w-10 h-9 rounded-full border-filet bg-carte text-encre-2"
            onClick={() => modifier("rpe", -0.5, 1)}>
            <Minus className="w-4 h-4" />
          </Button>
          <span className="chiffres text-2xl font-semibold text-encre w-8 text-center">{valeurs.rpe}</span>
          <Button variant="outline" aria-label="Effort perçu supérieur"
            className="w-10 h-9 rounded-full border-filet bg-carte text-encre-2"
            onClick={() => modifier("rpe", 0.5, 1)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div>
        <div className="flex gap-2">
          {Array.from({ length: exercice.seriesCibles }, (_, i) => i + 1).map((n) => {
            const saisie = seriesDejaSaisies.find((s) => s.numeroSerie === n);
            const courante = n === serieCourante;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setSerieCourante(n)}
                aria-label={saisie ? `Corriger la série ${n}` : `Aller à la série ${n}`}
                aria-current={courante}
                className={`flex-1 h-9 rounded-md text-sm font-medium flex items-center justify-center transition-colors ${
                  saisie
                    ? "bg-gain-fond text-gain"
                    : courante
                      ? "bg-encre text-papier"
                      : "bg-papier-2 text-encre-3"
                } ${courante ? "ring-2 ring-encre ring-offset-1 ring-offset-papier" : ""}`}
              >
                {saisie ? <Check className="w-4 h-4" /> : n}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-encre-3 text-center mt-2">
          Série {serieCourante} sur {exercice.seriesCibles}
          {exercice.seriesPrevuesAvantAjustement != null &&
            exercice.seriesPrevuesAvantAjustement !== exercice.seriesCibles && (
              <> — au lieu de {exercice.seriesPrevuesAvantAjustement}, volume réduit aujourd&apos;hui</>
            )}
          {seriesDejaSaisies.length > 0 && " · touche une série validée pour la corriger"}
        </p>
      </div>

      <Button className="w-full h-13 rounded-full bg-encre text-papier hover:bg-encre/90" onClick={valider}>
        {dejaValidee ? `Corriger la série ${serieCourante}` : `Valider la série ${serieCourante}`}
      </Button>
    </div>
  );
}
