import { db } from "@/db/client";
import {
  exerciseInstances, exercises, instanceReglages, notesExercice, reglagesPersonnels,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  ficheRenseignee, messageDeRefus, reglagesAAfficher, resumeDesReglages, tempoEffectif,
  validerReglage,
  type DefinitionReglage, type FicheTechnique, type ReglageAffiche, type TempoResolu,
} from "@/lib/engine/execution";

/**
 * Ce qu'il faut charger pour exécuter un mouvement, et rien d'autre.
 *
 * Trois portées distinctes se rejoignent ici, sans jamais se mélanger : la
 * fiche du MOUVEMENT, les réglages de l'APPAREIL, les valeurs de la PERSONNE.
 * Le service les assemble pour l'écran ; il ne les recopie pas de l'une vers
 * l'autre.
 */

export interface ContexteExecution {
  exerciseInstanceId: string | null;
  exerciseId: string;
  fiche: FicheTechnique | null;
  tempo: TempoResolu | null;
  reglages: ReglageAffiche[];
  resumeReglages: string | null;
  note: string | null;
}

/** Erreur métier : la valeur ne correspond pas à ce que la machine accepte. */
export class ReglageRefuse extends Error {
  constructor(readonly cle: string, message: string) {
    super(message);
    this.name = "ReglageRefuse";
  }
}

/** Erreur métier : l'appareil visé n'existe pas, ou plus. */
export class InstanceIntrouvable extends Error {
  constructor() {
    super("Appareil introuvable");
    this.name = "InstanceIntrouvable";
  }
}

function definitionsDe(lignes: typeof instanceReglages.$inferSelect[]): DefinitionReglage[] {
  return lignes.map((r) => ({
    cle: r.cle,
    libelle: r.libelle,
    type: r.typeValeur,
    min: r.min,
    max: r.max,
    options: r.options,
    unite: r.unite,
    ordre: r.ordre,
  }));
}

/**
 * Le contexte d'exécution d'un exercice, pour un compte donné.
 *
 * `exerciseInstanceId` peut être nul : les pompes n'ont pas d'appareil, et il
 * n'y a alors ni réglages ni note d'instance — seulement la fiche, le tempo, et
 * une note rattachée au mouvement.
 *
 * Le tempo de la séance et celui du programme sont passés par l'appelant, qui
 * les a déjà en main via le plan : les recharger ici imposerait une requête de
 * plus par exercice, pour une valeur déjà lue.
 */
export async function contexteExecution(entrees: {
  userId: string;
  exerciseId: string;
  exerciseInstanceId?: string | null;
  tempoSeance?: string | null;
  tempoProgramme?: string | null;
}): Promise<ContexteExecution> {
  const { userId, exerciseId, exerciseInstanceId = null } = entrees;

  const exercice = await db.query.exercises.findFirst({
    where: eq(exercises.id, exerciseId),
    columns: { ficheTechnique: true, tempoParDefaut: true },
  });

  const tempo = tempoEffectif({
    seance: entrees.tempoSeance,
    programme: entrees.tempoProgramme,
    exercice: exercice?.tempoParDefaut,
  });

  const fiche = ficheRenseignee(exercice?.ficheTechnique) ? exercice!.ficheTechnique! : null;

  if (!exerciseInstanceId) {
    // Sans appareil, la note se range sur le mouvement : c'est le seul objet
    // durable auquel la rattacher.
    const note = await db.query.notesExercice.findFirst({
      where: and(eq(notesExercice.userId, userId), eq(notesExercice.exerciseId, exerciseId)),
    });
    return {
      exerciseInstanceId: null, exerciseId, fiche, tempo,
      reglages: [], resumeReglages: null, note: note?.texte ?? null,
    };
  }

  const [definitions, personnels, note] = await Promise.all([
    db.query.instanceReglages.findMany({
      where: eq(instanceReglages.exerciseInstanceId, exerciseInstanceId),
    }),
    // L'isolation est ici, et elle est double : le compte ET l'appareil. Sans le
    // second, les crans d'une Leg Extension viendraient garnir l'autre.
    db.query.reglagesPersonnels.findMany({
      where: and(
        eq(reglagesPersonnels.userId, userId),
        eq(reglagesPersonnels.exerciseInstanceId, exerciseInstanceId),
      ),
    }),
    db.query.notesExercice.findFirst({
      where: and(
        eq(notesExercice.userId, userId),
        eq(notesExercice.exerciseInstanceId, exerciseInstanceId),
      ),
    }),
  ]);

  const affiches = reglagesAAfficher(
    definitionsDe(definitions),
    personnels.map((p) => ({ cle: p.cle, valeur: p.valeur })),
  );

  return {
    exerciseInstanceId, exerciseId, fiche, tempo,
    reglages: affiches,
    resumeReglages: resumeDesReglages(affiches),
    note: note?.texte ?? null,
  };
}

/**
 * Enregistre les réglages personnels d'un appareil.
 *
 * Persisté À LA MODIFICATION, pas à la clôture de la séance. Changer le siège
 * puis fermer l'onglet ne doit rien perdre : le réglage n'est pas une donnée de
 * séance, c'est un souvenir d'appareil, et il vaut indépendamment de ce qui
 * sera soulevé ensuite.
 *
 * Tout ou rien : les valeurs sont validées d'abord, écrites ensuite dans une
 * transaction. Une saisie fautive sur le troisième réglage n'enregistre pas les
 * deux premiers — sans quoi on ne saurait plus, en rouvrant l'écran, ce qui a
 * été retenu et ce qui a été rejeté.
 *
 * Une valeur vide EFFACE le réglage : c'est ainsi qu'on revient à « non
 * renseigné » sans avoir à inventer une valeur de sortie.
 */
export async function enregistrerReglages(entrees: {
  userId: string;
  exerciseInstanceId: string;
  valeurs: Record<string, string>;
}): Promise<ReglageAffiche[]> {
  const { userId, exerciseInstanceId, valeurs } = entrees;

  const instance = await db.query.exerciseInstances.findFirst({
    where: and(
      eq(exerciseInstances.id, exerciseInstanceId),
      isNull(exerciseInstances.archiveLe),
    ),
  });
  if (!instance) throw new InstanceIntrouvable();

  const definitions = await db.query.instanceReglages.findMany({
    where: eq(instanceReglages.exerciseInstanceId, exerciseInstanceId),
  });
  const parCle = new Map(definitionsDe(definitions).map((d) => [d.cle, d]));

  const aEcrire: Array<{ cle: string; valeur: string }> = [];
  const aEffacer: string[] = [];

  for (const [cle, brute] of Object.entries(valeurs)) {
    const definition = parCle.get(cle);
    if (!definition) throw new ReglageRefuse(cle, messageDeRefus({ motif: "cle_inconnue" }));

    if (brute.trim() === "") {
      aEffacer.push(cle);
      continue;
    }
    const verdict = validerReglage(definition, brute);
    if (!verdict.valide) {
      throw new ReglageRefuse(cle, messageDeRefus(verdict.refus!, definition));
    }
    aEcrire.push({ cle, valeur: verdict.valeur! });
  }

  await db.transaction(async (tx) => {
    if (aEffacer.length > 0) {
      await tx.delete(reglagesPersonnels).where(and(
        eq(reglagesPersonnels.userId, userId),
        eq(reglagesPersonnels.exerciseInstanceId, exerciseInstanceId),
        inArray(reglagesPersonnels.cle, aEffacer),
      ));
    }
    for (const { cle, valeur } of aEcrire) {
      await tx.insert(reglagesPersonnels)
        .values({ userId, exerciseInstanceId, cle, valeur })
        .onConflictDoUpdate({
          target: [
            reglagesPersonnels.userId,
            reglagesPersonnels.exerciseInstanceId,
            reglagesPersonnels.cle,
          ],
          set: { valeur, updatedAt: new Date() },
        });
    }
  });

  const [defs, apres] = await Promise.all([
    db.query.instanceReglages.findMany({
      where: eq(instanceReglages.exerciseInstanceId, exerciseInstanceId),
    }),
    db.query.reglagesPersonnels.findMany({
      where: and(
        eq(reglagesPersonnels.userId, userId),
        eq(reglagesPersonnels.exerciseInstanceId, exerciseInstanceId),
      ),
    }),
  ]);
  return reglagesAAfficher(
    definitionsDe(defs),
    apres.map((p) => ({ cle: p.cle, valeur: p.valeur })),
  );
}

/**
 * Écrit la note d'un exercice, ou l'efface si le texte est vide.
 *
 * Une note par personne et par objet, remplacée quand on la réécrit : ce n'est
 * pas un journal, c'est un post-it. En empiler l'historique obligerait à
 * choisir laquelle montrer, et la réponse serait toujours « la dernière ».
 */
export async function ecrireNote(entrees: {
  userId: string;
  exerciseInstanceId?: string | null;
  exerciseId?: string | null;
  texte: string;
}): Promise<string | null> {
  const { userId, texte } = entrees;
  const instanceId = entrees.exerciseInstanceId ?? null;
  const exerciceId = instanceId ? null : (entrees.exerciseId ?? null);
  if (!instanceId && !exerciceId) throw new InstanceIntrouvable();

  const portee = instanceId
    ? eq(notesExercice.exerciseInstanceId, instanceId)
    : eq(notesExercice.exerciseId, exerciceId!);
  const ou = and(eq(notesExercice.userId, userId), portee);

  const propre = texte.trim();
  if (propre === "") {
    await db.delete(notesExercice).where(ou);
    return null;
  }

  const existante = await db.query.notesExercice.findFirst({ where: ou });
  if (existante) {
    await db.update(notesExercice)
      .set({ texte: propre, updatedAt: new Date() })
      .where(eq(notesExercice.id, existante.id));
  } else {
    await db.insert(notesExercice).values({
      userId, exerciseInstanceId: instanceId, exerciseId: exerciceId, texte: propre,
    });
  }
  return propre;
}
