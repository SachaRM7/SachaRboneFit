import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { users, gyms, contraintes, programmeBlocs } from "@/db/schema";
import { REEVALUATION_JOURS, decalerDe } from "@/lib/engine/contraintes";
import { and, eq, isNull } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { createClient } from "@/lib/supabase/server";
import { detailErreur } from "@/lib/erreurs";
import { onboardingSchema, estUneReprise } from "@/lib/validators/onboarding";
import { niveauDeReprise } from "@/lib/engine/calibration";

/**
 * Enregistrement de l'onboarding.
 *
 * Tout est écrit en une transaction : un profil à moitié rempli, avec une
 * salle créée mais pas de bloc, laisserait l'application dans un état qu'aucun
 * écran ne sait présenter.
 *
 * Le bloc créé n'est pas un programme définitif. Après une interruption,
 * personne — ni le moteur ni le modèle — ne sait ce que vaut l'athlète
 * aujourd'hui. La première phase sert à l'apprendre.
 */
export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profil, salles] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.gyms.findMany({ where: isNull(gyms.archiveLe) }),
  ]);

  return NextResponse.json({
    termine: Boolean(profil?.onboardingTermineLe),
    prenom: profil?.nom ?? null,
    salles: salles.map((s) => ({ id: s.id, nom: s.nom })),
  });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = authUser.id;
    const emailAuth = authUser.email ?? null;

    const parsed = onboardingSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Réponses incomplètes", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const d = parsed.data;
    const reprise = estUneReprise(d.moisDInterruption);

    const resultat = await db.transaction(async (tx) => {
      // La ligne applicative peut manquer : elle est créée par /api/user, appelée
      // après inscription. Un compte qui confirme son email depuis un autre
      // appareil n'y passe jamais. Sans ce filet, la mise à jour ci-dessous
      // toucherait zéro ligne sans rien signaler, et l'utilisateur reviendrait
      // indéfiniment sur l'onboarding.
      const existant = await tx.query.users.findFirst({ where: eq(users.id, userId) });
      if (!existant) {
        await tx.insert(users).values({
          id: userId,
          email: emailAuth ?? `${userId}@inconnu.local`,
          nom: emailAuth?.split("@")[0] ?? "Athlète",
        });
      }

      await tx.update(users).set({
        objectifType: d.objectifType,
        objectifMusclesPrioritaires: d.musclesPrioritaires,
        niveauExperience: d.niveauExperience,
        anneesDePratique: d.anneesDePratique,
        moisDInterruption: d.moisDInterruption,
        frequenceCibleParSemaine: d.frequenceCibleParSemaine,
        frequenceMinParSemaine: d.frequenceMinParSemaine,
        frequenceMaxParSemaine: d.frequenceMaxParSemaine,
        dureeSeanceCibleMinutes: d.dureeSeanceCibleMinutes,
        dureeSeanceMaxMinutes: d.dureeSeanceMaxMinutes,
        preferenceMateriel: d.preferenceMateriel,
        exercicesRefuses: d.exercicesRefuses,
        taille: d.taille ?? null,
        onboardingTermineLe: new Date(),
        updatedAt: new Date(),
      }).where(eq(users.id, userId));

      // Les salles sont communes : on ne recrée pas ce qui existe déjà.
      let salleId = d.salleId;
      if (!salleId && d.nouvelleSalleNom) {
        const existante = await tx.query.gyms.findFirst({
          where: and(eq(gyms.nom, d.nouvelleSalleNom), isNull(gyms.archiveLe)),
        });
        if (existante) {
          salleId = existante.id;
        } else {
          const [creee] = await tx.insert(gyms).values({
            userId,
            nom: d.nouvelleSalleNom,
            notes: "Exercices disponibles à compléter au fil des séances.",
          }).returning();
          salleId = creee?.id;
        }
      }

      if (salleId) {
        await tx.update(users).set({ prefSalleParDefautId: salleId }).where(eq(users.id, userId));
      }

      if (d.contraintes.length > 0) {
        const aujourdhui = new Date().toISOString().slice(0, 10);
        await tx.insert(contraintes).values(
          d.contraintes.map((c) => ({
            userId,
            muscle: c.muscle,
            type: "zone_sensible" as const,
            severite: c.severite,
            notes: c.notes ?? null,
            dateDebut: aujourdhui,
            // Une gêne déclarée à l'inscription est celle qui a le plus de
            // chances de devenir périmée sans que personne ne s'en aperçoive :
            // elle est saisie une fois, puis jamais revue. Elle porte donc une
            // échéance comme les autres — c'était le seul chemin de création
            // qui échappait au cycle de vie.
            aReevaluerLe: decalerDe(aujourdhui, REEVALUATION_JOURS),
            origine: "onboarding" as const,
          })),
        );
      }

      // Un seul bloc actif à la fois : les précédents cèdent la place.
      await tx.update(programmeBlocs)
        .set({ actif: false })
        .where(and(eq(programmeBlocs.userId, userId), eq(programmeBlocs.actif, true)));

      const niveau = niveauDeReprise({
        moisDInterruption: d.moisDInterruption,
        anneesDePratique: d.anneesDePratique,
      });

      const [bloc] = await tx.insert(programmeBlocs).values({
        userId,
        nom: reprise ? "Reprise & calibration" : "Calibration",
        dateDebut: new Date().toISOString().slice(0, 10),
        // Volontairement court et prolongeable : sa durée dépend de la vitesse
        // à laquelle les charges se stabilisent, pas d'un calendrier.
        typeCycle: "calibration",
        semaineActuelle: 1,
        actif: true,
      }).returning();

      return { salleId, blocId: bloc?.id, reprise, niveau };
    });

    return NextResponse.json(resultat, { status: 201 });
  } catch (error) {
    const detail = detailErreur(error);
    console.error("[api/onboarding]", detail, error);
    return NextResponse.json({ error: `Enregistrement du profil : ${detail}` }, { status: 500 });
  }
}
