"use client";
import { useEffect, useState } from "react";
import { estimer1RMDepuisRpe } from "@/lib/engine/records";
import { rpeVersReserve } from "@/lib/engine/reserve";
import { Delta } from "@/components/carnet/Delta";

/**
 * Ce que la séance vient de produire, dit sans mentir.
 *
 * Trois défauts observés sur l'écran réel du 6 septembre, et ils tenaient tous
 * les trois à la même erreur de raisonnement — présenter une PREMIÈRE mesure
 * comme une comparaison.
 *
 *   1. Chaque ligne s'appelait « Exercice ». Le nom venait de la route « ma
 *      dernière séance sur cette machine », qui rend `null` quand il n'y en a
 *      pas eu. En calibration, il n'y en a jamais eu : toutes les lignes
 *      retombaient sur le littéral de repli. Le nom d'un appareil ne dépend
 *      pas de son historique — il se demande là où il vit.
 *
 *   2. « 1RM 26.666666666666664 kg ». Un flottant brut, affiché tel quel.
 *
 *   3. « 1RM » tout court. Une calibration ne teste pas un maximum : elle
 *      cherche des charges de travail, à trois répétitions de la réserve.
 *      Annoncer un 1RM à quelqu'un qui découvre la salle lui fait lire une
 *      performance qu'il n'a pas produite. La première fois est une BASELINE,
 *      et c'est ce qu'on affiche.
 *
 * Et un quatrième, qui n'avait pas encore été vu : sur une machine
 * d'assistance — Dip/Chin Assist —, un maximum estimé n'a aucun sens. La
 * charge y AIDE. 64 kg d'assistance est plus facile que 50, et la progression
 * consiste à en demander moins. Le calcul standard dirait l'inverse.
 */

const APERCU_EXERCICES = 2;

interface InstanceLue {
  id: string;
  nom: string;
  machineNom: string | null;
  natureCharge: string | null;
}

interface LigneRecap {
  exerciseInstanceId: string;
  nom: string;
  machineNom: string;
  assistance: boolean;
  /** La meilleure série du jour, celle qu'on montre. */
  meilleure: { charge: number; reps: number; reserve: number | null };
  e1rmCourant: number | null;
  e1rmPrecedent: number | null;
  /** Vrai quand cette machine n'avait aucune séance derrière elle. */
  premiereFois: boolean;
}

interface ProgressionSummaryProps {
  sets: Array<{
    exerciseInstanceId: string;
    repsEffectuees: number;
    charge: number;
    rpeEffectif?: number | null;
  }>;
  templateId: string;
  sessionLogId?: string;
}

/**
 * Un poids qui se lit d'un coup d'œil.
 *
 * Deux décimales n'apportent rien sur une charge — les paliers d'une salle se
 * comptent en kilogrammes ou en demi-kilogrammes. Le zéro inutile disparaît :
 * « 26,7 kg », pas « 26,70 kg », et « 71 kg » plutôt que « 71,0 kg ».
 */
export function formaterCharge(valeur: number): string {
  const arrondi = Math.round(valeur * 10) / 10;
  return Number.isInteger(arrondi)
    ? String(arrondi)
    : arrondi.toFixed(1).replace(".", ",");
}

export function ProgressionSummary({ sets, sessionLogId }: ProgressionSummaryProps) {
  const [chargement, setChargement] = useState(true);
  const [lignes, setLignes] = useState<LigneRecap[]>([]);

  useEffect(() => {
    const ids = [...new Set(sets.map((s) => s.exerciseInstanceId))];
    if (ids.length === 0) return;

    let annule = false;
    void (async () => {
      // Un seul appel pour tous les noms, et il n'a pas besoin d'historique
      // pour répondre : c'est ce qui corrige le « Exercice » de chaque ligne.
      const instances: InstanceLue[] = await fetch(`/api/exercise-instances?ids=${ids.join(",")}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
      const parId = new Map(instances.map((i) => [i.id, i]));

      const construites = await Promise.all(
        ids.map(async (id) => {
          const duJour = sets.filter((s) => s.exerciseInstanceId === id);
          const instance = parId.get(id);
          const assistance = instance?.natureCharge === "assistance";

          /*
           * La meilleure série du jour.
           *
           * Sur une résistance, c'est celle qui estime le plus haut maximum.
           * Sur une assistance, c'est celle qui a demandé le MOINS d'aide à
           * répétitions comparables — l'ordre est inversé, et un tri commun
           * aurait désigné la plus facile.
           */
          const meilleureSerie = assistance
            ? duJour.reduce((a, b) => (b.charge < a.charge ? b : a))
            : duJour.reduce((a, b) =>
                estimer1RMDepuisRpe(b.charge, b.repsEffectuees, b.rpeEffectif) >
                estimer1RMDepuisRpe(a.charge, a.repsEffectuees, a.rpeEffectif)
                  ? b
                  : a,
              );

          const precedentes: Array<{ charge: number; reps: number; rpe?: number | null }> =
            await fetch(`/api/set-logs/last-session?exerciseInstanceId=${id}${sessionLogId ? `&excludeSessionId=${encodeURIComponent(sessionLogId)}` : ""}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => d?.sets ?? [])
              .catch(() => []);

          return {
            exerciseInstanceId: id,
            nom: instance?.nom ?? "Exercice sans nom",
            machineNom:
              instance?.machineNom && instance.machineNom !== instance.nom
                ? instance.machineNom
                : "",
            assistance,
            meilleure: {
              charge: meilleureSerie.charge,
              reps: meilleureSerie.repsEffectuees,
              reserve: rpeVersReserve(meilleureSerie.rpeEffectif),
            },
            e1rmCourant: assistance
              ? null
              : estimer1RMDepuisRpe(
                  meilleureSerie.charge,
                  meilleureSerie.repsEffectuees,
                  meilleureSerie.rpeEffectif,
                ),
            e1rmPrecedent:
              assistance || precedentes.length === 0
                ? null
                : Math.max(
                    ...precedentes.map((s) => estimer1RMDepuisRpe(s.charge, s.reps, s.rpe)),
                  ),
            premiereFois: precedentes.length === 0,
          } satisfies LigneRecap;
        }),
      );

      if (!annule) {
        setLignes(construites);
        setChargement(false);
      }
    })();

    return () => { annule = true; };
  }, [sets, sessionLogId]);

  if (chargement) {
    return (
      <div className="space-y-3">
        <p className="text-encre-3 text-sm">Analyse des progressions…</p>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-papier-2 rounded-lg h-14 animate-pulse" />
        ))}
      </div>
    );
  }

  if (lignes.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-encre-3 text-sm italic">Ce que cette séance a mesuré</p>
      {lignes.slice(0, APERCU_EXERCICES).map((l) => <LigneMesuree key={l.exerciseInstanceId} l={l} />)}
      {lignes.length > APERCU_EXERCICES && <details className="live-debrief-detail">
        <summary>Voir tous les exercices ({lignes.length})</summary>
        {lignes.slice(APERCU_EXERCICES).map((l) => <LigneMesuree key={l.exerciseInstanceId} l={l} />)}
      </details>}

      {lignes.some((l) => l.premiereFois) && (
        <p className="text-encre-3 text-xs pt-1">
          Une baseline n&apos;est pas un maximum&nbsp;: c&apos;est le repère à partir duquel
          les charges seront proposées.
        </p>
      )}
    </div>
  );
}

function LigneMesuree({ l }: { l: LigneRecap }) {
  return (
        <div
          key={l.exerciseInstanceId}
          className="border-t border-filet-doux pt-2.5 flex items-start justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-encre font-semibold text-sm leading-tight">{l.nom}</p>
            {l.machineNom && <p className="text-encre-3 text-xs mt-0.5">{l.machineNom}</p>}
          </div>

          <div className="text-right shrink-0">
            {l.premiereFois ? (
              <>
                {/* Pas un record : un point de départ. C'est le mot juste, et
                    c'est aussi ce que le moteur en fera. */}
                <p className="text-sm font-semibold text-encre">Baseline enregistrée</p>
                <p className="chiffres text-[11px] text-encre-3 mt-0.5 tabular-nums">
                  {formaterCharge(l.meilleure.charge)} kg × {l.meilleure.reps}
                  {l.meilleure.reserve !== null && <> · ~{l.meilleure.reserve} en réserve</>}
                </p>
              </>
            ) : l.assistance ? (
              <>
                {/* Moins d'aide, à répétitions comparables. Aucun maximum
                    estimé : il dirait le contraire de ce qui se passe. */}
                <p className="chiffres text-sm font-semibold text-encre tabular-nums">
                  {formaterCharge(l.meilleure.charge)} kg d&apos;assistance
                </p>
                <p className="text-[11px] text-encre-3 mt-0.5">
                  × {l.meilleure.reps} — moins d&apos;aide, c&apos;est mieux
                </p>
              </>
            ) : (
              <>
                <Delta
                  valeur={(l.e1rmCourant ?? 0) - (l.e1rmPrecedent ?? 0)}
                  unite="kg"
                  decimales={0}
                  className="text-base"
                />
                <p className="chiffres text-[11px] text-encre-3 mt-0.5 tabular-nums">
                  {formaterCharge(l.meilleure.charge)} kg × {l.meilleure.reps}
                </p>
              </>
            )}
          </div>
        </div>
  );
}
