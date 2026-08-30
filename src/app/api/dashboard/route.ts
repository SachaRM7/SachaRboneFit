import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { sessionLogs, dailyStates, bodyWeights, seanceTemplates, programmeBlocs, precalcSessions, weeklyDebriefs, gyms, exerciseInstances, exercises } from "@/db/schema";
import { eq, desc, and, inArray, isNull, gte } from "drizzle-orm";
import { computeFeuJour } from "@/lib/engine/feu-biologique";
import { alertes } from "@/services/progression";
import { prochaineSeance } from "@/services/programmes";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { detailErreur } from "@/lib/erreurs";
import { etatDuJour } from "@/lib/engine/etat-du-jour";
import { exercicesRealisables } from "@/lib/engine/disponibilite";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });

    const lastWeight = await db.query.bodyWeights.findFirst({
      where: eq(bodyWeights.userId, userId),
      orderBy: [desc(bodyWeights.date)],
    });

    const blocActif = await db.query.programmeBlocs.findFirst({
      where: and(and(eq(programmeBlocs.userId, userId), isNull(programmeBlocs.archiveLe)), eq(programmeBlocs.actif, true)),
    });

    const lastSession = await db.query.sessionLogs.findFirst({
      where: and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)),
      orderBy: [desc(sessionLogs.createdAt)],
    });

    // La rotation était dupliquée ici, avec le même défaut qu'ailleurs : lettres
    // A/B/C en dur, cycle figé à trois séances. Elle passe par le service, qui
    // s'appuie sur `ordreDansSemaine` et le nombre réel de séances du bloc.
    const suite = await prochaineSeance(userId);
    const seanceSuivante = suite
      ? { lettre: suite.template.lettre, templateId: suite.template.id, templateNom: suite.template.nom }
      : { lettre: "", templateId: "", templateNom: "Aucune séance programmée" };

    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyStateToday = await db.query.dailyStates.findFirst({
      where: and(eq(dailyStates.userId, userId), eq(dailyStates.date, todayStr)),
    });

    let feuJour: "vert" | "orange" | "rouge" | null = null;
    if (dailyStateToday) {
      const stateForFeu = {
        date: dailyStateToday.date,
        sommeilHeures: dailyStateToday.sommeilHeures ?? 7,
        jeuneBool: dailyStateToday.jeuneBool ?? false,
        shiftRecentBool: dailyStateToday.shiftRecentBool ?? false,
        shiftType: (dailyStateToday.shiftType as "jour" | "nuit" | "aucun") ?? "aucun",
        energieDepart: dailyStateToday.energieDepart ?? 5,
        courbatures: dailyStateToday.courbatures ?? [],
      };
      feuJour = computeFeuJour(stateForFeu).feu;
    }

    let feuTendance: "vert" | "orange" | "rouge" | null = null;
    if (lastSession?.feuBiologiqueTendance) {
      const f = lastSession.feuBiologiqueTendance;
      if (f === "vert" || f === "orange" || f === "rouge") {
        feuTendance = f;
      }
    }

    const poids30jours = await db.query.bodyWeights.findMany({
      where: eq(bodyWeights.userId, userId),
      orderBy: [desc(bodyWeights.date)],
    });

    const precalcSession = await db.query.precalcSessions.findFirst({
      where: and(eq(precalcSessions.userId, userId), eq(precalcSessions.targetDate, todayStr)),
    });

    const now = new Date();
    const startOfWeek = new Date(now);
    // `- getDay() + 1` plaçait le dimanche (getDay() === 0) au lundi SUIVANT :
    // le début de semaine tombait dans le futur, et le décompte des séances
    // valait zéro tous les dimanches.
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStartStr = startOfWeek.toISOString().slice(0, 10);

    const weeklyDebrief = await db.query.weeklyDebriefs.findFirst({
      where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, weekStartStr)),
    });

    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStartStr = lastWeekStart.toISOString().slice(0, 10);

    const lastWeekDebrief = !weeklyDebrief ? await db.query.weeklyDebriefs.findFirst({
      where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, lastWeekStartStr)),
    }) : null;

    const recentSessions = await db.query.sessionLogs.findMany({
      where: and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)),
      orderBy: [desc(sessionLogs.createdAt)],
      limit: 5,
    });

    // Une requete par seance et par jointure : jusqu'a dix appels concurrents
    // pour cinq lignes, la ou deux lectures groupees suffisent. Les salles et
    // les gabarits d'un utilisateur se comptent en dizaines.
    // `seanceTemplates` ne porte pas d'`user_id` : une lecture sans filtre
    // remonterait les gabarits de tout le monde. On ne lit que les identifiants
    // effectivement cites par les seances de cet utilisateur.
    const idsGabarits = [...new Set(recentSessions.map((s) => s.seanceTemplateId).filter((v): v is string => Boolean(v)))];

    const [sallesUtilisateur, gabaritsUtilisateur] = await Promise.all([
      db.query.gyms.findMany({ where: isNull(gyms.archiveLe) }),
      idsGabarits.length
        ? db.query.seanceTemplates.findMany({ where: inArray(seanceTemplates.id, idsGabarits) })
        : Promise.resolve([]),
    ]);
    const salleParId = new Map(sallesUtilisateur.map((g) => [g.id, g]));
    const gabaritParId = new Map(gabaritsUtilisateur.map((t) => [t.id, t]));

    const recentSessionsWithData = recentSessions.map((s) => {
      const gym = s.gymId ? salleParId.get(s.gymId) : undefined;
      const template = s.seanceTemplateId ? gabaritParId.get(s.seanceTemplateId) : undefined;
      return {
        id: s.id,
        date: s.date,
        dureeMinutes: s.dureeMinutes,
        energieFin: s.energieFin,
        templateNom: template?.nom ?? null,
        templateLettre: template?.lettre ?? null,
        gymNom: gym?.nom ?? null,
      };
    });

    // Salle du jour : la préférence posée à l'onboarding, sinon l'unique salle
    // active. L'accueil envoyait jusqu'ici `gymId=` vide, et la séance ne
    // pouvait pas démarrer.
    let salleDuJour = user?.prefSalleParDefautId
      ? salleParId.get(user.prefSalleParDefautId) ?? null
      : null;
    if (!salleDuJour && sallesUtilisateur.length === 1) salleDuJour = sallesUtilisateur[0]!;

    // Compter les appareils décrits sous-estimait ce qu'un lieu permet : une
    // salle dont le matériel est coché, ou une maison où l'on fait des pompes,
    // s'affichait « vide » et renvoyait l'utilisateur saisir du matériel.
    const exercicesRealisablesIci = salleDuJour
      ? await (async () => {
          const [catalogue, instancesDuLieu] = await Promise.all([
            db.query.exercises.findMany({
              columns: { id: true, nom: true, pilier: true, categorieRole: true, musclesPrincipaux: true, equipement: true },
            }),
            db.query.exerciseInstances.findMany({
              where: and(
                eq(exerciseInstances.gymId, salleDuJour.id),
                isNull(exerciseInstances.archiveLe),
              ),
              columns: { id: true, exerciseId: true, machineNom: true, incrementsPossibles: true },
            }),
          ]);
          return exercicesRealisables({
            catalogue: catalogue.map((e) => ({ ...e, musclesPrincipaux: e.musclesPrincipaux ?? [] })),
            equipementsDuLieu: salleDuJour.equipementsDisponibles ?? [],
            instances: instancesDuLieu.map((i) => ({ ...i, incrementsPossibles: i.incrementsPossibles ?? [] })),
          }).length;
        })()
      : 0;

    // Décrit veut dire : quelqu'un s'est prononcé sur ce lieu — en cochant du
    // matériel, fût-ce aucun, ou en décrivant un appareil.
    const lieuRenseigne = salleDuJour
      ? salleDuJour.equipementsDisponibles !== null ||
        (await db.$count(
          exerciseInstances,
          and(eq(exerciseInstances.gymId, salleDuJour.id), isNull(exerciseInstances.archiveLe)),
        )) > 0
      : false;

    const seancesDeLaSemaine = await db.query.sessionLogs.findMany({
      columns: { date: true },
      where: and(
        eq(sessionLogs.userId, userId),
        isNull(sessionLogs.archiveLe),
        gte(sessionLogs.date, weekStartStr),
      ),
    });

    const etat = etatDuJour({
      salle: salleDuJour ? { id: salleDuJour.id, nom: salleDuJour.nom } : null,
      exercicesRealisablesIci,
      lieuRenseigne,
      prochaineSeance: suite
        ? { templateId: suite.template.id, lettre: suite.template.lettre, nom: suite.template.nom }
        : null,
      seanceFaiteAujourdhui: seancesDeLaSemaine.some((s) => s.date === todayStr),
      enCalibration: blocActif?.typeCycle === "calibration",
      seancesCetteSemaine: seancesDeLaSemaine.length,
      frequenceMaxParSemaine: user?.frequenceMaxParSemaine ?? null,
    });

    return NextResponse.json({
      etat,
      user: {
        nom: user?.nom ?? "Sacha",
        poidsActuel: lastWeight?.poids ?? null,
      },
      blocActif: blocActif
        ? {
            nom: blocActif.nom,
            typeCycle: blocActif.typeCycle,
            semaineActuelle: blocActif.semaineActuelle,
          }
        : null,
      prochaineSeance: seanceSuivante,
      feuJour,
      feuTendance,
      // Renvoyait un tableau vide en dur : le moteur d'alertes tournait dans le
      // vide, ses agrégats n'étant calculés nulle part.
      alertesPreSeance: await alertes(userId),
      poids30jours: poids30jours.slice(0, 30).map((bw) => ({
        date: bw.date,
        poids: bw.poids,
      })),
      precalcSession: precalcSession ? { contenu: precalcSession.contenu } : null,
      weeklyDebrief: weeklyDebrief
        ? { contenu: weeklyDebrief.contenu, weekStart: weeklyDebrief.weekStart }
        : (lastWeekDebrief ? { contenu: lastWeekDebrief.contenu, weekStart: lastWeekDebrief.weekStart } : null),
      recentSessions: recentSessionsWithData,
    });
  } catch (error) {
    // Le message etait constant : toute panne — colonne absente, service en
    // echec, requete invalide — se presentait de la meme facon, et le client
    // n'avait aucun moyen de dire ce qui avait casse.
    const detail = detailErreur(error);
    console.error("[api/dashboard]", detail, error);
    return NextResponse.json({ error: `Chargement du tableau de bord : ${detail}` }, { status: 500 });
  }
}