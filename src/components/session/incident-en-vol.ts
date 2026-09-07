import type { Poster } from "./arret-sur-douleur";

/**
 * Consigner un incident sans jamais retenir la personne qui l'a signalé.
 *
 * LE DÉFAUT CORRIGÉ
 *
 * `SOSSymptome.arreter()` faisait, dans cet ordre :
 *
 *     tracer("arreter");                  // → onIncident → fetch("/api/incidents")
 *     onStopSeance();                     // → router.push(".../finish")
 *
 * L'ordre était bon, et l'appel n'était pas attendu. Il manquait pourtant
 * l'essentiel : le `fetch` partait SANS `keepalive`. Une requête ordinaire est
 * liée au document qui l'a émise — la navigation vers `/finish` l'annule, et
 * sur Safari mobile elle l'annule presque toujours.
 *
 * Le contrat annoncé par l'écran — « terminer la séance consigne quand même le
 * symptôme » — n'était donc pas tenu par l'UI réelle. Exactement la classe de
 * défaut déjà corrigée pour l'arrêt sur douleur, à un endroit où personne ne
 * l'avait cherchée : le signalement le plus sérieux d'une séance était aussi
 * le seul à pouvoir se perdre.
 *
 * CE QU'ON NE FAIT PAS
 *
 * On n'attend pas la réponse avant de naviguer. Faire dépendre l'arrêt d'un
 * aller-retour réseau retiendrait l'athlète dans la séance qu'il vient
 * d'arrêter, sur une connexion de salle de sport à dix secondes de latence.
 * `keepalive` règle le problème dans l'autre sens : la requête survit au
 * démontage du composant, et même à la fermeture de l'onglet.
 *
 * Aucune seconde route, aucun contournement : c'est toujours `/api/incidents`,
 * avec sa vérification de propriété de séance.
 */

export const URL_INCIDENTS = "/api/incidents";

/** Un incident tel que la route l'attend. */
export interface EnvoiIncident {
  sessionLogId: string;
  type: string;
  contexte: Record<string, unknown>;
  decision: string;
}

export interface OptionsEnvoi {
  /** Injectable pour le test, `fetch` en production. */
  poster?: Poster;
  /**
   * Prévenir d'un échec — pour les SOS qui ne naviguent pas.
   *
   * Facultatif, et il doit le rester : sur le chemin de l'arrêt, l'écran a
   * disparu avant la réponse et il n'y a plus personne à prévenir.
   */
  onEchec?: () => void;
}

/**
 * Poste l'incident et rend la main immédiatement.
 *
 * La fonction ne rend RIEN — pas même une promesse. Un appelant ne doit pas
 * pouvoir l'attendre : ce serait rétablir le défaut par la porte de l'appelant,
 * et c'est la leçon de `arreterSurDouleur`.
 *
 * `keepalive` sert aussi les trois autres SOS, qui ne naviguent pas : une
 * requête émise juste avant que l'utilisateur ferme l'onglet ou bascule
 * d'application avait la même chance de se perdre.
 */
export function envoyerIncident(envoi: EnvoiIncident, options: OptionsEnvoi = {}): void {
  const poster: Poster = options.poster ?? ((url, init) => fetch(url, init));

  try {
    void Promise.resolve(
      poster(URL_INCIDENTS, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_log_id: envoi.sessionLogId,
          type: envoi.type,
          contexte: envoi.contexte,
          decision: envoi.decision,
        }),
      }),
    ).then(
      (reponse) => {
        // Un 4xx ne rejette pas : `fetch` ne considère comme une erreur que
        // l'échec du transport. Sans ce test, une requête refusée passerait
        // pour un succès.
        const ok = (reponse as { ok?: boolean } | undefined)?.ok;
        if (ok === false) options.onEchec?.();
      },
      // Le rejet est avalé ICI, pas plus haut : une promesse rejetée sans
      // gestionnaire remonterait à la console du navigateur, souvent sur un
      // écran que l'utilisateur vient de quitter.
      () => { options.onEchec?.(); },
    );
  } catch {
    // `fetch` peut lever de façon synchrone — URL invalide, contexte sans
    // réseau. Même là, l'appelant reprend la main.
    options.onEchec?.();
  }
}

export interface ArretEnConsignant {
  /** Ce qui lance la persistance. Ne doit jamais être attendu. */
  consigner: () => void;
  /** Ce qui quitte la séance. Appelé de façon synchrone, toujours. */
  onStopSeance: () => void;
  onClose: () => void;
}

/**
 * Consigner, puis arrêter — dans cet ordre, sans jamais attendre.
 *
 * L'ordre n'est pas cosmétique. Après `onStopSeance`, la navigation peut
 * démonter le composant, et l'état qui compose le corps de la requête n'aurait
 * plus de raison d'exister.
 *
 * Et un échec de la persistance n'empêche pas l'arrêt : c'est tout l'objet de
 * cette fonction. Une gêne assez forte pour qu'on termine la séance ne doit pas
 * dépendre d'un réseau de sous-sol.
 */
export function arreterEnConsignant(entrees: ArretEnConsignant): void {
  try {
    entrees.consigner();
  } catch {
    // Rien ne remonte : l'arrêt a lieu quoi qu'il arrive.
  }

  entrees.onStopSeance();
  entrees.onClose();
}
