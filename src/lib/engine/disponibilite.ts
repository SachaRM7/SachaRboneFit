import type { Equipement } from "@/lib/referentiels/equipements";
import { besoinDe } from "@/lib/referentiels/capacites";

/**
 * Ce qu'un lieu permet de faire.
 *
 * Jusqu'ici, un exercice n'était réalisable quelque part que si une ligne
 * `exercise_instances` le déclarait — une par exercice et par salle. Déclarer
 * une salle demandait donc de saisir à la main chaque mouvement qu'on peut y
 * faire, y compris les pompes et le gainage. Le référentiel des équipements
 * existait déjà pour répondre autrement à « cet exercice est-il faisable
 * ici ? », mais rien ne s'en servait : il était écrit et jamais lu.
 *
 * Le modèle tenu ici sépare trois choses qui étaient confondues :
 *
 *   l'EXERCICE dit ce dont il a besoin      (une barre, des haltères, rien)
 *   le LIEU dit ce dont il dispose          (barres, haltères, une poulie…)
 *   l'INSTANCE décrit un appareil précis    (incréments, convention, réglages)
 *
 * Un exercice est réalisable ici si le lieu couvre son besoin. L'instance
 * n'est plus la condition d'existence : elle devient la description fine d'un
 * appareil qu'on charge.
 *
 * C'est cette distinction qui permet à « Maison » d'être un lieu comme un
 * autre — poids du corps et élastiques — plutôt qu'une deuxième bibliothèque
 * d'exercices à maintenir en parallèle.
 *
 * Ce que l'instance garde et qu'aucune liste de matériel ne remplace : les
 * sauts de charge réels, la convention d'affichage, le poids non compté d'une
 * plateforme, le plafond de la pile. Sans eux, aucune charge ne peut être
 * prescrite. Les deux mécanismes coexistent donc, ils ne se remplacent pas.
 */

/** Matériel qu'on transporte : il s'ajoute à celui du lieu. */
export const EQUIPEMENTS_PORTABLES: Equipement[] = ["poids_du_corps"];

/**
 * Ce qu'on sait d'un lieu, et ce que cette connaissance autorise.
 *
 * Les deux voies vers la faisabilité — un appareil décrit, une famille de
 * matériel cochée — étaient alternatives et de rang égal. Cocher « Poulie »
 * suffisait donc à rendre faisables les vingt-trois exercices à la poulie du
 * catalogue, y compris dans une salle dont chaque appareil avait été relevé un
 * par un. L'inventaire précis était complété par de la déduction, sans que
 * rien ne le signale.
 *
 * Ce statut n'est jamais calculé. Un seuil sur le nombre d'instances serait
 * arbitraire ; « dès qu'une instance existe » punirait la première saisie.
 * Quelqu'un déclare, ou personne ne déclare rien.
 */
export const STATUTS_INVENTAIRE = ["inconnu", "partiel", "complet"] as const;
export type StatutInventaire = (typeof STATUTS_INVENTAIRE)[number];

export const LIBELLES_STATUT_INVENTAIRE: Record<StatutInventaire, string> = {
  inconnu: "Inventaire non renseigné",
  partiel: "Inventaire incomplet",
  complet: "Inventaire complet",
};

export const EXPLICATIONS_STATUT_INVENTAIRE: Record<StatutInventaire, string> = {
  inconnu:
    "Rien de fiable n'est encore su de ce lieu. Le matériel coché suffit à "
    + "rendre des exercices proposables.",
  partiel:
    "Certains appareils sont décrits. Ils priment, et le matériel coché "
    + "complète encore — des exercices peuvent donc être proposés sur du "
    + "matériel supposé.",
  complet:
    "L'inventaire a été validé. Un exercice qui demande un appareil n'est "
    + "proposé que si cet appareil est décrit ici : plus rien n'est déduit.",
};

export function estUnStatutInventaire(v: string | null | undefined): v is StatutInventaire {
  return v === "inconnu" || v === "partiel" || v === "complet";
}

/** Ce que porte la base : `null` et valeur inconnue valent `inconnu`. */
export function statutInventaire(v: string | null | undefined): StatutInventaire {
  return estUnStatutInventaire(v) ? v : "inconnu";
}

/**
 * Une famille de matériel peut-elle, à elle seule, rendre un exercice faisable ?
 *
 * Non sur un inventaire complet : c'est tout l'objet du statut. Le lieu a été
 * parcouru, ce qui n'y est pas décrit n'y est pas.
 */
export function deductionPermise(statut: StatutInventaire): boolean {
  return statut !== "complet";
}

/**
 * Cet exercice a-t-il besoin d'un APPAREIL, au sens de ce statut ?
 *
 * Un mouvement sans besoin déclaré, ou qui ne demande que le poids du corps,
 * ne dépend d'aucun appareil : une pompe reste faisable dans une salle
 * complète comme ailleurs. Ce sont les autres — barre, haltères, poulie, et
 * chaque capacité nommée, barre de traction comprise — dont l'absence de
 * l'inventaire devient une absence tout court.
 */
export function exigeUnAppareil(besoin: string | null): boolean {
  return besoin !== null && besoin !== "poids_du_corps";
}

export interface ExerciceDuCatalogue {
  id: string;
  nom: string;
  pilier: string;
  categorieRole: string;
  musclesPrincipaux: string[];
  equipement: string | null;
  /** Sert à retrouver l'appareil précis quand la famille ne suffit pas. */
  slug?: string | null;
}

export interface InstanceDeclaree {
  id: string;
  exerciseId: string;
  machineNom: string;
  incrementsPossibles: number[] | null;
}

export interface ExerciceRealisable {
  exerciceId: string;
  nom: string;
  pilier: string;
  categorieRole: string;
  musclesPrincipaux: string[];
  equipement: string | null;
  /**
   * `instance` : un appareil précis est décrit, avec ses incréments réels.
   * `materiel` : le lieu possède le nécessaire, sans appareil identifié.
   */
  origine: "instance" | "materiel";
  instanceId: string | null;
  incrementsPossibles: number[];
}

/**
 * Sauts de charge par défaut, quand aucun appareil n'a été décrit.
 *
 * Ce sont des valeurs de repli, pas une vérité : une salle a rarement des
 * haltères de 2 kg en 2 kg sur toute la gamme. Elles permettent de commencer,
 * et la première correction sur place les remplace.
 */
export const INCREMENTS_PAR_DEFAUT: Record<Equipement, number[]> = {
  barre: [1.25, 2.5, 5],
  halteres: [2],
  machine: [5],
  poulie: [2.5, 5],
  poids_du_corps: [1],
  kettlebell: [4],
  disque: [1.25, 2.5, 5],
};

export function incrementsParDefaut(equipement: string | null): number[] {
  if (!equipement) return [2.5];
  return INCREMENTS_PAR_DEFAUT[equipement as Equipement] ?? [2.5];
}

/**
 * Le lieu couvre-t-il le besoin de cet exercice ?
 *
 * Un exercice sans besoin déclaré reste réalisable partout : refuser faute
 * d'information reviendrait à punir une donnée manquante.
 */
export function besoinCouvert(
  besoinRequis: string | null,
  equipementsDuLieu: readonly string[],
): boolean {
  if (!besoinRequis) return true;
  if (besoinRequis === "poids_du_corps") return true;
  return equipementsDuLieu.includes(besoinRequis);
}

export interface EntreeDisponibilite {
  catalogue: ExerciceDuCatalogue[];
  /** Types de matériel déclarés présents sur le lieu. */
  equipementsDuLieu: readonly string[];
  /** Appareils précis décrits dans ce lieu. */
  instances: InstanceDeclaree[];
  /** Matériel personnel apporté aujourd'hui, ajouté à celui du lieu. */
  equipementsApportes?: readonly string[];
  /**
   * Ce qu'on sait de ce lieu. Absent vaut `inconnu` — donc le comportement
   * historique, pour tout appelant qui ne s'est pas encore prononcé.
   */
  statut?: StatutInventaire;
}

/**
 * Les exercices faisables ici, une entrée par exercice.
 *
 * Un appareil décrit l'emporte sur la déduction : ses incréments sont mesurés,
 * pas supposés. Quand plusieurs appareils portent le même exercice, le premier
 * dans l'ordre reçu est retenu — la résolution fine, elle, appartient à
 * `resolution-salle`.
 */
export function exercicesRealisables(e: EntreeDisponibilite): ExerciceRealisable[] {
  const dispo = new Set<string>([...e.equipementsDuLieu, ...(e.equipementsApportes ?? [])]);
  const statut = e.statut ?? "inconnu";
  const parExercice = new Map<string, InstanceDeclaree>();
  for (const i of e.instances) {
    if (!parExercice.has(i.exerciseId)) parExercice.set(i.exerciseId, i);
  }

  const realisables: ExerciceRealisable[] = [];
  for (const ex of e.catalogue) {
    const instance = parExercice.get(ex.id);
    // « machine » recouvre quinze appareils différents : une seule case aurait
    // rendu faisable un leg curl absent parce qu'on a vu une presse. Quand
    // l'appareil précis est connu, c'est lui qui est exigé.
    const besoin = besoinDe(ex.slug, ex.equipement);

    // Un appareil décrit vaut déclaration de présence : il est là, on l'a vu.
    // C'est la voie qui ne dépend d'aucun statut.
    if (!instance) {
      // Sur un inventaire complet, la famille cochée ne supplée plus l'appareil
      // absent. Le poids du corps et les exercices sans besoin déclaré ne sont
      // pas concernés : rien à décrire, donc rien à ne pas trouver.
      if (!deductionPermise(statut) && exigeUnAppareil(besoin)) continue;
      if (!besoinCouvert(besoin, [...dispo])) continue;
    }

    realisables.push({
      exerciceId: ex.id,
      nom: ex.nom,
      pilier: ex.pilier,
      categorieRole: ex.categorieRole,
      musclesPrincipaux: ex.musclesPrincipaux ?? [],
      equipement: ex.equipement,
      origine: instance ? "instance" : "materiel",
      instanceId: instance?.id ?? null,
      // Une instance précise avec des incréments inconnus doit rester muette :
      // le repli générique ne vaut que pour une déduction de matériel. Sinon
      // déclarer honnêtement `NULL` recréerait aussitôt un pas inventé.
      incrementsPossibles: instance
        ? (instance.incrementsPossibles?.length ? instance.incrementsPossibles : [])
        : incrementsParDefaut(ex.equipement),
    });
  }
  return realisables;
}

/** Combien d'exercices chaque type de matériel débloquerait ici, en plus. */
export function apportDeChaqueEquipement(
  catalogue: ExerciceDuCatalogue[],
  equipementsDuLieu: readonly string[],
): Array<{ equipement: string; exercicesEnPlus: number }> {
  const presents = new Set(equipementsDuLieu);
  const compte = new Map<string, number>();
  for (const ex of catalogue) {
    const besoin = besoinDe(ex.slug, ex.equipement);
    if (!besoin || besoin === "poids_du_corps") continue;
    if (presents.has(besoin)) continue;
    compte.set(besoin, (compte.get(besoin) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([equipement, exercicesEnPlus]) => ({ equipement, exercicesEnPlus }))
    .sort((a, b) => b.exercicesEnPlus - a.exercicesEnPlus || a.equipement.localeCompare(b.equipement));
}
