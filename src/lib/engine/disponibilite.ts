import type { Equipement } from "@/lib/referentiels/equipements";

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

export interface ExerciceDuCatalogue {
  id: string;
  nom: string;
  pilier: string;
  categorieRole: string;
  musclesPrincipaux: string[];
  equipement: string | null;
}

export interface InstanceDeclaree {
  id: string;
  exerciseId: string;
  machineNom: string;
  incrementsPossibles: number[];
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
  equipementRequis: string | null,
  equipementsDuLieu: readonly string[],
): boolean {
  if (!equipementRequis) return true;
  if (equipementRequis === "poids_du_corps") return true;
  return equipementsDuLieu.includes(equipementRequis);
}

export interface EntreeDisponibilite {
  catalogue: ExerciceDuCatalogue[];
  /** Types de matériel déclarés présents sur le lieu. */
  equipementsDuLieu: readonly string[];
  /** Appareils précis décrits dans ce lieu. */
  instances: InstanceDeclaree[];
  /** Matériel personnel apporté aujourd'hui, ajouté à celui du lieu. */
  equipementsApportes?: readonly string[];
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
  const parExercice = new Map<string, InstanceDeclaree>();
  for (const i of e.instances) {
    if (!parExercice.has(i.exerciseId)) parExercice.set(i.exerciseId, i);
  }

  const realisables: ExerciceRealisable[] = [];
  for (const ex of e.catalogue) {
    const instance = parExercice.get(ex.id);
    // Un appareil décrit vaut déclaration de présence : il est là, on l'a vu.
    if (!instance && !besoinCouvert(ex.equipement, [...dispo])) continue;

    realisables.push({
      exerciceId: ex.id,
      nom: ex.nom,
      pilier: ex.pilier,
      categorieRole: ex.categorieRole,
      musclesPrincipaux: ex.musclesPrincipaux ?? [],
      equipement: ex.equipement,
      origine: instance ? "instance" : "materiel",
      instanceId: instance?.id ?? null,
      incrementsPossibles: instance?.incrementsPossibles?.length
        ? instance.incrementsPossibles
        : incrementsParDefaut(ex.equipement),
    });
  }
  return realisables;
}

/** Combien d'exercices chaque type de matériel débloquerait ici, en plus. */
export function apportDeChaqueEquipement(
  catalogue: ExerciceDuCatalogue[],
  equipementsDuLieu: readonly string[],
): Array<{ equipement: Equipement; exercicesEnPlus: number }> {
  const presents = new Set(equipementsDuLieu);
  const compte = new Map<string, number>();
  for (const ex of catalogue) {
    if (!ex.equipement || ex.equipement === "poids_du_corps") continue;
    if (presents.has(ex.equipement)) continue;
    compte.set(ex.equipement, (compte.get(ex.equipement) ?? 0) + 1);
  }
  return [...compte.entries()]
    .map(([equipement, exercicesEnPlus]) => ({ equipement: equipement as Equipement, exercicesEnPlus }))
    .sort((a, b) => b.exercicesEnPlus - a.exercicesEnPlus);
}
