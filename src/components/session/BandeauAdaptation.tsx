"use client";
import { Feu } from "@/components/carnet/Feu";
import type { ExercicePrescrit } from "./types";
import { classeDuMotif, estUneMontee } from "./motif-progression";

interface Props {
  feuJour?: string | null;
  volumeAjustePct?: number | null;
  volumeAjusteRaison?: string | null;
  exercices: ExercicePrescrit[];
}

/**
 * Ce que l'application a décidé pour cette séance, et pourquoi.
 *
 * Le moteur adapte le volume au feu biologique, substitue les machines
 * indisponibles et recalcule les charges par double progression — mais rien de
 * tout cela n'apparaissait, sauf une ligne quand le volume avait baissé. Cette
 * intelligence est pourtant le seul argument face aux carnets de suivi
 * classiques : si elle reste invisible, l'utilisateur subit une saisie sans en
 * voir la contrepartie.
 *
 * Le bandeau ne s'affiche que s'il a quelque chose à dire.
 */
export function BandeauAdaptation({ feuJour, volumeAjustePct, volumeAjusteRaison, exercices }: Props) {
  const substitutions = exercices.filter((e) => e.raisonSubstitution);
  // « N charges en hausse » comptait TOUT message de progression : une
  // référence tronquée et une butée d'appareil y étaient donc annoncées comme
  // des hausses. Ce n'était pas qu'une couleur trompeuse, c'était une phrase
  // fausse.
  const hausses = exercices.filter((e) => estUneMontee(e.motifProgression));
  const autresDecisions = exercices.filter(
    (e) => e.messageProgression && !estUneMontee(e.motifProgression),
  );
  const volumeReduit = Boolean(volumeAjustePct);

  if (!volumeReduit && substitutions.length === 0
      && hausses.length === 0 && autresDecisions.length === 0 && !feuJour) {
    return null;
  }

  return (
    <section
      aria-label="Adaptations de la séance"
      className="border-b border-filet bg-papier-2 px-4 py-3 space-y-2"
    >
      {feuJour && (
        <p className="flex items-center gap-2 text-sm text-encre-2">
          <Feu niveau={feuJour} />
          <span>
            Feu <strong className="text-encre font-semibold">{feuJour}</strong> aujourd&apos;hui
          </span>
        </p>
      )}

      {volumeReduit && (
        <p className="text-sm text-encre-2">
          <strong className="text-encre font-semibold">
            Volume réduit de {Math.abs(volumeAjustePct!)} %.
          </strong>{" "}
          {volumeAjusteRaison}
        </p>
      )}

      {substitutions.length > 0 && (
        <ul className="text-sm text-encre-2 space-y-1">
          {substitutions.map((e) => (
            <li key={e.id}>
              <strong className="text-encre font-semibold">{e.nom}</strong> — {e.raisonSubstitution}
            </li>
          ))}
        </ul>
      )}

      {hausses.length > 0 && (
        <p className="text-sm text-gain">
          <strong className="font-semibold">
            {hausses.length} charge{hausses.length > 1 ? "s" : ""} en hausse
          </strong>{" "}
          <span className="text-encre-2">— {hausses.map((e) => e.nom).join(", ")}</span>
        </p>
      )}

      {/* Les décisions qui ne sont pas des hausses ont leur propre ligne, et
          chacune sa couleur : une référence tronquée appelle une action, une
          butée d'appareil ne fait qu'informer. */}
      {autresDecisions.map((e) => (
        <p key={e.id} className="text-sm">
          <span className={classeDuMotif(e.motifProgression)}>{e.nom}</span>
          <span className="text-encre-2"> — {e.messageProgression}</span>
        </p>
      ))}
    </section>
  );
}
