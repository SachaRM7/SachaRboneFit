"use client";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Dumbbell,
  ChartNoAxesCombined,
  Trophy,
  Scale,
} from "lucide-react";
import { ExerciseProgressionChart } from "@/components/progression/ExerciseProgressionChart";
import { PillarVolumeChart } from "@/components/progression/PillarVolumeChart";
import { BodyWeightChart } from "@/components/progression/BodyWeightChart";
import { Records } from "@/components/progression/Records";
import { BilanProgression } from "@/components/progression/BilanProgression";
import type { Bilan } from "@/lib/engine/bilan-progression";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";
import { MascotteCoach } from "@/components/coach/MascotteCoach";
import { resoudreMascotteProgression } from "@/lib/coach/resoudre-mascotte";

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

const ICONES = {
  exercice: Dumbbell,
  pilier: ChartNoAxesCombined,
  records: Trophy,
  poids: Scale,
};

const VUES: { cle: Vue; libelle: string; description: string }[] = [
  {
    cle: "exercice",
    libelle: "Par exercice",
    description: "Charges séance après séance",
  },
  {
    cle: "pilier",
    libelle: "Par pilier",
    description: "Répartition du volume",
  },
  {
    cle: "records",
    libelle: "Records",
    description: "Tes meilleures performances",
  },
  {
    cle: "poids",
    libelle: "Poids de corps",
    description: "Tendance sur six mois",
  },
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
  const [lectureExercices, setLectureExercices] = useState<
    "attente" | "charge" | "erreur"
  >("attente");
  const apercus: Record<Vue, string> = {
    exercice: bilan.enProgression.length
      ? `${bilan.enProgression.length} exercice${bilan.enProgression.length > 1 ? "s" : ""} en progression`
      : "Tes références de départ",
    pilier: bilan.volume
      ? `${bilan.volume.seriesDerniereSemaine} séries la semaine dernière`
      : "Construire ton historique de volume",
    records: bilan.recordsRecents.length
      ? `${bilan.recordsRecents.length} record${bilan.recordsRecents.length > 1 ? "s" : ""} récent${bilan.recordsRecents.length > 1 ? "s" : ""}`
      : "Découvrir tes repères",
    poids: "Suivi optionnel · ajouter une pesée",
  };

  // La liste n'est chargée qu'à l'ouverture de la vue qui en a besoin.
  useEffect(() => {
    if (vue !== "exercice" || exercices.length > 0) return;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch("/api/progression/exercices");
        if (!res.ok) throw new Error(String(res.status));
        const corps = await res.json().catch(() => null);
        if (annule) return;
        const liste: ExerciceTravaille[] = corps?.exercices ?? [];
        setExercices(liste);
        // Le plus récemment travaillé est en tête : le présélectionner évite un
        // écran vide dès l'ouverture.
        if (liste[0]) setInstanceId(liste[0].instanceId);
        setLectureExercices("charge");
      } catch {
        if (!annule) setLectureExercices("erreur");
      }
    })();
    return () => {
      annule = true;
    };
  }, [vue, exercices.length]);

  if (vue) {
    const active = VUES.find((v) => v.cle === vue)!;
    return (
      <div className="progression-v3 min-h-dvh bg-papier text-encre">
        <DeclarerContexte
          ecran="progression"
          typeEntite={vue === "exercice" && instanceId ? "instance" : null}
          entiteId={vue === "exercice" && instanceId ? instanceId : null}
        />
        {/* Même règle que la séance : l'en-tête se colle sous l'encoche. Le
            `pt-8` ne compensait rien — c'était l'espace du titre, et il se
            trouvait avoir à peu près la bonne taille sur un appareil sans
            encoche. */}
        <header
          className="sticky z-10 bg-papier px-4 pt-8 pb-4 flex items-center gap-2"
          style={{ top: "var(--marge-haut)" }}
        >
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

        <div className="px-4 space-y-4">
          {vue === "exercice" && (
            <>
              <div className="flex gap-2">
                <select
                  className="bg-carte border border-filet text-encre rounded-xl px-3 h-11 text-sm flex-1 min-w-0"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  aria-label="Exercice"
                >
                  {exercices.length === 0 && (
                    <option value="">
                      {lectureExercices === "attente"
                        ? "Chargement…"
                        : "Aucun exercice travaillé"}
                    </option>
                  )}
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
                <ExerciseProgressionChart
                  instanceId={instanceId}
                  months={mois}
                />
              ) : (
                <p className="text-encre-2 text-sm py-8 text-center">
                  {lectureExercices === "attente"
                    ? "Lecture de tes exercices…"
                    : lectureExercices === "erreur"
                      ? "Impossible de lire tes exercices. Reviens au bilan puis réessaie."
                      : "Tes exercices apparaîtront ici après ta première séance enregistrée."}
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
    <div className="progression-v3 min-h-dvh bg-papier text-encre">
      <DeclarerContexte ecran="progression" />
      <header className="dashboard-header progression-entete">
        {/*
          LE COACH QUI LIT TES DONNÉES.

          Trois visages, et chacun tient à un fait que le moteur a déjà établi
          (voir `lib/engine/bilan-progression`) :

            — `calibration` tant qu'il n'existe qu'une seule date de séance.
              Une première mesure produit mécaniquement le meilleur résultat
              jamais vu ; l'appeler un progrès serait un faux record, et cet
              écran est précisément celui où on le croirait.

            — `progres` quand `enProgression` n'est pas vide. Cette liste ne
              contient que des exercices comparés à EUX-MÊMES sur la même
              entrée, avec un score strictement positif : c'est la définition
              du dépôt, et ce lot n'en écrit aucune autre.

            — `analyse` sinon, qui est le cas ordinaire : on vient regarder.

          L'ORDRE COMPTE : `sansRepere` est testé en premier dans le résolveur.
        */}
        <div className="progression-mascotte">
          <MascotteCoach
            etat={resoudreMascotteProgression({
              sansRepere: bilan.etat !== "en_route",
              progresConfirme: bilan.enProgression.length > 0,
            })}
            taille="normal"
            presence="forte"
            anime
          />
        </div>
        <p className="eyebrow">La régularité fait la différence</p>
        <h1>Tes progrès.</h1>
        {bilan?.periode && (
          <p className="text-encre-2 text-sm mt-0.5">
            Depuis le{" "}
            {new Date(`${bilan.periode.debut}T12:00:00`).toLocaleDateString(
              "fr-FR",
              {
                day: "numeric",
                month: "long",
              },
            )}
          </p>
        )}
      </header>

      <div className="px-4 space-y-6">
        <section className="progress-snapshot">
          <p className="eyebrow">
            {bilan.etat === "en_route"
              ? "Dans la durée"
              : "Tes premières références"}
          </p>
          <h2>
            {bilan.etat === "sans_donnees"
              ? "Tout commence par une séance."
              : bilan.etat === "premieres_references"
                ? "Tu poses tes bases."
                : "Regarde le chemin parcouru."}
          </h2>
          <p>
            <strong>{bilan.seancesTotal}</strong> séance
            {bilan.seancesTotal > 1 ? "s" : ""} enregistrée
            {bilan.seancesTotal > 1 ? "s" : ""}
            {bilan.dureeMedianeMinutes !== null && (
              <> · {bilan.dureeMedianeMinutes} min de durée habituelle</>
            )}
          </p>
          <span>
            {bilan.enProgression.length
              ? "Tes progrès se lisent exercice par exercice, sur le même matériel."
              : "Tes mesures construisent les comparaisons des prochaines séances."}
          </span>
        </section>
        {/* Plus de spinner plein écran : le bilan arrive avec la page. */}
        {/* Les vues détaillées restent accessibles, mais après le bilan : on y
            va pour vérifier quelque chose, pas pour découvrir. */}
        {
          <section className="space-y-2">
            <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">
              Choisis ce que tu veux suivre
            </h2>
            <ul className="progress-explore-grid">
              {VUES.map((v) => {
                const Icone = ICONES[v.cle];
                return (
                  <li key={v.cle}>
                    <button
                      type="button"
                      onClick={() => setVue(v.cle)}
                      className="progress-explore-card"
                    >
                      <Icone
                        className="w-10 h-10 p-2.5 bg-papier-2 rounded-xl text-primary shrink-0"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-encre text-sm font-medium">
                          {v.libelle}
                        </span>
                        <span className="block text-encre-3 text-xs">
                          {apercus[v.cle]}
                        </span>
                      </span>
                      <ChevronLeft
                        className="w-4 h-4 text-encre-3 rotate-180 shrink-0"
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        }

        <details
          className="progress-analysis"
          open={bilan.etat === "sans_donnees"}
        >
          <summary>Ton bilan en détail</summary>
          <BilanProgression bilan={bilan} />
        </details>
      </div>
    </div>
  );
}
