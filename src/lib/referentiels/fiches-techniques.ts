import type { FicheTechnique } from "@/lib/engine/execution";

/**
 * Ce qu'on explique devant la machine — et rien qu'on ne sache pas.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * `exercises.fiche_technique` attendait du contenu depuis la PR #4. Le
 * catalogue en compte cent vingt et n'en portait AUCUN : `ficheRenseignee`
 * rendait donc `false` partout, la section « Comment faire » ne s'affichait
 * jamais, et l'athlète ouvrait « Réglages et technique » pour y trouver une
 * note vide. La plomberie était juste ; il n'y avait rien à faire passer
 * dedans.
 *
 * POURQUOI À CÔTÉ DU CATALOGUE, ET PAS DEDANS
 *
 * Ce n'est pas une seconde base : c'est la même, rangée par concern. Les clés
 * sont les slugs du catalogue — un test échoue si l'une d'elles n'y existe
 * pas — et c'est le seed qui les écrit dans `exercises.fiche_technique`.
 * `illustrations.ts` suit déjà exactement ce patron, pour la même raison :
 * mille cinq cents lignes de catalogue plus seize fiches rédigées dans le même
 * fichier ne se relisent plus.
 *
 * CE QU'ON NE REMPLIT PAS
 *
 * Pas les cent vingt exercices. Seulement ceux que le programme de reprise
 * atteint réellement, et ceux rencontrés le 6 septembre. Rédiger cent quatre
 * fiches qu'on n'a pas vérifiées produirait exactement le genre de contenu
 * plausible et faux que ce dépôt refuse ailleurs.
 *
 * LA FRONTIÈRE QUI TIENT TOUT
 *
 *   MOUVEMENT   ce qui est vrai sur n'importe quelle machine qui le fait.
 *               « Règle le siège pour que la poignée arrive à hauteur de
 *               poitrine. » C'est ici.
 *
 *   APPAREIL    « Siège 5. » Le nombre dépend de la machine ET du gabarit de
 *               la personne. Il appartient aux `instance_reglages` de la
 *               PR #12, et il n'a rien à faire dans une fiche commune : posé
 *               ici, il serait faux pour tous les autres appareils et pour
 *               tous les autres corps.
 *
 * Aucune fiche ci-dessous ne contient de numéro de cran, d'angle exact, de
 * plage de pile, de poids de chariot ni de référence de poignée. Un test le
 * vérifie sur le texte, parce que c'est le genre de détail qui se glisse dans
 * une rédaction sans qu'on y pense.
 */

/**
 * Les fiches, par slug du catalogue.
 *
 * Chaque section reste courte : on les lit debout, entre deux séries, avec les
 * mains moites. Une consigne qu'on ne lit pas ne protège personne.
 */
export const FICHES_TECHNIQUES: Record<string, FicheTechnique> = {
  // -------------------------------------------------------------------------
  // P3 — squat
  // -------------------------------------------------------------------------
  "hack-squat": {
    description:
      "Squat guidé sur rails : le dos est soutenu, ce qui permet de charger les "
      + "cuisses sans avoir à stabiliser une barre.",
    installation:
      "Cale le dos et les épaules contre les appuis, à plat. Les épaulières "
      + "doivent porter sur le haut des trapèzes, pas sur la nuque. Déverrouille "
      + "les sécurités seulement une fois installé.",
    positionDepart:
      "Pieds à peu près à largeur de bassin sur la plateforme, un peu en avant "
      + "des hanches. Plus haut sur la plateforme sollicite davantage les "
      + "fessiers et ischios, plus bas les quadriceps.",
    execution:
      "Descends en contrôlant, genoux dans l'axe des pieds. Remonte en poussant "
      + "dans toute la surface du pied, sans rebondir en bas.",
    amplitude:
      "Descends aussi bas que le bassin et le dos restent plaqués et que rien "
      + "ne gêne. Le bassin qui décolle marque la limite du jour — elle n'est "
      + "pas la même à chaque séance.",
    respiration: "Inspire avant de descendre, souffle en remontant.",
    sensation: "Tu devrais surtout sentir les cuisses, et les fessiers en bas.",
    pointsCles: [
      "Dos et épaules plaqués du début à la fin",
      "Genoux dans l'axe des pieds",
      "Remontée sans rebond",
    ],
    erreursFrequentes: [
      "Chercher la profondeur en laissant le bassin décoller",
      "Rebondir en bas pour repartir",
    ],
    securite:
      "Une pression sur les épaules est fréquente ; une douleur, non. Si ça "
      + "fait mal, signale-le plutôt que d'insister.",
    // Le seul des trois où la direction visible coïncide avec la phase.
    libellesPhasesTempo: {
      excentrique: "Descente",
      pause_etire: "Pause en bas",
      concentrique: "Remontée",
    },
  },

  "leg-press": {
    description:
      "Poussée des jambes sur chariot guidé. Le dos est soutenu, la charge se "
      + "concentre sur les cuisses.",
    installation:
      "Assieds-toi au fond, dos et bassin en contact avec le dossier. Règle le "
      + "dossier pour que le bas du dos reste collé pendant toute la descente.",
    positionDepart:
      "Pieds à plat sur la plateforme, écartés d'environ la largeur du bassin, "
      + "orteils légèrement ouverts.",
    execution:
      "Fléchis les genoux en contrôlant, puis pousse sans verrouiller "
      + "brutalement en fin de mouvement.",
    amplitude:
      "Descends jusqu'à ce que le bas du dos commence à vouloir décoller du "
      + "dossier : c'est ta limite, et elle vaut mieux qu'une profondeur "
      + "affichée.",
    respiration: "Inspire à la descente, souffle à la poussée.",
    sensation: "Tu devrais surtout sentir les cuisses, et les fessiers en position basse.",
    pointsCles: ["Bas du dos collé au dossier", "Pieds à plat", "Pas de verrouillage sec"],
    erreursFrequentes: [
      "Descendre au point d'enrouler le bas du dos",
      "Pousser sur la pointe des pieds",
    ],
    libellesPhasesTempo: {
      excentrique: "Descends le chariot",
      pause_etire: "Reste en bas",
      concentrique: "Pousse le chariot",
      pause_contracte: "Garde les jambes presque tendues",
    },
  },

  // -------------------------------------------------------------------------
  // P1 — poussée
  // -------------------------------------------------------------------------
  "machine-chest-press": {
    description: "Poussée horizontale guidée pour les pectoraux.",
    installation:
      "Règle le siège pour que les poignées arrivent à peu près à hauteur du "
      + "milieu de la poitrine, pas des épaules. C'est ce réglage qui décide de "
      + "tout le reste.",
    positionDepart:
      "Dos contre le dossier, omoplates rapprochées et basses, pieds au sol.",
    execution:
      "Pousse en avant sans verrouiller les coudes d'un coup. Reviens en "
      + "contrôlant jusqu'à sentir l'ouverture de la poitrine.",
    amplitude:
      "Reviens jusqu'à ce que les coudes arrivent au niveau du buste. Aller "
      + "plus loin tire sur l'avant de l'épaule sans rien ajouter aux pectoraux.",
    respiration: "Souffle en poussant, inspire au retour.",
    sensation: "Tu devrais surtout sentir la poitrine, et les triceps en fin de poussée.",
    pointsCles: ["Omoplates basses et serrées", "Poignées à hauteur de poitrine"],
    erreursFrequentes: [
      "Décoller les épaules du dossier pour pousser plus lourd",
      "Verrouiller les coudes d'un coup sec",
    ],
  },

  "incline-dumbbell-press": {
    description:
      "Poussée sur banc incliné avec haltères. L'inclinaison déplace le travail "
      + "vers le haut des pectoraux ; les haltères demandent de stabiliser.",
    installation:
      "Choisis une inclinaison modérée : plus le banc se redresse, plus les "
      + "épaules travaillent à la place de la poitrine. Assieds-toi haltères sur "
      + "les cuisses, puis allonge-toi en les accompagnant.",
    positionDepart:
      "Omoplates rapprochées et plaquées, cage ouverte, pieds au sol. Haltères "
      + "au-dessus de la poitrine, poignets dans l'axe des avant-bras.",
    execution:
      "Descends en contrôlant, coudes légèrement rentrés plutôt qu'à "
      + "l'équerre. Pousse en rapprochant les haltères sans les cogner.",
    amplitude:
      "Descends jusqu'à sentir l'étirement de la poitrine, sans forcer l'épaule "
      + "au-delà.",
    respiration: "Inspire à la descente, souffle à la poussée.",
    sensation: "Tu devrais surtout sentir le haut de la poitrine.",
    pointsCles: ["Omoplates plaquées", "Coudes légèrement rentrés", "Descente contrôlée"],
    erreursFrequentes: [
      "Décoller les épaules pour aller plus lourd",
      "Laisser tomber les haltères en fin de série plutôt que de les accompagner",
    ],
    securite:
      "Pour reposer les haltères, ramène-les sur les cuisses et redresse-toi "
      + "avec — ne les lâche pas sur les côtés.",
  },

  // -------------------------------------------------------------------------
  // P2 — tirage
  // -------------------------------------------------------------------------
  "seated-row": {
    description:
      "Tirage horizontal à la poulie. Le mouvement vient du dos ; les bras ne "
      + "font que transmettre.",
    installation:
      "Règle le siège et le cale-poitrine, quand il y en a un, pour que la "
      + "poignée arrive à peu près à hauteur du nombril bras tendus. Attrape la "
      + "poignée avant de te caler, pas en te penchant en avant charge en main.",
    positionDepart:
      "Buste droit, épaules basses, léger gainage. Bras tendus sans que les "
      + "épaules partent vers l'avant.",
    execution:
      "Tire en menant par les COUDES, vers l'arrière et près du corps. "
      + "Les mains suivent. Reviens en contrôlant, sans laisser la charge "
      + "ramener le buste.",
    amplitude:
      "Tire jusqu'à ce que les mains arrivent au niveau du ventre. Chercher "
      + "plus loin fait basculer le buste en arrière sans travailler davantage.",
    respiration: "Souffle en tirant, inspire au retour.",
    sensation:
      "Tu devrais surtout sentir le milieu du dos et l'arrière des épaules — "
      + "pas seulement les biceps.",
    pointsCles: [
      "Tirer par les coudes",
      "Épaules basses, pas remontées vers les oreilles",
      "Buste stable",
    ],
    erreursFrequentes: [
      "Balancer le buste d'avant en arrière pour lancer la charge",
      "Tirer avec les bras en laissant les épaules s'enrouler",
    ],
    /*
     * Ni montée ni descente : c'est un mouvement horizontal. « Descente »
     * n'aurait aucun sens, et « Montée » non plus. L'effort part vers
     * l'arrière, le retour va vers l'avant.
     */
    libellesPhasesTempo: {
      excentrique: "Laisse les bras revenir vers l'avant",
      concentrique: "Tire les coudes vers l'arrière",
      pause_contracte: "Tiens le dos contracté",
    },
  },

  "machine-row": {
    description: "Tirage horizontal guidé, buste soutenu.",
    installation:
      "Règle le siège pour que les poignées arrivent à peu près à hauteur du "
      + "bas de la poitrine, et le cale-poitrine de façon à ne pas avoir à "
      + "tendre le cou pour l'atteindre.",
    positionDepart: "Poitrine contre l'appui, épaules basses, bras tendus.",
    execution:
      "Tire par les coudes vers l'arrière, puis reviens en contrôlant jusqu'à "
      + "l'étirement.",
    amplitude:
      "Tire jusqu'à ce que les coudes dépassent la ligne du buste, pas au-delà.",
    respiration: "Souffle en tirant, inspire au retour.",
    sensation: "Tu devrais surtout sentir le milieu du dos et l'arrière des épaules.",
    pointsCles: ["Poitrine collée à l'appui", "Tirer par les coudes"],
    erreursFrequentes: ["Décoller la poitrine de l'appui pour tirer plus lourd"],
  },

  "lat-pulldown": {
    description:
      "Tirage vertical à la poulie haute, pour les grands dorsaux.",
    installation:
      "Règle le cale-cuisses pour que les cuisses soient maintenues sans être "
      + "écrasées : c'est lui qui t'empêche de décoller quand la charge monte. "
      + "Attrape la barre debout, puis assieds-toi — plutôt que de tendre le "
      + "bras vers le haut une fois assis.",
    positionDepart:
      "Buste droit ou très légèrement incliné en arrière, épaules basses, "
      + "poitrine ouverte.",
    execution:
      "Amène la barre vers le haut de la poitrine en menant par les coudes. "
      + "Remonte en contrôlant, en laissant les épaules s'étirer sans les "
      + "laisser s'enrouler.",
    amplitude:
      "Descends jusqu'au haut de la poitrine. Tirer derrière la nuque ne fait "
      + "que contraindre l'épaule.",
    respiration: "Souffle en tirant vers le bas, inspire à la remontée.",
    sensation: "Tu devrais surtout sentir les côtés du dos.",
    pointsCles: ["Épaules basses avant de tirer", "Coudes vers le bas, pas vers l'arrière"],
    erreursFrequentes: [
      "Se coucher en arrière pour tirer plus lourd",
      "Tirer la barre derrière la nuque",
    ],
  },

  "chin-up": {
    description:
      "Traction en supination : le dos travaille, les biceps aident franchement.",
    installation:
      "Sur une machine d'assistance, monte sur le repose-genoux ou la "
      + "plateforme APRÈS avoir saisi les poignées, et redescends de la même "
      + "façon en fin de série — la plateforme remonte quand on la quitte.",
    positionDepart:
      "Mains en supination, à peu près largeur d'épaules. Épaules basses avant "
      + "de commencer à tirer.",
    execution:
      "Tire en menant par les coudes vers le bas, poitrine vers la barre. "
      + "Redescends en contrôlant jusqu'aux bras tendus.",
    amplitude:
      "Monte jusqu'à ce que le menton dépasse la barre si l'épaule le permet, "
      + "descends bras tendus sans se laisser tomber.",
    respiration: "Souffle en montant, inspire en descendant.",
    sensation: "Tu devrais surtout sentir le dos, et les biceps en fin de montée.",
    pointsCles: ["Épaules basses avant de tirer", "Descente contrôlée"],
    erreursFrequentes: ["Se laisser tomber en fin de répétition", "Donner un coup de jambes"],
    securite:
      "Sur une machine d'assistance, le nombre affiché est une AIDE : plus il "
      + "est élevé, plus l'exercice est facile. Progresser, c'est en demander "
      + "moins pour le même nombre de répétitions.",
  },

  // -------------------------------------------------------------------------
  // Épaules
  // -------------------------------------------------------------------------
  "machine-shoulder-press": {
    description: "Poussée verticale guidée pour les épaules.",
    installation:
      "Règle le siège pour que les poignées partent à peu près à hauteur des "
      + "épaules, pas au-dessus de la tête.",
    positionDepart: "Dos contre le dossier, bas du dos sans creux exagéré, pieds au sol.",
    execution:
      "Pousse vers le haut sans verrouiller les coudes d'un coup, puis "
      + "redescends en contrôlant.",
    amplitude:
      "Descends jusqu'à ce que les coudes arrivent à peu près au niveau des "
      + "épaules. Plus bas contraint l'articulation sans rien ajouter.",
    respiration: "Souffle en poussant, inspire à la descente.",
    sensation: "Tu devrais surtout sentir le dessus des épaules, et les triceps en fin de poussée.",
    pointsCles: ["Dos en contact avec le dossier", "Pas de verrouillage sec"],
    erreursFrequentes: ["Cambrer le bas du dos pour pousser plus lourd"],
  },

  // -------------------------------------------------------------------------
  // Jambes — isolation
  // -------------------------------------------------------------------------
  "leg-extension": {
    description: "Extension du genou contre résistance, assis. Isolation des quadriceps.",
    installation:
      "Règle le dossier pour que l'arrière du genou touche le bord du siège, et "
      + "le rouleau pour qu'il repose sur le bas du tibia, au-dessus de la "
      + "cheville — pas sur le cou-de-pied.",
    positionDepart: "Dos plaqué, mains sur les poignées, chevilles sous le rouleau.",
    execution:
      "Tends les jambes en contrôlant, marque un instant en haut, puis "
      + "redescends sans laisser la charge tomber.",
    amplitude:
      "Va jusqu'à l'extension complète si le genou le permet, sans verrouiller "
      + "d'un coup sec.",
    respiration: "Souffle en tendant, inspire en revenant.",
    sensation: "Tu devrais surtout sentir le dessus des cuisses.",
    pointsCles: ["Bassin qui ne décolle pas", "Retour freiné"],
    erreursFrequentes: ["Lancer la charge et la laisser retomber"],
  },

  "leg-curl": {
    description: "Flexion du genou contre résistance. Isolation des ischio-jambiers.",
    installation:
      "Règle l'appareil pour que l'axe du genou soit aligné avec l'axe de "
      + "rotation de la machine, et le rouleau pour qu'il repose juste au-dessus "
      + "du talon.",
    positionDepart: "Bassin stable, mains sur les poignées, jambes tendues sans verrouiller.",
    execution: "Fléchis en contrôlant, puis reviens sans laisser la charge tirer.",
    amplitude: "Fléchis autant que le bassin reste en place.",
    respiration: "Souffle en fléchissant, inspire au retour.",
    sensation: "Tu devrais surtout sentir l'arrière des cuisses.",
    pointsCles: ["Bassin qui ne décolle pas", "Retour freiné"],
    erreursFrequentes: ["Décoller le bassin pour aller plus loin"],
  },

  // -------------------------------------------------------------------------
  // Bras — triceps
  // -------------------------------------------------------------------------
  dip: {
    description:
      "Descente et remontée sur barres parallèles, en soutenant son propre "
      + "poids. Triceps et bas de la poitrine.",
    installation:
      "Sur une machine d'assistance, règle l'aide AVANT de monter, saisis les "
      + "poignées, puis pose les genoux ou les pieds sur l'appui. Pour sortir : "
      + "repose d'abord les pieds au sol, puis lâche les poignées — l'appui "
      + "remonte dès qu'on le quitte.",
    positionDepart:
      "Bras tendus sans verrouiller, épaules basses, buste légèrement incliné "
      + "vers l'avant.",
    execution:
      "Descends en contrôlant, coudes vers l'arrière plutôt qu'écartés. Remonte "
      + "en poussant sans à-coup.",
    amplitude:
      "Descends jusqu'à ce que les bras forment à peu près un angle droit, et "
      + "pas plus bas si l'épaule tire. La profondeur n'est pas l'objectif.",
    respiration: "Inspire en descendant, souffle en remontant.",
    sensation: "Tu devrais surtout sentir l'arrière des bras, et le bas de la poitrine.",
    pointsCles: ["Épaules basses", "Descente contrôlée", "Coudes vers l'arrière"],
    erreursFrequentes: [
      "Descendre le plus bas possible sans écouter l'épaule",
      "Se laisser tomber puis rebondir",
    ],
    securite:
      "Sur une machine d'assistance, le nombre affiché est une AIDE : plus il "
      + "est élevé, plus l'exercice est facile. Progresser, c'est en demander "
      + "moins à effort et répétitions comparables — pas afficher plus.",
  },

  "rope-tricep-pushdown": {
    description: "Extension des coudes à la poulie haute, à la corde.",
    installation:
      "Accroche la corde à la poulie haute et place-toi à un pas de la machine, "
      + "assez près pour que le câble reste vertical au départ.",
    positionDepart:
      "Buste légèrement penché, gainé, coudes le long du corps.",
    execution:
      "Tends les coudes sans que ceux-ci avancent ni reculent. Reviens en "
      + "contrôlant jusqu'à l'angle droit.",
    amplitude: "Va jusqu'à l'extension complète, reviens sans laisser la charge tirer l'épaule.",
    respiration: "Souffle en tendant, inspire au retour.",
    sensation: "Tu devrais surtout sentir l'arrière des bras.",
    pointsCles: ["Coudes fixes le long du corps", "Buste immobile"],
    erreursFrequentes: ["Pousser avec tout le corps quand la charge devient lourde"],
  },

  // -------------------------------------------------------------------------
  // Bras — biceps
  // -------------------------------------------------------------------------
  "rope-hammer-curl": {
    description:
      "Flexion des coudes à la poulie basse, prise neutre. Biceps, brachial et "
      + "avant-bras.",
    installation:
      "Accroche la corde à la poulie BASSE et place-toi assez près pour que le "
      + "câble ne tire pas les bras vers l'avant en position basse.",
    positionDepart:
      "Debout, gainé, coudes le long du corps, paumes qui se font face.",
    execution:
      "Fléchis les coudes sans les décoller du corps ni reculer. Reviens en "
      + "contrôlant jusqu'aux bras presque tendus.",
    amplitude:
      "Monte jusqu'à ce que les avant-bras arrivent à peu près à la verticale ; "
      + "au-delà, ce sont les épaules qui prennent le relais.",
    respiration: "Souffle en montant, inspire en descendant.",
    sensation: "Tu devrais surtout sentir l'avant du bras et le dessus de l'avant-bras.",
    pointsCles: ["Coudes près du corps", "Prise neutre tenue jusqu'en haut", "Retour freiné"],
    erreursFrequentes: [
      "Reculer d'un pas pour donner de l'élan",
      "Balancer le buste en fin de série",
    ],
    libellesPhasesTempo: {
      excentrique: "Redescends les mains",
      pause_etire: "Garde les bras presque tendus",
      concentrique: "Remonte les mains",
      pause_contracte: "Garde les biceps contractés",
    },
  },

  "hammer-curl": {
    description: "Flexion des coudes aux haltères, prise neutre.",
    positionDepart:
      "Debout ou assis, gainé, bras le long du corps, paumes qui se font face.",
    execution:
      "Fléchis un bras ou les deux sans décoller les coudes. Reviens en "
      + "contrôlant.",
    amplitude: "Monte jusqu'à la verticale de l'avant-bras, descends bras presque tendus.",
    respiration: "Souffle en montant, inspire en descendant.",
    sensation: "Tu devrais surtout sentir l'avant du bras et le dessus de l'avant-bras.",
    pointsCles: ["Coudes fixes", "Prise neutre tenue"],
    erreursFrequentes: ["Balancer le buste pour lancer l'haltère"],
    libellesPhasesTempo: {
      excentrique: "Redescends les haltères",
      pause_etire: "Garde les bras presque tendus",
      concentrique: "Remonte les haltères",
      pause_contracte: "Garde les biceps contractés",
    },
  },

  // -------------------------------------------------------------------------
  // Core
  // -------------------------------------------------------------------------
  "cable-crunch": {
    description:
      "Flexion du tronc à la poulie haute, à genoux. Le mouvement vient des "
      + "abdominaux, pas des bras.",
    installation:
      "Accroche la corde à la poulie haute, saisis-la, puis recule d'un pas et "
      + "mets-toi à genoux face à la machine ou dos à elle. Garde la corde "
      + "près de la tête, aux tempes ou au front — c'est la position qui rend "
      + "le reste possible.",
    positionDepart:
      "À genoux, bassin relativement stable, hanches à peu près fixes, buste "
      + "droit et légèrement en avant sous la traction du câble.",
    execution:
      "Enroule le buste vers le bas en rapprochant les côtes du bassin. Les "
      + "bras ne tirent pas : ils tiennent la corde en place. Reviens en "
      + "déroulant, en contrôlant la remontée.",
    amplitude:
      "Enroule autant que les abdominaux le font, pas autant que le câble le "
      + "permet. Le bassin qui bascule marque la fin du mouvement utile.",
    respiration: "Souffle en enroulant, inspire en revenant.",
    sensation: "Tu devrais surtout sentir les abdominaux se contracter, pas les bras tirer.",
    pointsCles: [
      "Corde près de la tête, sans bouger",
      "Flexion du tronc, pas traction des bras",
      "Bassin à peu près fixe",
    ],
    erreursFrequentes: [
      "Tirer la corde vers le bas avec les bras en gardant le dos droit",
      "S'asseoir sur les talons à chaque répétition plutôt que d'enrouler",
    ],
    securite:
      "Ce mouvement demande de la coordination et se fait à genoux au milieu du "
      + "passage. S'il reste inconfortable, un exercice de gainage ou une "
      + "machine à abdominaux fait le même travail — la substitution est là "
      + "pour ça.",
    /*
     * LE CAS QUI RENVERSE TOUT. L'effort produit descend — on enroule le buste
     * vers le bas — et c'est le retour qui remonte. Un libellé « Descente » sur
     * l'excentrique apprendrait ici l'exact contraire du geste.
     */
    libellesPhasesTempo: {
      excentrique: "Retour vers le haut",
      concentrique: "Enroule le buste vers le bas",
      pause_contracte: "Tiens la contraction en bas",
    },
  },
};

/**
 * Tempos propres à un mouvement, par slug.
 *
 * DÉLIBÉRÉMENT COURT. `tempoEffectif` applique déjà une politique canonique
 * quand rien de plus précis n'existe, et l'écran l'annonce comme un « repère
 * général ». Remplir cent vingt tempos pour faire disparaître des `null`
 * transformerait cette honnêteté en fausse prescription : un `3-1-1-0` posé
 * par défaut sur chaque exercice se lirait comme une consigne réfléchie.
 *
 * N'entrent donc ici que les mouvements où le tempo dit vraiment quelque chose
 * que la famille — polyarticulaire ou isolation — ne dit pas déjà. Trois cas,
 * et chacun a sa raison écrite.
 */
export const TEMPOS_PAR_DEFAUT: Record<string, string> = {
  /*
   * 3 s de descente · 1 s de pause en bas · 1 s de remontée · pas de pause en
   * haut. La pause étirée est le sujet : c'est le rebond en position basse
   * qu'on cherche à supprimer, et le retour terrain du 6 septembre le nommait.
   */
  "hack-squat": "3-1-1-0",
  /*
   * 2 s pour laisser les bras revenir vers l'avant · aucune pause étirée · 1 s
   * pour tirer les coudes en arrière · 1 s de dos contracté. C'est cette
   * dernière seconde qui empêche le balancier, l'erreur fréquente de
   * l'exercice — et elle porte bien sur le QUATRIÈME chiffre.
   */
  "seated-row": "2-0-1-1",
  /*
   * 3 s pour le retour vers le haut · aucune pause étirée · 1 s pour enrouler
   * le buste vers le bas · 1 s de contraction tenue en bas.
   *
   * Le premier chiffre est bien l'EXCENTRIQUE, qui remonte ici : dire
   * « descente longue » serait faux à l'envers. C'est le freinage du retour
   * qui est long, et l'enroulement qui est court.
   */
  "cable-crunch": "3-0-1-1",
};
