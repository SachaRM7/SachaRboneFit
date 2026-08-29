import { db } from "@/db/client";
import { exerciseInTemplate, programmeBlocs, seanceTemplates, sessionLogs } from "@/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { SeanceTemplate } from "@/db/schema";

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
  bloc: { id: string; nom: string; semaineActuelle: number | null };
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

  // Derniere seance effectivement realisee dans ce bloc.
  const derniere = await db
    .select({ seanceTemplateId: sessionLogs.seanceTemplateId })
    .from(sessionLogs)
    .innerJoin(seanceTemplates, eq(seanceTemplates.id, sessionLogs.seanceTemplateId))
    .where(and(and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)), eq(seanceTemplates.blocId, bloc.id)))
    .orderBy(desc(sessionLogs.date), desc(sessionLogs.createdAt))
    .limit(1);

  const dernierId = derniere[0]?.seanceTemplateId ?? null;
  const indexPrecedent = dernierId ? seances.findIndex((s) => s.id === dernierId) : -1;
  const suivante = seances[(indexPrecedent + 1) % seances.length]!;

  return {
    bloc: { id: bloc.id, nom: bloc.nom, semaineActuelle: bloc.semaineActuelle },
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
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible?: number | null;
  tempo?: string | null;
  reposSecondes?: number | null;
  notes?: string | null;
}

export async function ajouterExerciceAuTemplate(donnees: AjoutExerciceProgramme) {
  await seanceDeLUtilisateur(donnees.seanceTemplateId, donnees.userId);

  const instance = await db.query.exerciseInstances.findFirst({
    where: (ei, { and, eq }) =>
      and(eq(ei.id, donnees.exerciseInstanceId), eq(ei.userId, donnees.userId)),
  });
  if (!instance) throw new RessourceIntrouvable("Machine");

  const existants = await db.query.exerciseInTemplate.findMany({
    where: eq(exerciseInTemplate.seanceTemplateId, donnees.seanceTemplateId),
  });

  const [ligne] = await db
    .insert(exerciseInTemplate)
    .values({
      seanceTemplateId: donnees.seanceTemplateId,
      exerciseInstanceId: donnees.exerciseInstanceId,
      ordre: existants.length + 1,
      seriesCibles: donnees.seriesCibles,
      fourchetteRepsMin: donnees.fourchetteRepsMin,
      fourchetteRepsMax: donnees.fourchetteRepsMax,
      rpeCible: donnees.rpeCible ?? null,
      tempo: donnees.tempo ?? null,
      reposSecondes: donnees.reposSecondes ?? null,
      notes: donnees.notes ?? null,
    })
    .returning();

  if (!ligne) throw new Error("Ajout de l'exercice impossible");
  return ligne;
}

export async function retirerExerciceDuTemplate(userId: string, ligneId: string) {
  const ligne = await db.query.exerciseInTemplate.findFirst({
    where: eq(exerciseInTemplate.id, ligneId),
  });
  if (!ligne) throw new RessourceIntrouvable("Exercice programmé");
  await seanceDeLUtilisateur(ligne.seanceTemplateId, userId);

  // Renumerotation pour garder un ordre continu.
  await db.transaction(async (tx) => {
    await tx.delete(exerciseInTemplate).where(eq(exerciseInTemplate.id, ligneId));
    const restants = await tx.query.exerciseInTemplate.findMany({
      where: eq(exerciseInTemplate.seanceTemplateId, ligne.seanceTemplateId),
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
