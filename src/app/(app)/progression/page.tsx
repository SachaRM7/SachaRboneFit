"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { ExerciseProgressionChart } from "@/components/progression/ExerciseProgressionChart";
import { PillarVolumeChart } from "@/components/progression/PillarVolumeChart";
import { BodyWeightChart } from "@/components/progression/BodyWeightChart";
import { Records } from "@/components/progression/Records";
import { BilanProgression } from "@/components/progression/BilanProgression";
import type { Bilan } from "@/lib/engine/bilan-progression";

/**
 * Progression.
 *
 * L'écran s'ouvrait sur cinq onglets et un sélecteur d'exercice vide : il
 * fallait choisir quelque chose pour voir quoi que ce soit, et le sélecteur
 * n'ayant jamais été rempli, il n'y avait rien à choisir.
 *
 * Il s'ouvre maintenant sur un bilan. Les vues détaillées existent toujours,
 * mais elles répondent à une question qu'on se pose APRÈS avoir vu l'ensemble :
 * « et cet exercice-là, il donne quoi ? »
 */

type Vue = "exercice" | "pilier" | "records" | "poids";

const VUES: { cle: Vue; libelle: string; description: string }[] = [
  { cle: "exercice", libelle: "Par exercice", description: "Charges séance après séance" },
  { cle: "pilier", libelle: "Par pilier", description: "Répartition du volume" },
  { cle: "records", libelle: "Records", description: "Tes meilleures performances" },
  { cle: "poids", libelle: "Poids de corps", description: "Tendance sur six mois" },
];

interface ExerciceTravaille {
  instanceId: string;
  nom: string;
  machineNom: string | null;
  seances: number;
}

export default function ProgressionPage() {
  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [vue, setVue] = useState<Vue | null>(null);
  const [exercices, setExercices] = useState<ExerciceTravaille[]>([]);
  const [instanceId, setInstanceId] = useState("");
  const [mois, setMois] = useState(3);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const res = await fetch("/api/progression/bilan");
      const corps = await res.json().catch(() => null);
      if (!res.ok || !corps?.bilan) throw new Error(corps?.error ?? `HTTP ${res.status}`);
      setBilan(corps.bilan as Bilan);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Chargement impossible");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  // La liste n'est chargée qu'à l'ouverture de la vue qui en a besoin.
  useEffect(() => {
    if (vue !== "exercice" || exercices.length > 0) return;
    void (async () => {
      const res = await fetch("/api/progression/exercices");
      if (!res.ok) return;
      const corps = await res.json().catch(() => null);
      const liste: ExerciceTravaille[] = corps?.exercices ?? [];
      setExercices(liste);
      // Le plus récemment travaillé est en tête : le présélectionner évite un
      // écran vide dès l'ouverture.
      if (liste[0]) setInstanceId(liste[0].instanceId);
    })();
  }, [vue, exercices.length]);

  if (vue) {
    const active = VUES.find((v) => v.cle === vue)!;
    return (
      <div className="min-h-dvh bg-papier text-encre">
        <header className="sticky top-0 z-10 bg-papier px-4 pt-8 pb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVue(null)}
            className="text-encre-2 -ml-2 w-9 h-9 grid place-items-center shrink-0"
            aria-label="Retour au bilan"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">{active.libelle}</h1>
        </header>

        <div className="px-4 pb-24 space-y-4">
          {vue === "exercice" && (
            <>
              <div className="flex gap-2">
                <select
                  className="bg-carte border border-filet text-encre rounded-xl px-3 h-11 text-sm flex-1 min-w-0"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  aria-label="Exercice"
                >
                  {exercices.length === 0 && <option value="">Aucun exercice travaillé</option>}
                  {exercices.map((e) => (
                    <option key={e.instanceId} value={e.instanceId}>
                      {e.machineNom ? `${e.nom} — ${e.machineNom}` : e.nom}
                    </option>
                  ))}
                </select>
                <select
                  className="bg-carte border border-filet text-encre rounded-xl px-3 h-11 text-sm shrink-0"
                  value={mois}
                  onChange={(e) => setMois(Number(e.target.value))}
                  aria-label="Période"
                >
                  <option value={1}>1 mois</option>
                  <option value={3}>3 mois</option>
                  <option value={6}>6 mois</option>
                </select>
              </div>
              {instanceId ? (
                <ExerciseProgressionChart instanceId={instanceId} months={mois} />
              ) : (
                <p className="text-encre-2 text-sm py-8 text-center">
                  Aucun exercice n&apos;a encore été travaillé.
                </p>
              )}
            </>
          )}

          {vue === "pilier" && <PillarVolumeChart months={mois} />}
          {vue === "records" && <Records />}
          {vue === "poids" && <BodyWeightChart months={6} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-papier text-encre">
      <header className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Progression</h1>
        {bilan?.periode && (
          <p className="text-encre-2 text-sm mt-0.5">
            Depuis le{" "}
            {new Date(`${bilan.periode.debut}T12:00:00`).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
            })}
          </p>
        )}
      </header>

      <div className="px-4 pb-24 space-y-6">
        {chargement && (
          <div className="py-16 grid place-items-center">
            <Loader2 className="w-5 h-5 animate-spin text-encre-3" aria-label="Chargement" />
          </div>
        )}

        {erreur && !chargement && (
          <div className="rounded-xl border border-filet bg-carte p-4 space-y-3">
            <p className="text-encre text-sm">Ton bilan n&apos;a pas pu être chargé.</p>
            <p className="text-encre-3 text-xs">{erreur}</p>
            <button
              type="button"
              onClick={() => void charger()}
              className="w-full h-11 rounded-xl border border-filet text-encre text-sm font-medium"
            >
              Réessayer
            </button>
          </div>
        )}

        {bilan && !chargement && !erreur && <BilanProgression bilan={bilan} />}

        {/* Les vues détaillées restent accessibles, mais après le bilan : on y
            va pour vérifier quelque chose, pas pour découvrir. */}
        {bilan && !chargement && !erreur && bilan.etat !== "sans_donnees" && (
          <section className="space-y-2">
            <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">
              Entrer dans le détail
            </h2>
            <ul className="rounded-xl border border-filet bg-carte divide-y divide-filet">
              {VUES.map((v) => (
                <li key={v.cle}>
                  <button
                    type="button"
                    onClick={() => setVue(v.cle)}
                    className="w-full text-left px-4 py-3.5 flex items-center gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-encre text-sm font-medium">{v.libelle}</span>
                      <span className="block text-encre-3 text-xs">{v.description}</span>
                    </span>
                    <ChevronLeft className="w-4 h-4 text-encre-3 rotate-180 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
