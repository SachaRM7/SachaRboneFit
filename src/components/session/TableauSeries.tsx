"use client";
import { useMemo, useState } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { Check, Plus } from "lucide-react";
import type { ExercicePrescrit } from "./types";
import { CHOIX_RESERVE, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";
import { chargeAEnregistrer, consigneDeSaisie } from "@/lib/validators/exercise-instance";

interface Props {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  /** Déclenché à chaque série validée, pour lancer le repos. */
  onSerieValidee: (reposSecondes: number | null) => void;
  /**
   * En calibration, on demande la réserve de répétitions plutôt qu'un RPE.
   * « Combien aurais-tu pu en faire de plus ? » se répond sans avoir appris
   * d'échelle — et c'est cette réponse qui fixera les charges.
   */
  modeReserve?: boolean;
}

type Brouillon = { charge: string; reps: string; rpe: string };

/**
 * Saisie d'un exercice sous forme de tableau de séries.
 *
 * L'écran précédent affichait une série à la fois, pilotée par des
 * incrémenteurs : atteindre 60 kg depuis 0 demandait douze appuis, et on ne
 * voyait jamais où on en était sans compter. Les applications de référence ont
 * toutes convergé vers la même grammaire — une ligne par série, la valeur
 * pré-remplie, une saisie clavier directe, une coche qui valide et lance le
 * repos. C'est ce que fait ce composant.
 *
 * La colonne « Dernière » met l'historique en face de la décision, au lieu de
 * le reléguer dans un encadré séparé au-dessus.
 */
export function TableauSeries({ exercice, rpeReduction, onSerieValidee, modeReserve = false }: Props) {
  const { upsertSet, removeSet, active } = useSessionStore();

  const seriesSaisies = useMemo(
    () => (active?.sets ?? []).filter((s) => s.exerciseInstanceId === exercice.id),
    [active?.sets, exercice.id],
  );

  // Des séries peuvent avoir été ajoutées au-delà de la prescription.
  const [seriesEnPlus, setSeriesEnPlus] = useState(0);
  const consigne = consigneDeSaisie(exercice.conventionCharge, exercice.natureCharge);
  const nbLignes = Math.max(
    exercice.seriesCibles + seriesEnPlus,
    ...seriesSaisies.map((s) => s.numeroSerie),
    1,
  );

  const rpeParDefaut = Math.max(6, (exercice.rpeCible ?? 8) - rpeReduction);
  const chargeParDefaut = exercice.chargeSuggeree ?? exercice.historique?.[0]?.charge ?? null;

  /** Valeurs proposées pour une ligne, avant toute saisie de l'utilisateur. */
  const proposition = (numero: number): Brouillon => ({
    charge: chargeParDefaut != null ? String(chargeParDefaut) : "",
    reps: String(exercice.repsSuggerees?.[numero - 1] ?? exercice.fourchetteRepsMin),
    rpe: String(rpeParDefaut),
  });

  const [brouillons, setBrouillons] = useState<Record<number, Brouillon>>({});

  const valeurs = (numero: number): Brouillon => {
    if (brouillons[numero]) return brouillons[numero]!;
    const saisie = seriesSaisies.find((s) => s.numeroSerie === numero);
    if (saisie) {
      return {
        charge: saisie.charge != null ? String(saisie.charge) : "",
        reps: saisie.repsEffectuees != null ? String(saisie.repsEffectuees) : "",
        rpe: saisie.rpeEffectif != null ? String(saisie.rpeEffectif) : "",
      };
    }
    return proposition(numero);
  };

  const ecrire = (numero: number, champ: keyof Brouillon, valeur: string) =>
    setBrouillons((b) => ({ ...b, [numero]: { ...valeurs(numero), [champ]: valeur } }));

  const basculer = (numero: number) => {
    const dejaValidee = seriesSaisies.some((s) => s.numeroSerie === numero);
    if (dejaValidee) {
      removeSet(exercice.id, numero);
      return;
    }

    const v = valeurs(numero);
    const charge = chargeAEnregistrer(v.charge, exercice.conventionCharge);
    const reps = Number.parseInt(v.reps, 10);

    upsertSet({
      exerciseInstanceId: exercice.id,
      numeroSerie: numero,
      charge,
      repsEffectuees: Number.isFinite(reps) ? reps : null,
      rpeEffectif: Number.parseFloat(v.rpe.replace(",", ".")) || null,
      validatedAt: Date.now(),
      reposReelSecondes: active?.restStartTimestamp
        ? Math.floor((Date.now() - active.restStartTimestamp) / 1000)
        : null,
    });

    onSerieValidee(exercice.reposSecondes ?? null);
  };

  const lignes = Array.from({ length: nbLignes }, (_, i) => i + 1);
  const validees = seriesSaisies.length;

  const champ =
    "w-full min-w-0 rounded-md border border-filet bg-papier-2 px-1.5 py-2 text-center " +
    "chiffres text-base font-semibold text-encre focus:border-encre focus:outline-none " +
    "focus:ring-2 focus:ring-encre/20";

  return (
    <section className="border border-filet rounded-xl bg-carte overflow-hidden">
      <header className="flex items-start gap-3 p-3.5 border-b border-filet-doux">
        {exercice.slug && (
          <IllustrationExercice
            slug={exercice.slug}
            nom={exercice.nom}
            anime
            className="w-12 h-12 shrink-0 text-encre-3"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-encre leading-tight">{exercice.nom}</h2>
          {/* La machine porte souvent le nom de l'exercice : le répéter sous le
              titre n'apprend rien et allonge la ligne pour rien. */}
          <p className="text-encre-3 text-xs mt-0.5">
            {exercice.machineNom && exercice.machineNom !== exercice.nom
              ? `${exercice.machineNom} · `
              : ""}
            {exercice.seriesCibles} × {exercice.fourchetteRepsMin}-{exercice.fourchetteRepsMax}
            {exercice.reposSecondes ? ` · repos ${exercice.reposSecondes} s` : ""}
          </p>
        </div>
        <span className="chiffres text-xs text-encre-3 shrink-0 tabular-nums">
          {validees}/{exercice.seriesCibles}
        </span>
      </header>

      {modeReserve && (
        <p className="px-3.5 py-2 text-xs text-encre-2 border-b border-filet-doux">
          Après chaque série : combien de répétitions aurais-tu encore pu faire ?
          C&apos;est cette réponse qui fixera tes charges.
        </p>
      )}

      {(exercice.raisonSubstitution || exercice.messageProgression) && (
        <p className="px-3.5 py-2 text-xs border-b border-filet-doux">
          {exercice.raisonSubstitution && (
            <span className="text-encre-2">{exercice.raisonSubstitution}</span>
          )}
          {exercice.messageProgression && (
            <span className="text-gain font-semibold">{exercice.messageProgression}</span>
          )}
        </p>
      )}

      <div className="p-3.5">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-encre-3">
              <th scope="col" className="w-6 pb-1.5 text-left font-medium">#</th>
              <th scope="col" className="pb-1.5 text-left font-medium">Dernière</th>
              <th scope="col" className="w-[4.5rem] pb-1.5 font-medium">kg</th>
              <th scope="col" className="w-[3.5rem] pb-1.5 font-medium">Reps</th>
              <th scope="col" className={`pb-1.5 font-medium ${modeReserve ? "w-[7.5rem]" : "w-[3.5rem]"}`}>
                {modeReserve ? "Encore ?" : "RPE"}
              </th>
              <th scope="col" className="w-10 pb-1.5">
                <span className="sr-only">Valider</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((numero) => {
              const v = valeurs(numero);
              const validee = seriesSaisies.some((s) => s.numeroSerie === numero);
              const passe = exercice.historique?.[numero - 1];

              return (
                <tr key={numero} className="border-t border-filet-doux">
                  <td className="chiffres text-xs text-encre-3 py-1.5">{numero}</td>
                  <td className="chiffres text-xs text-encre-3 py-1.5 whitespace-nowrap">
                    {passe ? `${passe.charge}×${passe.reps}` : "—"}
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="text" inputMode="decimal" value={v.charge}
                      onChange={(e) => ecrire(numero, "charge", e.target.value)}
                      aria-label={`Charge série ${numero}`}
                      className={champ}
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="text" inputMode="numeric" value={v.reps}
                      onChange={(e) => ecrire(numero, "reps", e.target.value)}
                      aria-label={`Répétitions série ${numero}`}
                      className={champ}
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    {modeReserve ? (
                      <select
                        value={String(rpeVersReserve(Number.parseFloat(v.rpe.replace(",", "."))) ?? 2)}
                        onChange={(e) =>
                          ecrire(numero, "rpe", String(reserveVersRpe(Number(e.target.value))))
                        }
                        aria-label={`Répétitions encore possibles, série ${numero}`}
                        className={champ}
                      >
                        {CHOIX_RESERVE.map((r) => (
                          <option key={r} value={r}>
                            {r === 5 ? "5+" : r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text" inputMode="decimal" value={v.rpe}
                        onChange={(e) => ecrire(numero, "rpe", e.target.value)}
                        aria-label={`Effort perçu série ${numero}`}
                        className={champ}
                      />
                    )}
                  </td>
                  <td className="py-1.5 pl-1">
                    <button
                      type="button"
                      onClick={() => basculer(numero)}
                      aria-pressed={validee}
                      aria-label={validee ? `Annuler la série ${numero}` : `Valider la série ${numero}`}
                      className={`w-9 h-9 rounded-md border grid place-items-center transition-colors ${
                        validee
                          ? "bg-gain border-gain text-papier"
                          : "border-filet bg-papier-2 text-encre-3 hover:text-encre"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() => setSeriesEnPlus((n) => n + 1)}
          className="mt-2.5 flex items-center gap-1.5 text-xs text-encre-2 hover:text-encre"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter une série
        </button>

        {/*
          Ce qu'il faut saisir, là où on le saisit.
          La convention vivait en base sans jamais atteindre la séance : devant
          un hack squat, rien ne disait s'il fallait noter les disques ou le
          total, et deux séances saisies autrement font une courbe qui bouge
          sans effort supplémentaire.
        */}
        {consigne ? <p className="text-xs text-encre-3 mt-2">{consigne}</p> : null}

        {exercice.poidsNonCompte ? (
          <p className="text-xs text-encre-3 mt-1">
            {/*
              La résistance annoncée par le constructeur se lit, elle ne
              s'ajoute pas : inclinaison, bras de levier et cames font qu'elle
              n'est pas une masse qu'on additionne à la charge saisie.
            */}
            Résistance de l&apos;appareil à vide : {exercice.poidsNonCompte} kg, non comptée dans la saisie
          </p>
        ) : null}

        {exercice.seriesPrevuesAvantAjustement != null &&
          exercice.seriesPrevuesAvantAjustement !== exercice.seriesCibles && (
            <p className="text-xs text-encre-3 mt-2">
              {exercice.seriesCibles} séries au lieu de {exercice.seriesPrevuesAvantAjustement} — volume réduit aujourd&apos;hui
            </p>
          )}
      </div>
    </section>
  );
}
