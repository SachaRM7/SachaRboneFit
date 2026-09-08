/**
 * LES TREIZE VISAGES DU COACH — le registre, et lui seul.
 *
 * POURQUOI UN REGISTRE CENTRAL
 *
 * Un chemin d'image écrit dans un composant est un chemin qu'on oublie de
 * changer. Treize états × une dizaine de surfaces donnent très vite des
 * `/coach-mascot/coach-repos.png` disséminés, dont un ou deux finissent par
 * pointer vers un fichier renommé — et l'écran affiche un cadre vide sans que
 * rien ne se plaigne. Tout passe donc par ici.
 *
 * CE QUE CE MODULE N'EST PAS
 *
 * Il ne décide RIEN. Il ne sait pas ce qu'est une série, une douleur ou un
 * repos : il associe un état visuel à des fichiers et à un texte alternatif.
 * Le choix de l'état vit dans les résolveurs (`resoudre-mascotte.ts`), la
 * vérité métier vit dans le moteur et la base.
 *
 * LES MASTERS NE SONT PAS SERVIS
 *
 * `public/coach-mascot/*.png` sont les sources fournies : ~1,2 Mo chacune, pour
 * 1250 px de côté. Ce sont elles qu'on archive et qu'on retouche si besoin ;
 * ce ne sont jamais elles qu'un téléphone télécharge. Le runtime lit les dérivés
 * WebP de `public/coach-mascot/w/`, produits par
 * `src/scripts/mascotte-derives.mts` sans le moindre recadrage.
 */

/**
 * Les treize états canoniques.
 *
 * Cette liste est FERMÉE. Ajouter un quatorzième état demanderait un asset
 * dessiné pour lui : inventer une correspondance avec une image existante
 * ferait dire au Coach autre chose que ce qu'il montre.
 */
export const ETATS_MASCOTTE = [
  "analyse",
  "technique",
  "planification",
  "training",
  "attention",
  "repos",
  "encouragement",
  "progres",
  "calibration",
  "debrief",
  "intervention",
  "ready",
  "beast",
] as const;

export type EtatVisuelMascotte = (typeof ETATS_MASCOTTE)[number];

/** Les trois échelles produites — voir `mascotte-derives.mts`. */
export const TAILLES_MASCOTTE = ["compact", "normal", "hero"] as const;
export type TailleMascotte = (typeof TAILLES_MASCOTTE)[number];

/** Les dimensions réelles des fichiers, pour réserver la place avant chargement. */
export const LARGEURS_MASCOTTE: Record<TailleMascotte, number> = {
  compact: 144,
  normal: 288,
  hero: 512,
};

interface AssetMascotte {
  /** Le nom de fichier, sans extension ni taille. */
  base: string;
  /**
   * Ce que la mascotte dit, quand elle dit quelque chose.
   *
   * Vide pour les états purement décoratifs : le fait qu'ils illustrent est
   * TOUJOURS écrit à côté en toutes lettres, et un lecteur d'écran qui répète
   * « Coach en train de s'entraîner » à chaque série n'aide personne.
   * Renseigné là où la mascotte porte réellement une nuance que le texte voisin
   * ne porte pas.
   */
  alt: string;
  /** Ce que cet état signifie — la référence quand on hésite à l'employer. */
  sens: string;
}

export const ASSETS_MASCOTTE: Record<EtatVisuelMascotte, AssetMascotte> = {
  analyse: {
    base: "coach-analyse",
    alt: "",
    sens: "Le Coach réfléchit : progression, stagnation, lecture de données.",
  },
  technique: {
    base: "coach-technique",
    alt: "",
    sens: "Le Coach enseigne : fiche d'exécution, réglages, tempo, démonstration.",
  },
  planification: {
    base: "coach-planification",
    alt: "",
    sens: "Le Coach montre le plan : programme, cycle, matériel, réorganisation.",
  },
  training: {
    base: "coach-training",
    alt: "",
    sens: "L'état de fond du Live : la séance est en cours, rien ne réclame l'attention.",
  },
  attention: {
    base: "coach-attention",
    alt: "Le Coach demande de faire attention",
    sens:
      "« Attends, regardons ça. » Douleur, symptôme, feu, check-in après une pause. "
      + "Le robot n'est jamais blessé lui-même : il signale, il ne souffre pas.",
  },
  repos: {
    base: "coach-repos",
    alt: "",
    sens:
      "Récupération VOLONTAIRE, entre deux séries. Jamais « l'athlète est épuisé ».",
  },
  encouragement: {
    base: "coach-encouragement",
    alt: "",
    sens: "« Bien joué. » Une étape franchie — un exercice terminé. Pas un record.",
  },
  progres: {
    base: "coach-progres",
    alt: "Le Coach salue une progression",
    sens:
      "Une réussite NOTABLE, prouvée par les règles de progression existantes. "
      + "Jamais une baseline, jamais une calibration, jamais un faux record.",
  },
  calibration: {
    base: "coach-calibration",
    alt: "",
    sens:
      "« Je construis ton repère. » Reprise, première mesure, machine sans "
      + "historique comparable, réserve de répétitions.",
  },
  debrief: {
    base: "coach-debrief",
    alt: "",
    sens:
      "Le bilan. Fin de séance, débrief hebdomadaire — neutre quand rien ne "
      + "justifie de célébrer.",
  },
  intervention: {
    base: "coach-intervention",
    alt: "Le Coach a remarqué quelque chose",
    sens:
      "« J'ai remarqué quelque chose. » Un fait déterministe relevé par "
      + "l'observateur de séance. Un constat, jamais un diagnostic.",
  },
  ready: {
    base: "coach-ready",
    alt: "",
    sens: "« On y va. » Séance prête, juste avant de commencer.",
  },
  beast: {
    base: "coach-beast",
    alt: "",
    sens:
      "EASTER EGG DORMANT. Enregistré, jamais déclenché — voir la note en bas "
      + "de ce fichier avant d'y toucher.",
  },
};

/** Le dérivé WebP servi au navigateur pour un état et une taille donnés. */
export function urlMascotte(
  etat: EtatVisuelMascotte,
  taille: TailleMascotte = "normal",
): string {
  return `/coach-mascot/w/${ASSETS_MASCOTTE[etat].base}-${taille}.webp`;
}

/**
 * Le master d'origine — pour l'archivage et les outils, pas pour le runtime.
 *
 * Aucun composant ne devrait l'appeler : servir 1,2 Mo là où 8 Ko suffisent est
 * exactement ce que les dérivés existent pour éviter.
 */
export function masterMascotte(etat: EtatVisuelMascotte): string {
  return `/coach-mascot/${ASSETS_MASCOTTE[etat].base}.png`;
}

/**
 * BEAST — comment le brancher, le jour où on le décidera.
 *
 * L'asset est enregistré et volontairement inatteignable : aucun résolveur ne
 * le rend, et il n'existe dans ce lot aucun `Math.random()`, aucune date, aucun
 * seuil qui puisse l'invoquer. Un easter egg qui se déclenche tout seul n'est
 * pas un easter egg, c'est un bug qu'on n'arrive pas à reproduire.
 *
 * Pour l'activer plus tard, il faudra un FAIT déterministe — le genre de chose
 * que le moteur sait déjà établir, par exemple un record confirmé sur un
 * mouvement lourd — et un passage explicite de cet état à `<MascotteCoach>`
 * depuis la surface concernée. Rien à changer ici.
 */
