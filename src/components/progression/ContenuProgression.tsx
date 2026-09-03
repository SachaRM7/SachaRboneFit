"use client";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { ExerciseProgressionChart } from "@/components/progression/ExerciseProgressionChart";
import { PillarVolumeChart } from "@/components/progression/PillarVolumeChart";
import { BodyWeightChart } from "@/components/progression/BodyWeightChart";
import { Records } from "@/components/progression/Records";
import { BilanProgression } from "@/components/progression/BilanProgression";
import type { Bilan } from "@/lib/engine/bilan-progression";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";

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

/**
 * Le bilan arrive avec la page ; les vues détaillées restent à la demande.
 *
 * L'écran s'ouvrait sur un spinner plein écran : composant client, `fetch`
 * après montage, et rien à lire avant que la requête revienne. Le bilan est
 * maintenant calculé par la page serveur et rendu d'emblée.
 *
 * Les quatre vues détaillées gardent leur chargement à la demande, et c'est
 * volontaire : personne ne les ouvre toutes, et les précharger ferait payer à
 * l'ouverture du bilan ce dont on ne se sert pas.
 */
export function ContenuProgression({ bilan }: { bilan: Bilan }) {
  const [vue, setVue] = useState<Vue | null>(null);
  const [exercices, setExercices] = useState<ExerciceTravaille[]>([]);
  const [instanceId, setInstanceId] = useState("");
  const [mois, setMois] = useState(3);

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
        <DeclarerContexte
          ecran="progression"
          typeEntite={vue === "exercice" && instanceId ? "instance" : null}
          entiteId={vue === "exercice" && instanceId ? instanceId : null}
        />
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
      <DeclarerContexte ecran="progression" />
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
        {/* Plus de spinner plein écran : le bilan arrive avec la page. */}
        <BilanProgression bilan={bilan} />

        {/* Les vues détaillées restent accessibles, mais après le bilan : on y
            va pour vérifier quelque chose, pas pour découvrir. */}
        {bilan.etat !== "sans_donnees" && (
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
