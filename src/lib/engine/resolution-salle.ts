import { memeMuscle } from "@/lib/referentiels/muscles";

/**
 * Resolution d'un exercice programme vers la salle du jour.
 *
 * Le principe fondateur du produit est : ne jamais proposer un exercice dont le
 * materiel n'existe pas dans la salle selectionnee, sauf a proposer une
 * alternative compatible. Il n'etait applique nulle part, et l'architecture le
 * rendait impossible : `exercise_in_template` pointe vers une exercise_instance,
 * c'est-a-dire vers UNE MACHINE D'UNE SALLE PRECISE. Un template n'etait donc pas
 * "une seance" mais "une seance a Lalande". Aller ailleurs proposait quand meme
 * les machines de Lalande, sous leurs noms de Lalande.
 *
 * Ce module fait le pont : a partir de l'exercice prevu, il retrouve son
 * equivalent dans la salle du jour, par ordre de fidelite decroissante.
 */

export interface InstanceResolvable {
  id: string;
  gymId: string;
  exerciseId: string;
  machineNom: string;
  /** Caracteristiques de l'exercice porte par l'instance. */
  exerciceNom: string;
  pilier: string;
  profilTension: string;
  categorieRole: "pilier" | "substitut" | "accessoire";
  musclesPrincipaux: string[];
  equipement: string | null;
  /** Sauts de charge reels de cette machine, pour la double progression. */
  incrementsPossibles: number[];
}

export type NiveauResolution =
  | "identique"          // meme exercice, meme salle : rien a faire
  | "meme_exercice"      // meme exercice, machine differente
  | "profil_identique"   // meme pilier ET meme profil de tension
  | "meme_pilier"        // meme pilier, profil different
  | "indisponible";      // rien de compatible dans cette salle

export interface ResolutionSalle {
  niveau: NiveauResolution;
  instance: InstanceResolvable | null;
  /** Explication destinee a l'utilisateur, nulle quand rien n'a change. */
  raison: string | null;
}

const LIBELLE_NIVEAU: Record<Exclude<NiveauResolution, "identique" | "indisponible">, string> = {
  meme_exercice: "Même exercice, machine différente ici",
  profil_identique: "Machine absente ici — même pilier et même profil de tension",
  meme_pilier: "Machine absente ici — même pilier, profil de tension différent",
};

/**
 * Deux listes de muscles, et la difference entre elles est le coeur de ce
 * module.
 *
 * `musclesAEviter` ecarte les REMPLACANTS : quand il faut de toute facon
 * choisir une autre machine, autant en prendre une qui ne tape pas dans un
 * muscle fatigue. C'est une preference, elle ne retire rien.
 *
 * `musclesExclus` ecarte l'exercice LUI-MEME, avant tout le reste. Une zone
 * sous contrainte severe n'est pas une preference : la disponibilite d'une
 * machine ne peut pas rendre a nouveau acceptable ce que le moteur de
 * contraintes a exclu.
 *
 * @param prevu             instance programmee (potentiellement d'une autre salle)
 * @param parcSalleDuJour   instances disponibles dans la salle du jour
 * @param dejaRetenues      instances deja placees dans la seance, a ne pas repeter
 * @param musclesAEviter    muscles fatigues : ecarte les remplacants
 * @param musclesExclus     muscles sous contrainte severe : ecarte aussi le prevu
 */
export function resoudrePourSalle(
  prevu: InstanceResolvable,
  parcSalleDuJour: InstanceResolvable[],
  dejaRetenues: string[] = [],
  musclesAEviter: string[] = [],
  musclesExclus: string[] = [],
): ResolutionSalle {
  const disponibles = parcSalleDuJour.filter((i) => !dejaRetenues.includes(i.id));

  const sollicite = (i: InstanceResolvable, liste: string[]) =>
    liste.length > 0 && i.musclesPrincipaux.some((m) => liste.some((e) => memeMuscle(e, m)));

  // L'exclusion se juge AVANT le raccourci « identique ».
  //
  // Ce raccourci rendait l'exercice prevu quand il existait dans la salle du
  // jour, sans jamais regarder les muscles : une zone sous contrainte severe
  // etait donc contournee par la simple presence de la machine. C'etait le
  // seul chemin par lequel une exclusion du moteur pouvait etre ignoree.
  const prevuExclu = sollicite(prevu, musclesExclus);

  if (
    !prevuExclu &&
    prevu.gymId === parcSalleDuJour[0]?.gymId &&
    disponibles.some((i) => i.id === prevu.id)
  ) {
    return { niveau: "identique", instance: prevu, raison: null };
  }

  // Un muscle exclu l'est pour tout le monde : il ne sert a rien de le retirer
  // du prevu pour le laisser revenir par un remplacant.
  const aEviter = [...musclesAEviter, ...musclesExclus];
  const compatibles = disponibles.filter((i) => !sollicite(i, aEviter));

  // 1. Le meme exercice existe ici, sur une autre machine.
  const memeExercice = compatibles.find((i) => i.exerciseId === prevu.exerciseId);
  if (memeExercice) {
    return {
      niveau: "meme_exercice",
      instance: memeExercice,
      raison: `${LIBELLE_NIVEAU.meme_exercice} : ${memeExercice.machineNom}`,
    };
  }

  // 2. Meme pilier et meme profil de tension : la substitution la plus fidele.
  const parRole = (a: InstanceResolvable, b: InstanceResolvable) =>
    ({ pilier: 0, substitut: 1, accessoire: 2 })[a.categorieRole] -
    ({ pilier: 0, substitut: 1, accessoire: 2 })[b.categorieRole];

  const memeProfil = compatibles
    .filter((i) => i.pilier === prevu.pilier && i.profilTension === prevu.profilTension)
    .sort(parRole)[0];
  if (memeProfil) {
    return {
      niveau: "profil_identique",
      instance: memeProfil,
      raison: `${LIBELLE_NIVEAU.profil_identique} : ${memeProfil.exerciceNom}`,
    };
  }

  // 3. Meme pilier, profil different : on garde le patron de mouvement.
  const memePilier = compatibles.filter((i) => i.pilier === prevu.pilier).sort(parRole)[0];
  if (memePilier) {
    return {
      niveau: "meme_pilier",
      instance: memePilier,
      raison: `${LIBELLE_NIVEAU.meme_pilier} : ${memePilier.exerciceNom}`,
    };
  }

  // 4. Rien de compatible : on preferera retirer l'exercice plutot que proposer
  //    une machine qui n'existe pas sur place — ou qui tape dans une zone
  //    qu'on menage. La raison distingue les deux : « absent » et « ecarte »
  //    n'appellent pas la meme reaction de l'athlete.
  return {
    niveau: "indisponible",
    instance: null,
    raison: prevuExclu
      ? `${prevu.exerciceNom} sollicite une zone que tu ménages`
      : `Aucun équivalent de ${prevu.exerciceNom} dans cette salle`,
  };
}
