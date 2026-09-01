"use client";
import { useEffect, useState } from "react";
import type { ContexteExecutionClient } from "./execution-client";
import type { ExercicePrescrit } from "./types";

/**
 * Charge ce qu'il faut savoir devant la machine, sans retarder la première série.
 *
 * L'objectif de l'écran de séance n'a pas changé : application ouverte, on
 * saisit. Ces informations — tempo, réglages retenus, note — sont utiles mais
 * jamais bloquantes, donc elles arrivent APRÈS le rendu. Tant qu'elles ne sont
 * pas là, la carte s'affiche sans elles plutôt qu'avec des emplacements vides
 * qui sauteraient à l'arrivée des données.
 *
 * Un échec réseau ne dit rien : on ne remplace pas une information manquante
 * par un message d'erreur au milieu d'une séance. Le détail reste ouvrable, et
 * une seconde tentative aura lieu au prochain rendu de l'écran.
 */
export function useContexteExecution(exercice: ExercicePrescrit) {
  const [contexte, setContexte] = useState<ContexteExecutionClient | null>(null);

  const instanceId = exercice.id;
  const exerciseId = exercice.exerciseId ?? null;
  const tempoSeance = exercice.tempo ?? null;

  useEffect(() => {
    if (!exerciseId) return;
    let vivant = true;

    const params = new URLSearchParams({ exerciseId });
    if (tempoSeance) params.set("tempoSeance", tempoSeance);

    fetch(`/api/execution/${instanceId}?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (vivant && c) setContexte(c); })
      .catch(() => { /* silence assumé : voir l'en-tête */ });

    return () => { vivant = false; };
  }, [instanceId, exerciseId, tempoSeance]);

  return { contexte, remplacer: setContexte };
}
