import { gabaritSuivant } from "@/lib/engine/rotation-seances";
import { db } from "@/db/client";
import { seancesRealisees } from "@/db/archivage";
import {
  exerciseInTemplate,
  programmeBlocs,
  seanceTemplates,
  sessionLogs,
} from "@/db/schema";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { SeanceTemplate } from "@/db/schema";
import { prescrireAvecDefauts } from "@/lib/session-composer/draft";

/**
 * Selection de la prochaine seance d'un bloc.
 *
 * L'ancienne logique vivait dans un composant client et deduisait la lettre
 * suivante du DERNIER CARACTERE du nom de la seance :
 *
 *   const letter = lastTemplate.nom?.slice(-1) || "A";
 *   if (letter === "A") next = "B"; else if (letter === "B") next = "C"; else next = "A";
 *
 * Renommer une seance cassait donc le cycle, et le cycle etait fige a trois
 * seances. La rotation s'appuie desormais sur `ordreDansSemaine`, qui est le
 * champ prevu pour ca, et sur le nombre reel de seances du bloc.
 */

export interface ProchaineSeance {
  /**
   * `semaineActuelle` n'est pas exposée : la colonne vaut 1 et n'est jamais
   * incrementee. Les dates permettent a l'appelant de deduire la semaine
   * reelle via `positionDuBloc`, qui est la definition de reference.
   */
  bloc: { id: string; nom: string; typeCycle: string; dateDebut: string; dateFinPrevue: string | null };
  template: SeanceTemplate;
  /** Seances du bloc, dans l'ordre, pour laisser l'utilisateur choisir autrement. */
  toutesLesSeances: SeanceTemplate[];
}

export async function prochaineSeance(userId: string): Promise<ProchaineSeance | null> {
  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe)), eq(programmeBlocs.actif, true)),
  });
  if (!bloc) return null;

  const seances = await db.query.seanceTemplates.findMany({
    where: eq(seanceTemplates.blocId, bloc.id),
    orderBy: [asc(seanceTemplates.ordreDansSemaine)],
  });
  if (seances.length === 0) return null;

  // Derniere seance effectivement REALISEE dans ce bloc.
  //
  // « Realisee » veut dire cloturee. La requete se contentait auparavant de
  // l'existence d'une ligne : ouvrir la seance A par erreur puis quitter
  // l'application suffisait donc a faire avancer la rotation, et le lendemain
  // l'application proposait B — la seance A n'ayant jamais eu lieu.
  const derniere = await db
    .select({ seanceTemplateId: sessionLogs.seanceTemplateId })
    .from(sessionLogs)
    .innerJoin(seanceTemplates, eq(seanceTemplates.id, sessionLogs.seanceTemplateId))
    .where(
      and(
        seancesRealisees(userId),
        and(eq(seanceTemplates.blocId, bloc.id), isNotNull(sessionLogs.dureeMinutes)),
      ),
    )
    .orderBy(desc(sessionLogs.date), desc(sessionLogs.createdAt))
    .limit(1);

  const dernierId = derniere[0]?.seanceTemplateId ?? null;
  const suivante = gabaritSuivant(seances, dernierId)!;

  return {
    bloc: {
      id: bloc.id,
      nom: bloc.nom,
      typeCycle: bloc.typeCycle,
      dateDebut: bloc.dateDebut,
      dateFinPrevue: bloc.dateFinPrevue,
    },
    template: suivante,
    toutesLesSeances: seances,
  };
}

// ---------------------------------------------------------------------------
// Creation et edition d'un programme
//
// Il n'existait aucun chemin d'ecriture applicatif pour programme_blocs,
// seance_templates et exercise_in_template : seul `npm run seed` en produisait.
// L'application n'etait donc pas utilisable sans terminal.
// ---------------------------------------------------------------------------

export class RessourceIntrouvable extends Error {
  constructor(quoi: string) {
    super(`${quoi} introuvable`);
    this.name = "RessourceIntrouvable";
  }
}

/** Une combinaison de champs qui ne décrit rien d'exécutable. */
export class PrescriptionInvalide extends Error {
  constructor(readonly raison: string) {
    super(raison);
    this.name = "PrescriptionInvalide";
  }
}

export interface CreationBloc {
  userId: string;
  nom: string;
  dateDebut: string;
  dateFinPrevue?: string | null;
  typeCycle: string;
  /** Un seul bloc actif a la fois : les autres sont desactives. */
  actif?: boolean;
}

export async function creerBloc(donnees: CreationBloc) {
  return db.transaction(async (tx) => {
    if (donnees.actif) {
      await tx
        .update(programmeBlocs)
        .set({ actif: false, updatedAt: new Date() })
        .where(eq(programmeBlocs.userId, donnees.userId));
    }

    const [bloc] = await tx
      .insert(programmeBlocs)
      .values({
        userId: donnees.userId,
        nom: donnees.nom,
        dateDebut: donnees.dateDebut,
        dateFinPrevue: donnees.dateFinPrevue ?? null,
        typeCycle: donnees.typeCycle,
        semaineActuelle: 1,
        actif: donnees.actif ?? false,
      })
      .returning();

    if (!bloc) throw new Error("Création du bloc impossible");
    return bloc;
  });
}

/** Verifie qu'un bloc appartient bien a l'utilisateur. */
async function blocDeLUtilisateur(blocId: string, userId: string) {
  const bloc = await db.query.programmeBlocs.findFirst({
    where: and(eq(programmeBlocs.id, blocId), and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe))),
  });
  if (!bloc) throw new RessourceIntrouvable("Bloc");
  return bloc;
}

export async function creerSeanceTemplate(donnees: {
  userId: string;
  blocId: string;
  lettre: string;
  nom: string;
}) {
  await blocDeLUtilisateur(donnees.blocId, donnees.userId);

  const existantes = await db.query.seanceTemplates.findMany({
    where: eq(seanceTemplates.blocId, donnees.blocId),
  });

  const [template] = await db
    .insert(seanceTemplates)
    .values({
      blocId: donnees.blocId,
      lettre: donnees.lettre,
      nom: donnees.nom,
      // L'ordre pilote la rotation : il est attribue automatiquement.
      ordreDansSemaine: existantes.length + 1,
    })
    .returning();

  if (!template) throw new Error("Création de la séance impossible");
  return template;
}

/** Verifie qu'une seance appartient a un bloc de l'utilisateur. */
async function seanceDeLUtilisateur(templateId: string, userId: string) {
  const template = await db.query.seanceTemplates.findFirst({
    where: eq(seanceTemplates.id, templateId),
  });
  if (!template) throw new RessourceIntrouvable("Séance");
  await blocDeLUtilisateur(template.blocId, userId);
  return template;
}

export interface AjoutExerciceProgramme {
  userId: string;
  seanceTemplateId: string;
  exerciseInstanceId: string;
  /** Omis : la valeur par defaut est ecrite, et signalee comme telle. */
  seriesCibles?: number | null;
  fourchetteRepsMin?: number | null;
  fourchetteRepsMax?: number | null;
  rpeCible?: number | null;
  tempo?: string | null;
  reposSecondes?: number | null;
  /** Charge programmee en kg. Nullable, et jamais fabriquee. */
  chargeCible?: number | null;
  notes?: string | null;
}

export async function ajouterExerciceAuTemplate(donnees: AjoutExerciceProgramme) {
  await seanceDeLUtilisateur(donnees.seanceTemplateId, donnees.userId);

  // Le parc est commun : exiger que la machine appartienne a l'appelant
  // rendait impossible de programmer un exercice sur une machine saisie par
  // quelqu'un d'autre dans la meme salle.
  const instance = await db.query.exerciseInstances.findFirst({
    where: (ei, { and, eq, isNull }) =>
      and(eq(ei.id, donnees.exerciseInstanceId), isNull(ei.archiveLe)),
  });
  if (!instance) throw new RessourceIntrouvable("Machine");

  const prescription = prescrireAvecDefauts(donnees);
  if (prescription.fourchetteRepsMin > prescription.fourchetteRepsMax) {
    throw new PrescriptionInvalide("La borne haute doit être supérieure ou égale à la borne basse.");
  }

  // Les lignes retirées ne comptent pas dans l'ordre : sans ce filtre, chaque
  // retrait suivi d'un ajout laisserait un rang vide au milieu de la séance.
  const existants = await db.query.exerciseInTemplate.findMany({
    where: and(
      eq(exerciseInTemplate.seanceTemplateId, donnees.seanceTemplateId),
      isNull(exerciseInTemplate.archiveLe),
    ),
  });

  const [ligne] = await db
    .insert(exerciseInTemplate)
    .values({
      seanceTemplateId: donnees.seanceTemplateId,
      exerciseInstanceId: donnees.exerciseInstanceId,
      ordre: existants.length + 1,
      seriesCibles: prescription.seriesCibles,
      fourchetteRepsMin: prescription.fourchetteRepsMin,
      fourchetteRepsMax: prescription.fourchetteRepsMax,
      rpeCible: donnees.rpeCible ?? null,
      tempo: donnees.tempo ?? null,
      reposSecondes: prescription.reposSecondes,
      chargeCible: donnees.chargeCible ?? null,
      prescriptionParDefaut: prescription.prescriptionParDefaut,
      notes: donnees.notes ?? null,
    })
    .returning();

  if (!ligne) throw new Error("Ajout de l'exercice impossible");
  return ligne;
}

/**
 * TOUTE la configuration d'un exercice programmé est modifiable sur place.
 *
 * Seule la cible d'effort l'était : corriger un nombre de séries, une
 * fourchette de répétitions, un tempo, un repos ou une charge imposait de
 * retirer la ligne et de la recréer — ce qui lui faisait perdre son rang et
 * coupait `session_plan_items` de son origine.
 *
 * `null` est une valeur, pas une absence : c'est « non prescrit », et c'est le
 * seul moyen de revenir en arrière après avoir prescrit. La distinction se fait
 * donc sur la PRÉSENCE de la clé, pas sur sa valeur — un objet sans `tempo` ne
 * touche pas au tempo. Les champs à contrainte NOT NULL (`seriesCibles`,
 * `fourchetteReps*`) refusent `null` : ils ne décrivent pas une absence, ils
 * décrivent un nombre de séries à faire.
 */
export interface ModificationExerciceProgramme {
  seriesCibles?: number;
  fourchetteRepsMin?: number;
  fourchetteRepsMax?: number;
  rpeCible?: number | null;
  tempo?: string | null;
  reposSecondes?: number | null;
  /** Charge programmée en kg. `null` la retire — elle n'est jamais devinée. */
  chargeCible?: number | null;
  /** Rang visé dans la séance, à partir de 1. Voir `reordonnerExercice`. */
  ordre?: number;
}

/**
 * Déplace une ligne à la position demandée, dans sa séance.
 *
 * L'ordre est une POSITION (1 = en tête), pas un échange : deux gestes qui
 * visent le même rang donnent le même résultat, quel que soit l'état de départ.
 * Une position hors bornes est ramenée dans la séance plutôt que refusée — un
 * client qui compte à partir de 0 obtient ainsi le geste qu'il décrit, au lieu
 * d'un 400 à corriger chez lui.
 *
 * Toute écriture de rang est une RENUMÉROTATION de la séance : deux lignes qui
 * portent le même `ordre` rendraient la séance non déterministe.
 */
async function reordonnerExercice(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ligneId: string,
  position: number,
) {
  const ligne = await tx.query.exerciseInTemplate.findFirst({
    where: eq(exerciseInTemplate.id, ligneId),
  });
  if (!ligne) return undefined;

  const actives = await tx.query.exerciseInTemplate.findMany({
    where: and(
      eq(exerciseInTemplate.seanceTemplateId, ligne.seanceTemplateId),
      isNull(exerciseInTemplate.archiveLe),
    ),
    orderBy: [asc(exerciseInTemplate.ordre)],
  });

  const ordre = actives.filter((l) => l.id !== ligneId).map((l) => l.id);
  const rang = Math.min(Math.max(Math.trunc(position), 1), ordre.length + 1);
  ordre.splice(rang - 1, 0, ligneId);

  for (const [index, id] of ordre.entries()) {
    await tx
      .update(exerciseInTemplate)
      .set({ ordre: index + 1, updatedAt: new Date() })
      .where(eq(exerciseInTemplate.id, id));
  }

  return tx.query.exerciseInTemplate.findFirst({ where: eq(exerciseInTemplate.id, ligneId) });
}

export async function modifierExerciceDuTemplate(
  userId: string,
  ligneId: string,
  modifications: ModificationExerciceProgramme,
) {
  const ligne = await db.query.exerciseInTemplate.findFirst({
    where: eq(exerciseInTemplate.id, ligneId),
  });
  if (!ligne) throw new RessourceIntrouvable("Exercice programmé");
  if (ligne.archiveLe) throw new RessourceIntrouvable("Exercice programmé");
  await seanceDeLUtilisateur(ligne.seanceTemplateId, userId);

  const borneBasse = modifications.fourchetteRepsMin ?? ligne.fourchetteRepsMin;
  const borneHaute = modifications.fourchetteRepsMax ?? ligne.fourchetteRepsMax;
  if (borneBasse > borneHaute) {
    throw new PrescriptionInvalide(
      "La borne haute doit être supérieure ou égale à la borne basse.",
    );
  }

  const set: Partial<typeof exerciseInTemplate.$inferInsert> = {};
  if ("seriesCibles" in modifications) set.seriesCibles = modifications.seriesCibles;
  if ("fourchetteRepsMin" in modifications) set.fourchetteRepsMin = modifications.fourchetteRepsMin;
  if ("fourchetteRepsMax" in modifications) set.fourchetteRepsMax = modifications.fourchetteRepsMax;
  if ("rpeCible" in modifications) set.rpeCible = modifications.rpeCible ?? null;
  if ("tempo" in modifications) set.tempo = modifications.tempo?.trim() || null;
  if ("reposSecondes" in modifications) set.reposSecondes = modifications.reposSecondes ?? null;
  if ("chargeCible" in modifications) set.chargeCible = modifications.chargeCible ?? null;

  // Un champ désormais choisi ne peut plus être « à confirmer ». La liste ne
  // retient que ce que l'utilisateur n'a jamais renseigné.
  const choisis = new Set<string>(Object.keys(set));
  const restants = (ligne.prescriptionParDefaut ?? []).filter((champ) => !choisis.has(champ));

  if (Object.keys(set).length === 0 && modifications.ordre === undefined) return ligne;

  return db.transaction(async (tx) => {
    let misAJour = ligne;

    if (Object.keys(set).length > 0) {
      const [ecrite] = await tx
        .update(exerciseInTemplate)
        .set({
          ...set,
          prescriptionParDefaut: restants.length > 0 ? restants : null,
          updatedAt: new Date(),
        })
        .where(eq(exerciseInTemplate.id, ligneId))
        .returning();
      if (!ecrite) throw new Error("Modification de l'exercice impossible");
      misAJour = ecrite;
    }

    if (modifications.ordre !== undefined) {
      const repositionnee = await reordonnerExercice(tx, ligneId, modifications.ordre);
      if (repositionnee) misAJour = repositionnee;
    }

    return misAJour;
  });
}

/**
 * Réordonne un exercice programmé, seul.
 *
 * Le geste existe à côté du PATCH de configuration pour que la vérification de
 * propriété soit la même des deux côtés : un rang ne s'écrit pas sur la ligne
 * de quelqu'un d'autre.
 */
export async function reordonnerExerciceDuTemplate(
  userId: string,
  ligneId: string,
  position: number,
) {
  const ligne = await db.query.exerciseInTemplate.findFirst({
    where: eq(exerciseInTemplate.id, ligneId),
  });
  if (!ligne) throw new RessourceIntrouvable("Exercice programmé");
  if (ligne.archiveLe) throw new RessourceIntrouvable("Exercice programmé");
  await seanceDeLUtilisateur(ligne.seanceTemplateId, userId);

  return db.transaction(async (tx) => {
    const repositionnee = await reordonnerExercice(tx, ligneId, position);
    if (!repositionnee) throw new RessourceIntrouvable("Exercice programmé");
    return repositionnee;
  });
}

/**
 * Retire un exercice du programme.
 *
 * Retirer, ce n'est pas effacer. La ligne a peut-être déjà servi dans des
 * séances, et `session_plan_items` la référence pour dire d'où venait
 * l'exercice réalisé ce jour-là : la supprimer était refusé par la clé
 * étrangère — l'écran échouait en 500 sur un geste ordinaire — et l'aurait été
 * au prix de l'origine de l'historique si la contrainte avait cascadé.
 *
 * Elle est donc datée. Plus rien ne la programme, les séances déjà faites
 * gardent leur provenance, et rien n'est détruit.
 */
export async function retirerExerciceDuTemplate(userId: string, ligneId: string) {
  const ligne = await db.query.exerciseInTemplate.findFirst({
    where: eq(exerciseInTemplate.id, ligneId),
  });
  if (!ligne) throw new RessourceIntrouvable("Exercice programmé");
  if (ligne.archiveLe) throw new RessourceIntrouvable("Exercice programmé");
  await seanceDeLUtilisateur(ligne.seanceTemplateId, userId);

  await db.transaction(async (tx) => {
    await tx
      .update(exerciseInTemplate)
      .set({ archiveLe: new Date(), updatedAt: new Date() })
      .where(eq(exerciseInTemplate.id, ligneId));

    // Renumérotation des lignes encore actives, pour garder un ordre continu.
    // Celle qui est retirée conserve son ancien rang : il ne veut plus rien
    // dire pour le programme, et l'historique porte le sien dans
    // `session_plan_items.ordre`.
    const restants = await tx.query.exerciseInTemplate.findMany({
      where: and(
        eq(exerciseInTemplate.seanceTemplateId, ligne.seanceTemplateId),
        isNull(exerciseInTemplate.archiveLe),
      ),
      orderBy: (eit, { asc }) => [asc(eit.ordre)],
    });
    for (const [index, r] of restants.entries()) {
      if (r.ordre !== index + 1) {
        await tx.update(exerciseInTemplate)
          .set({ ordre: index + 1, updatedAt: new Date() })
          .where(eq(exerciseInTemplate.id, r.id));
      }
    }
  });
}
