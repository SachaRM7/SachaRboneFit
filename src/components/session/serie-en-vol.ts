import type { Poster } from "./arret-sur-douleur";

/**
 * Pousser une série vers la base sans jamais retenir l'athlète.
 *
 * LE DÉFAUT FERMÉ
 *
 * Rien de la séance n'atteignait Postgres avant l'écran de fin. Une heure
 * d'entraînement tenait dans le `localStorage` : Safari qui tombe, un onglet
 * fermé par le système sous pression mémoire, et la séance n'avait jamais eu
 * lieu.
 *
 * LES TROIS CONTRAINTES, ET ELLES SE CONTREDISENT PRESQUE
 *
 * 1. Valider une série doit rester instantané. Attendre un aller-retour réseau
 *    entre deux séries, sur une connexion de sous-sol, rendrait le Live pire
 *    que le brouillon local qu'on remplace.
 * 2. La série doit survivre à la fermeture de l'onglet — d'où `keepalive`,
 *    comme pour les incidents du lot 16.
 * 3. Un échec passager ne doit pas la perdre — d'où une reprise, courte.
 *
 * D'où : optimiste en local (le store a déjà écrit), envoi immédiat sans
 * attente, quelques reprises espacées, et la base qui fait autorité à la
 * reprise. Pas de file d'attente persistée, pas de moteur hors-ligne : le
 * brouillon local joue déjà ce rôle, et la clôture réécrit de toute façon la
 * liste complète.
 *
 * La fonction ne rend RIEN — pas même une promesse. Un appelant ne doit pas
 * pouvoir l'attendre : ce serait rétablir le défaut par la porte de l'appelant,
 * comme pour `arreterSurDouleur` et `envoyerIncident`.
 */

/** Une série telle que la route l'attend. */
export interface SerieAPousser {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number;
  charge: number;
  rpeEffectif?: number | null;
  tempoRespecte?: boolean | null;
  reposReelSecondes?: number | null;
  notes?: string | null;
}

export interface OptionsPoussee {
  poster?: Poster;
  /** Attendre avant une reprise. Injectable pour que le test ne dorme pas. */
  attendre?: (ms: number) => Promise<void>;
  /** Prévenu quand toutes les reprises ont échoué. */
  onAbandon?: (raison: string) => void;
}

/**
 * Les délais entre deux tentatives, en millisecondes.
 *
 * Trois essais au total, sur moins de dix secondes. Au-delà, on n'attend plus :
 * le brouillon local tient toujours la série, et la clôture réécrira la liste
 * complète. Insister davantage consommerait la batterie d'un téléphone en
 * salle pour un gain nul.
 */
const REPRISES_MS = [1_000, 3_000, 6_000];

export function cheminSeries(sessionLogId: string): string {
  return `/api/session-logs/${sessionLogId}/series`;
}

/**
 * Ce refus mérite-t-il une reprise ?
 *
 * Un 422 dit que la série ne mesure rien, un 404 que la séance n'existe pas,
 * un 401 qu'on n'est plus connecté : les rejouer donnerait exactement le même
 * refus, trois fois. Seuls le transport et les pannes serveur se réessaient.
 */
function meriteUneReprise(statut: number | undefined): boolean {
  if (statut === undefined) return true; // panne réseau : pas de réponse du tout
  return statut >= 500 || statut === 408 || statut === 429;
}

export function pousserSerie(
  sessionLogId: string,
  serie: SerieAPousser,
  options: OptionsPoussee = {},
): void {
  const poster: Poster = options.poster ?? ((url, init) => fetch(url, init));
  const attendre = options.attendre ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const init: RequestInit = {
    method: "POST",
    // La requête survit au démontage du composant, et à la fermeture de
    // l'onglet. C'est le mécanisme du lot 16, pour la même raison.
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serie),
  };

  void (async () => {
    for (let essai = 0; ; essai += 1) {
      try {
        const reponse = await poster(cheminSeries(sessionLogId), init) as
          { ok?: boolean; status?: number } | undefined;
        if (reponse?.ok !== false) return;
        // Un 4xx ne rejette pas : `fetch` ne considère comme une erreur que
        // l'échec du transport. Sans ce test, un refus passerait pour un succès.
        if (!meriteUneReprise(reponse.status)) {
          options.onAbandon?.(`refus ${reponse.status ?? "?"}`);
          return;
        }
      } catch {
        // Panne réseau : on réessaie, c'est précisément le cas qui le mérite.
      }

      const delai = REPRISES_MS[essai];
      if (delai === undefined) {
        // Le brouillon local tient toujours la série, et la clôture réécrira
        // la liste complète : abandonner ici ne perd rien tant que l'onglet vit.
        options.onAbandon?.("réseau indisponible");
        return;
      }
      await attendre(delai);
    }
  })();
}

/** Retirer de la base une série décochée. Même contrat : rien n'est attendu. */
export function retirerSerieEnVol(
  sessionLogId: string,
  cle: { exerciseInstanceId: string; numeroSerie: number },
  options: OptionsPoussee = {},
): void {
  const poster: Poster = options.poster ?? ((url, init) => fetch(url, init));
  try {
    void Promise.resolve(poster(cheminSeries(sessionLogId), {
      method: "DELETE",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cle),
    })).catch(() => {});
  } catch {
    // Même règle qu'ailleurs : l'écran ne s'arrête pas pour ça.
  }
}
