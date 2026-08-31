/**
 * Ce qu'on dit quand ça ne marche pas.
 *
 * Les écrans affichaient `HTTP 500`, « Erreur », ou le message d'une exception
 * technique. Trois défauts en un : l'utilisateur ne sait pas ce qui a échoué,
 * ni si ses données sont perdues, ni quoi faire.
 *
 * Un message d'erreur utile dit ces trois choses — et rien de plus. Il ne
 * s'excuse pas, ne dramatise pas, et ne promet jamais quelque chose qui n'est
 * pas vrai : « tes séries sont conservées » ne s'écrit que là où elles le sont
 * réellement.
 */

/** Codes que le serveur renvoie et qui ont un sens pour l'utilisateur. */
const PAR_STATUT: Record<number, string> = {
  401: "Ta session a expiré. Reconnecte-toi pour continuer.",
  403: "Cette action ne t'est pas permise.",
  404: "Introuvable — l'élément a peut-être été supprimé.",
  409: "Quelque chose a changé entre-temps. Recharge la page et réessaie.",
  413: "Le contenu envoyé est trop volumineux.",
  429: "Trop de demandes d'un coup. Attends quelques secondes.",
};

/**
 * Message affichable à partir de ce qui a échoué.
 *
 * `action` décrit ce qui était en cours, à l'infinitif : « enregistrer ta
 * séance », « charger ton bilan ». Il sert à composer la première phrase.
 */
export function messageErreur(action: string, cause?: unknown, statut?: number): string {
  if (statut && PAR_STATUT[statut]) return PAR_STATUT[statut];

  if (statut && statut >= 500) {
    return `Impossible d'${action} : le serveur n'a pas répondu correctement. Réessaie dans un instant.`;
  }

  // Hors ligne : la seule cause dont on soit certain côté navigateur.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return `Impossible d'${action} : tu sembles hors ligne. Réessaie une fois la connexion revenue.`;
  }

  // Un message métier explicite du serveur vaut mieux que le nôtre — à
  // condition qu'il s'adresse à un humain et non à un développeur.
  const texte = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "";
  if (texte && lisiblePourUnHumain(texte)) return texte;

  return `Impossible d'${action}. Réessaie dans un instant.`;
}

/**
 * Un message du serveur est-il présentable ?
 *
 * On écarte ce qui trahit la technique : codes HTTP, noms de classe d'erreur,
 * `snake_case`, fragments anglais des bibliothèques.
 */
function lisiblePourUnHumain(texte: string): boolean {
  if (texte.length > 200) return false;
  return !/(HTTP\s*\d|\bfetch\b|\bError\b|\bfailed\b|\bundefined\b|\bnull\b|[a-z]+_[a-z]+|^\d{3}$)/i.test(
    texte,
  );
}

/**
 * Ce qu'on dit pendant qu'on attend.
 *
 * Un texte de chargement décrit l'action en cours, pas la technique qui la
 * réalise : « je prépare ta séance » et non « génération IA ». Il n'est
 * honnête que s'il correspond au traitement réellement lancé.
 */
export const ATTENTE = {
  bilan: "Je rassemble ta progression…",
  programme: "Je regarde ton programme…",
  seance: "Je prépare ta séance…",
  enregistrement: "J'enregistre…",
  coach: "Je réfléchis…",
} as const;
