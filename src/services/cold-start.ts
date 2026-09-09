import { db } from "@/db/client";
import { bodyWeights, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ageDeLaMesure, type ProfilColdStart } from "@/lib/engine/cold-start-strength";

/** Charge les données froides une fois, sans les exposer au client. */
export async function chargerContexteColdStart(userId: string) {
  const [profil, dernierePesee] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        dateNaissance: true, sexe: true, taille: true, niveauExperience: true,
        anneesDePratique: true, moisDInterruption: true,
        dureeSeanceCibleMinutes: true, dureeSeanceMaxMinutes: true,
      },
    }),
    db.query.bodyWeights.findFirst({
      where: eq(bodyWeights.userId, userId),
      orderBy: [desc(bodyWeights.date)],
      columns: { date: true, poids: true },
    }),
  ]);

  const coldStart: ProfilColdStart = {
    dateNaissance: profil?.dateNaissance ?? null,
    sexe: profil?.sexe ?? null,
    tailleCm: profil?.taille ?? null,
    poidsKg: dernierePesee?.poids ?? null,
    poidsMesureLe: dernierePesee?.date ?? null,
    poidsAgeJours: ageDeLaMesure(dernierePesee?.date ?? null),
    niveauExperience: profil?.niveauExperience ?? null,
    anneesDePratique: profil?.anneesDePratique ?? null,
    moisDInterruption: profil?.moisDInterruption ?? null,
  };

  return {
    coldStart,
    dureeCibleMinutes: profil?.dureeSeanceCibleMinutes ?? null,
    dureeMaxMinutes: profil?.dureeSeanceMaxMinutes ?? null,
  };
}
