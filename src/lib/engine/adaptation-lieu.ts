/**
 * Adapter une séance déjà construite à un autre lieu, ou à un autre matériel.
 *
 * Le cas réel : la séance du jour est prête, et on ne peut finalement pas aller
 * à la salle. Reconstruire depuis zéro serait le geste facile et le mauvais :
 * la séance porte une intention — ces muscles-là, ce volume-là, à ce moment du
 * cycle — et cette intention ne dépend pas du lieu. Ce qui dépend du lieu, ce
 * sont les mouvements par lesquels on l'exécute.
 *
 * La règle tenue ici : on ne touche qu'à ce qui est devenu impossible. Tout
 * exercice encore réalisable est conservé tel quel, avec ses séries, sa
 * fourchette de répétitions, son RIR et son repos. Un remplaçant hérite de
 * cette prescription plutôt que d'en recevoir une nouvelle : c'est le même
 * travail, fait autrement.
 *
 * Quand aucun remplaçant honnête n'existe pour une part suffisante de la
 * séance, on ne bricole pas : on le dit, et on propose de reconstruire.
 */

/** Fidélité du remplacement, de la plus haute à la plus basse. */
export type NiveauFidelite =
  | "conserve"          // toujours réalisable ici : rien n'a changé
  | "meme_exercice"     // le même mouvement, sur un autre appareil
  | "profil_identique"  // même pilier, même profil de tension, mêmes muscles
  | "meme_muscle"       // mêmes muscles, profil de tension différent
  | "meme_pilier"       // même pilier seulement : le stimulus se déplace
  | "indisponible";

export interface ExerciceEnPlace {
  planItemId: string;
  instanceId: string;
  exerciceId: string;
  ordre: number;
  nom: string;
  pilier: string;
  profilTension: string;
  categorieRole: string;
  musclesPrincipaux: string[];
  /** L'intention prescrite, qui doit survivre au changement de lieu. */
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number | null;
  reposSecondes: number | null;
  /**
   * Ce qui était prévu avant une adaptation précédente, s'il y en a eu une.
   *
   * Sans cette mémoire, revenir à la salle après une séance à la maison
   * laissait les pompes en place : elles restent faisables partout, donc rien
   * ne forçait le retour au développé. L'intention d'origine se perdait à
   * chaque aller-retour.
   */
  origineInstanceId?: string | null;
  origineExerciceId?: string | null;
  origineNom?: string | null;
}

export interface CandidatDisponible {
  exerciceId: string;
  /** `null` quand l'exercice est déduit du matériel et n'a pas encore d'entrée. */
  instanceId: string | null;
  nom: string;
  pilier: string;
  profilTension: string;
  categorieRole: string;
  musclesPrincipaux: string[];
  incrementsPossibles: number[];
}

export interface ExerciceAdapte {
  planItemId: string;
  exerciceId: string;
  instanceId: string | null;
  nom: string;
  ordre: number;
  niveau: NiveauFidelite;
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number | null;
  reposSecondes: number | null;
}

export interface Remplacement {
  planItemId: string;
  avant: string;
  apres: string;
  niveau: NiveauFidelite;
  raison: string;
}

export interface Retrait {
  planItemId: string;
  nom: string;
  raison: string;
}

export interface ResultatAdaptation {
  exercices: ExerciceAdapte[];
  conserves: number;
  remplacements: Remplacement[];
  retires: Retrait[];
  /** Vrai quand rapiécer ne suffit plus et qu'il vaut mieux reconstruire. */
  reconstructionConseillee: boolean;
  motifReconstruction: string | null;
}

const LIBELLE_NIVEAU: Record<Exclude<NiveauFidelite, "conserve" | "indisponible">, string> = {
  meme_exercice: "même exercice, matériel différent ici",
  profil_identique: "mêmes muscles et même profil de tension",
  meme_muscle: "mêmes muscles, angle de travail différent",
  meme_pilier: "même pilier, muscles proches",
};

/**
 * Part de la séance qu'on accepte de perdre avant de proposer de reconstruire.
 * Au-delà, ce qui reste n'est plus la séance prévue : le dire vaut mieux que
 * de livrer un reliquat en prétendant l'avoir adaptée.
 */
export const PART_PERDUE_TOLEREE = 1 / 3;

const communs = (a: string[], b: string[]) => a.filter((m) => b.includes(m)).length;

/** Ressemblance des muscles visés, entre 0 et 1. */
function recouvrementMuscles(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const union = new Set([...a, ...b]).size;
  return communs(a, b) / union;
}

function niveauDe(prevu: ExerciceEnPlace, candidat: CandidatDisponible): NiveauFidelite {
  if (candidat.exerciceId === prevu.exerciceId) return "meme_exercice";
  const memesMuscles = communs(prevu.musclesPrincipaux, candidat.musclesPrincipaux) > 0;
  if (memesMuscles && candidat.pilier === prevu.pilier && candidat.profilTension === prevu.profilTension) {
    return "profil_identique";
  }
  if (memesMuscles) return "meme_muscle";
  if (candidat.pilier === prevu.pilier) return "meme_pilier";
  return "indisponible";
}

const RANG: Record<NiveauFidelite, number> = {
  conserve: 0,
  meme_exercice: 1,
  profil_identique: 2,
  meme_muscle: 3,
  meme_pilier: 4,
  indisponible: 9,
};

export interface EntreeAdaptation {
  seance: ExerciceEnPlace[];
  /** Ce que le lieu du jour permet, matériel apporté compris. */
  disponibles: CandidatDisponible[];
}

export function adapterSeance(e: EntreeAdaptation): ResultatAdaptation {
  const parExercice = new Map<string, CandidatDisponible>();
  for (const c of e.disponibles) {
    if (!parExercice.has(c.exerciceId)) parExercice.set(c.exerciceId, c);
  }

  const exercices: ExerciceAdapte[] = [];
  const remplacements: Remplacement[] = [];
  const retires: Retrait[] = [];
  // Deux lignes de la séance ne doivent pas converger vers le même remplaçant :
  // on aurait remplacé un manque par un doublon.
  const dejaUtilises = new Set<string>();

  const garder = (
    prevu: ExerciceEnPlace,
    exerciceId: string,
    instanceId: string | null,
    nom: string,
    niveau: NiveauFidelite,
  ) => {
    dejaUtilises.add(exerciceId);
    exercices.push({
      planItemId: prevu.planItemId,
      exerciceId,
      instanceId,
      nom,
      ordre: prevu.ordre,
      niveau,
      // La prescription est transmise telle quelle : c'est le même travail,
      // fait autrement. La recalculer reviendrait à changer la séance.
      seriesCibles: prevu.seriesCibles,
      fourchetteRepsMin: prevu.fourchetteRepsMin,
      fourchetteRepsMax: prevu.fourchetteRepsMax,
      rpeCible: prevu.rpeCible,
      reposSecondes: prevu.reposSecondes,
    });
  };

  for (const prevu of [...e.seance].sort((a, b) => a.ordre - b.ordre)) {
    const memeExercice = parExercice.get(prevu.exerciceId);

    // Toujours réalisable ici, sur le même appareil : on n'y touche pas.
    if (memeExercice && memeExercice.instanceId === prevu.instanceId) {
      garder(prevu, prevu.exerciceId, prevu.instanceId, prevu.nom, "conserve");
      continue;
    }

    // Cette ligne avait déjà été remplacée, et l'exercice d'origine redevient
    // possible ici : on le rend plutôt que de garder son pis-aller. C'est le
    // retour à la salle après une séance à la maison.
    const origine = prevu.origineExerciceId
      ? e.disponibles.find(
          (c) => c.exerciceId === prevu.origineExerciceId && !dejaUtilises.has(c.exerciceId),
        )
      : undefined;
    if (origine) {
      garder(prevu, origine.exerciceId, origine.instanceId, origine.nom, "meme_exercice");
      remplacements.push({
        planItemId: prevu.planItemId,
        avant: prevu.nom,
        apres: origine.nom,
        niveau: "meme_exercice",
        raison: "de nouveau possible ici",
      });
      continue;
    }

    const candidats = e.disponibles
      .filter((c) => !dejaUtilises.has(c.exerciceId))
      .map((c) => ({ c, niveau: niveauDe(prevu, c) }))
      .filter((x) => x.niveau !== "indisponible")
      .sort((x, y) => {
        if (RANG[x.niveau] !== RANG[y.niveau]) return RANG[x.niveau] - RANG[y.niveau];
        // À fidélité égale, le rôle prime : un pilier ne se remplace pas par un
        // accessoire tant qu'un pilier existe.
        const roleX = x.c.categorieRole === prevu.categorieRole ? 0 : 1;
        const roleY = y.c.categorieRole === prevu.categorieRole ? 0 : 1;
        if (roleX !== roleY) return roleX - roleY;
        const musclesX = recouvrementMuscles(prevu.musclesPrincipaux, x.c.musclesPrincipaux);
        const musclesY = recouvrementMuscles(prevu.musclesPrincipaux, y.c.musclesPrincipaux);
        if (musclesX !== musclesY) return musclesY - musclesX;
        // Un appareil décrit l'emporte : ses incréments sont mesurés.
        const decritX = x.c.instanceId ? 0 : 1;
        const decritY = y.c.instanceId ? 0 : 1;
        if (decritX !== decritY) return decritX - decritY;
        return x.c.nom.localeCompare(y.c.nom);
      });

    const retenu = candidats[0];
    if (!retenu) {
      retires.push({
        planItemId: prevu.planItemId,
        nom: prevu.nom,
        raison: "Rien d'équivalent ici",
      });
      continue;
    }

    garder(prevu, retenu.c.exerciceId, retenu.c.instanceId, retenu.c.nom, retenu.niveau);
    remplacements.push({
      planItemId: prevu.planItemId,
      avant: prevu.nom,
      apres: retenu.c.nom,
      niveau: retenu.niveau,
      raison: LIBELLE_NIVEAU[retenu.niveau as keyof typeof LIBELLE_NIVEAU],
    });
  }

  const total = e.seance.length;
  const conserves = exercices.filter((x) => x.niveau === "conserve").length;
  // Deux façons de constater qu'on ne rapièce plus : trop d'exercices perdus,
  // ou un pilier entier qui disparaît de la séance.
  const piliersPrevus = new Set(e.seance.map((s) => s.pilier));
  const parPlanItem = new Map(e.seance.map((s) => [s.planItemId, s]));
  const piliersTenus = new Set(
    exercices.map((x) => parPlanItem.get(x.planItemId)!.pilier),
  );
  const piliersPerdus = [...piliersPrevus].filter((p) => !piliersTenus.has(p));

  // Les deux motifs se cumulent : n'en garder qu'un masquerait le plus
  // instructif des deux, qui n'est pas toujours le premier rencontré.
  const motifs: string[] = [];
  if (total > 0 && retires.length / total > PART_PERDUE_TOLEREE) {
    motifs.push(`${retires.length} exercice${retires.length > 1 ? "s" : ""} sur ${total} sans équivalent ici.`);
  }
  if (piliersPerdus.length > 0) {
    motifs.push(`Plus rien ne travaille : ${piliersPerdus.join(", ")}.`);
  }
  const motifReconstruction = motifs.length > 0 ? motifs.join(" ") : null;

  return {
    exercices,
    conserves,
    remplacements,
    retires,
    reconstructionConseillee: motifReconstruction !== null,
    motifReconstruction,
  };
}
