/**
 * Arrêter une séance sur douleur — et l'invariant qui a coûté deux passes.
 *
 *     APPUI SUR « ARRÊTER LA SÉANCE »
 *     → l'arrêt est engagé immédiatement.
 *     → aucun réseau, aucune persistance, aucune décision secondaire ne peut
 *       le retarder.
 *
 * DEUX FAÇONS DE L'ENFREINDRE, et les deux ont été commises.
 *
 * La première était visible : l'écran basculait sur « Ménager cette zone ? »
 * et n'appelait `onStopSeance` qu'après la réponse. Appuyer sur « Arrêter » ne
 * l'arrêtait pas — il fallait d'abord répondre à une question sur les
 * prochaines séances.
 *
 * La seconde l'était beaucoup moins, parce qu'elle avait la forme d'une
 * précaution :
 *
 *     const arreter = async () => {
 *       await signaler("Séance arrêtée sur douleur");
 *       onStopSeance();
 *     };
 *
 * Ce `await` n'attend pas une décision — il attend le RÉSEAU. Sur une
 * connexion de salle de sport à dix secondes de latence, l'athlète reste dix
 * secondes dans la séance qu'il vient d'arrêter, sans rien comprendre. Une
 * consigne prudente peut retenir quelqu'un aussi sûrement qu'une question.
 *
 * D'OÙ CE MODULE, et pourquoi il est séparé du composant.
 *
 * L'invariant se prouve mal sur un composant React : il faudrait un rendu, un
 * clic, et une horloge. Ici il se prouve en trois lignes — un `poster` qui ne
 * se résout JAMAIS, et `onStopSeance` déjà appelé. Le test ne peut pas passer
 * par accident.
 *
 * Rien n'est attendu, rien n'est renvoyé, et aucune erreur ne remonte : après
 * l'appel, la feuille est démontée et il n'y a plus personne pour l'afficher.
 */

/** Ce que le navigateur doit poster, tel quel. */
export interface EnvoiSignalement {
  url: string;
  corps: unknown;
}

/**
 * Le poste-lettre. Injectable pour le test, `fetch` en production.
 *
 * Le type est volontairement plus large que `fetch` : ce chemin ne lit jamais
 * la réponse, et exiger une `Response` obligerait le test à en fabriquer une
 * pour une valeur dont personne ne fait rien.
 */
export type Poster = (url: string, init: RequestInit) => Promise<unknown>;

export interface ArretSurDouleur {
  envoi: EnvoiSignalement;
  /** Ce qui quitte la séance. Appelé de façon synchrone, toujours. */
  onStopSeance: () => void;
  /** Ce qui referme la feuille. */
  onClose: () => void;
  poster?: Poster;
}

/**
 * Déclenche la persistance, puis arrête — dans cet ordre, sans jamais attendre.
 *
 * `keepalive` est ce qui rend le tir-et-oublie honnête plutôt que négligent :
 * la requête survit au démontage du composant, et même à la fermeture de
 * l'onglet. C'est le même mécanisme que le filet de sortie de
 * `FicheExecution`, pour la même raison — une écriture qu'on ne veut pas
 * perdre, dans un moment où l'écran disparaît.
 *
 * Le signalement compte : c'est lui qui rendra la prochaine gêne
 * reconnaissable comme une répétition. Mais il ne vaut pas de retenir
 * quelqu'un dans une séance qu'il vient d'arrêter, et s'il se perd, la séance
 * s'arrête quand même.
 *
 * La fonction ne rend RIEN — pas même une promesse. Un appelant ne doit pas
 * pouvoir l'attendre : ce serait rétablir le défaut par la porte de l'appelant.
 */
export function arreterSurDouleur(entrees: ArretSurDouleur): void {
  const poster: Poster = entrees.poster ?? ((url, init) => fetch(url, init));

  try {
    void poster(entrees.envoi.url, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entrees.envoi.corps),
      // Le rejet est avalé ICI, pas plus haut : après l'arrêt, il n'y a plus
      // d'écran pour montrer une erreur, et une promesse rejetée sans
      // gestionnaire remonterait à la console du navigateur.
    }).catch(() => {});
  } catch {
    // `fetch` peut lever de façon synchrone — une URL invalide, un contexte
    // sans réseau. Même là, l'arrêt a lieu : c'est tout l'objet de ce module.
  }

  entrees.onStopSeance();
  entrees.onClose();
}
