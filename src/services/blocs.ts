import { db } from "@/db/client";
import type { Lecteur } from "@/db/lecteur";
import { programmeBlocs } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

/**
 * Les blocs du programme, lus une fois.
 *
 * Un même rendu de l'écran Programme interrogeait `programme_blocs` trois fois :
 * la vue cherchait le bloc actif, `mesurerCycle` le recherchait pour en tirer la
 * phase, et `semainesSansDeload` cherchait le dernier bloc de décharge puis, à
 * défaut, le bloc actif une troisième fois. Trois allers-retours pour une table
 * qui, pour un compte, tient en quelques lignes — et avec `max: 1` sur le pool,
 * trois allers-retours qui ne se recouvrent même pas.
 *
 * On les lit donc ensemble. Ce n'est pas un cache : la lecture est refaite à
 * chaque appel, et le résultat se passe de main en main dans un seul traitement.
 * Les services gardent leur lecture autonome quand personne ne la leur fournit.
 */

export type Bloc = typeof programmeBlocs.$inferSelect;

export interface BlocsDuProgramme {
  /**
   * Le bloc actif. Le schéma n'interdit pas qu'il y en ait plusieurs ; on prend
   * le plus récemment commencé, ce qui est aussi ce que faisait `findFirst`
   * dans la pratique — mais sans que ce soit dit.
   */
  actif: Bloc | null;
  /** Le dernier bloc de décharge, pour compter les semaines depuis. */
  dernierDeload: Bloc | null;
  tous: Bloc[];
}

export async function lireBlocs(
  userId: string,
  executeur: Lecteur = db,
): Promise<BlocsDuProgramme> {
  const tous = await executeur.query.programmeBlocs.findMany({
    where: and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe)),
    orderBy: [desc(programmeBlocs.dateDebut)],
  });

  return {
    actif: tous.find((b) => b.actif) ?? null,
    dernierDeload: tous.find((b) => b.typeCycle === "deload") ?? null,
    tous,
  };
}
