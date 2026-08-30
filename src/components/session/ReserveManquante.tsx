"use client";
import { CHOIX_RESERVE, LIBELLES_RESERVE, reserveVersRpe } from "@/lib/engine/reserve";
import type { ExerciceIncomplet } from "@/lib/engine/fin-de-seance";

/**
 * Rattraper les réserves oubliées, une question par exercice.
 *
 * Pendant la séance, la réserve se saisit série par série — et hors
 * calibration, dans un champ libre intitulé « effort perçu » qui suppose
 * connue une échelle de RPE. Beaucoup de séries repartent donc vides.
 *
 * Une série sans réserve n'est pas perdue, mais elle est muette : le maximum
 * estimé la sous-évalue, et la progression double n'a rien pour décider de la
 * charge suivante. On la redemande ici tant que la séance est fraîche, en une
 * question par exercice : six fois « et celle-là ? » ne serait pas un retour
 * de dix secondes.
 *
 * Rien n'est obligatoire. Ce qui reste sans réponse reste vide — c'est
 * exactement ce qu'on veut dire quand on ne sait pas.
 */

interface Props {
  aCompleter: ExerciceIncomplet[];
  nomDe: (exerciseInstanceId: string) => string;
  reponses: Record<string, number>;
  onRepondre: (exerciseInstanceId: string, reserve: number) => void;
}

export function ReserveManquante({ aCompleter, nomDe, reponses, onRepondre }: Props) {
  if (aCompleter.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-encre font-semibold text-sm">Il te restait combien de répétitions ?</h2>
        <p className="text-encre-3 text-xs mt-0.5">
          Sur les séries que tu n&apos;as pas notées. Facultatif — c&apos;est ce qui me permet de
          fixer ta charge la prochaine fois.
        </p>
      </div>

      {aCompleter.map((e) => {
        const choisi = reponses[e.exerciseInstanceId];
        return (
          <div key={e.exerciseInstanceId} className="rounded-xl border border-filet bg-carte p-3 space-y-2">
            <p className="text-encre text-sm font-medium truncate">{nomDe(e.exerciseInstanceId)}</p>
            <div
              className="flex gap-1"
              role="radiogroup"
              aria-label={`Répétitions encore possibles — ${nomDe(e.exerciseInstanceId)}`}
            >
              {CHOIX_RESERVE.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={choisi === r}
                  aria-label={LIBELLES_RESERVE[r]}
                  onClick={() => onRepondre(e.exerciseInstanceId, r)}
                  className={`chiffres flex-1 h-11 rounded-md border text-sm tabular-nums ${
                    choisi === r
                      ? "border-encre bg-encre text-papier"
                      : "border-filet bg-papier text-encre-2"
                  }`}
                >
                  {r === 5 ? "5+" : r}
                </button>
              ))}
            </div>
            <p className="text-encre-3 text-xs">
              {choisi !== undefined
                ? LIBELLES_RESERVE[choisi]
                : `S'applique à ${e.series.length > 1 ? `tes ${e.series.length} séries` : "ta série"} sans réserve.`}
            </p>
          </div>
        );
      })}
    </section>
  );
}

/** Traduit les réponses en RPE, prêtes à être appliquées aux séries muettes. */
export function rpeParExercice(reponses: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(reponses).map(([id, reserve]) => [id, reserveVersRpe(reserve)]),
  );
}
