import { db } from "@/db/client";
import { sessionLogs, dailyStates, bodyWeights, seanceTemplates, precalcSessions, weeklyDebriefs, gyms, exerciseInstances } from "@/db/schema";
import { machinesUtilisablesAujourdhui, seancesRealisees } from "@/db/archivage";
import { eq, desc, and, inArray, isNull, gte } from "drizzle-orm";
import { computeFeuJour, etatPourLeMoteur } from "@/lib/engine/feu-biologique";
import { alertes } from "@/services/progression";
import { vueDuProgramme } from "@/services/cycle";
import { prochaineSeance } from "@/services/programmes";
import { choisirSalleDuJour, etatDuJour } from "@/lib/engine/etat-du-jour";
import { lireBlocs } from "@/services/blocs";
import { memoireEmpechements } from "@/services/memoire";
import { exercicesRealisables, statutInventaire } from "@/lib/engine/disponibilite";


/**
 * Tout ce qu'affiche l'accueil, en une lecture.
 *
 * Ces lectures vivaient dans la route HTTP, et l'écran d'accueil était un
 * composant client qui l'appelait APRÈS son montage. La chaîne complète était
 * donc : HTML, puis JavaScript, puis requête, puis rendu — quatre étapes en
 * série avant le premier chiffre à l'écran, chacune payant sa latence.
 *
 * Le service est ici pour que la page serveur et la route lisent exactement la
 * même chose. La route reste : le service worker et les appels différés s'en
 * servent, et deux implémentations auraient divergé.
 */
export async function donneesTableauDeBord(userId: string) {
    const todayStr = new Date().toISOString().slice(0, 10);

    const now = new Date();
    const startOfWeek = new Date(now);
    // `- getDay() + 1` plaçait le dimanche (getDay() === 0) au lundi SUIVANT :
    // le début de semaine tombait dans le futur, et le décompte des séances
    // valait zéro tous les dimanches.
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekStartStr = startOfWeek.toISOString().slice(0, 10);

    const lastWeekStart = new Date(startOfWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStartStr = lastWeekStart.toISOString().slice(0, 10);

    /**
     * Deux lectures que trois consommateurs se partagent.
     *
     * `vueDuProgramme` et `alertes` sont appelées côte à côte ci-dessous, et
     * l'accueil lisait en plus le bloc actif pour son propre compte. Résultat :
     * `programme_blocs` interrogée quatre fois et `session_plan_items` deux
     * fois pour un seul affichage, avec les mêmes critères à chaque fois. On
     * les lit ici, une fois, et on les passe.
     */
    const [blocs, memoire] = await Promise.all([
      lireBlocs(userId),
      memoireEmpechements(userId, todayStr),
    ]);
    const blocActif = blocs.actif;

    /**
     * Tout ce qui ne dépend que de `userId`, d'un coup.
     *
     * Ces lectures étaient écrites l'une après l'autre, chacune précédée d'un
     * `await`. Aucune n'attendait la précédente : elles ne partageaient que
     * l'identifiant de l'utilisateur, connu dès la première ligne. La base
     * vivant dans une autre région que la fonction, chaque aller-retour coûte
     * quelques dizaines de millisecondes — et le fait de les enchaîner les
     * additionnait toutes au lieu de les superposer.
     *
     * Les trois services appelés ici gardent leur propre séquentialité
     * interne ; ce qui change, c'est qu'ils ne s'attendent plus entre eux.
     */
    const [
      user, lastWeight, lastSession, suite, dailyStateToday,
      poids30jours, precalcSession, weeklyDebrief, debriefSemainePrecedente,
      recentSessions, seancesDeLaSemaine, vueProgramme, alertesPreSeance,
    ] = await Promise.all([
      db.query.users.findFirst({ where: (users, { eq }) => eq(users.id, userId) }),
      db.query.bodyWeights.findFirst({
        where: eq(bodyWeights.userId, userId),
        orderBy: [desc(bodyWeights.date)],
      }),
      db.query.sessionLogs.findFirst({
        where: seancesRealisees(userId),
        orderBy: [desc(sessionLogs.createdAt)],
      }),
      // La rotation était dupliquée ici, avec le même défaut qu'ailleurs :
      // lettres A/B/C en dur, cycle figé à trois séances. Elle passe par le
      // service, qui s'appuie sur `ordreDansSemaine` et le nombre réel de
      // séances du bloc.
      prochaineSeance(userId),
      db.query.dailyStates.findFirst({
        where: and(eq(dailyStates.userId, userId), eq(dailyStates.date, todayStr)),
      }),
      db.query.bodyWeights.findMany({
        where: eq(bodyWeights.userId, userId),
        orderBy: [desc(bodyWeights.date)],
      }),
      db.query.precalcSessions.findFirst({
        where: and(eq(precalcSessions.userId, userId), eq(precalcSessions.targetDate, todayStr)),
      }),
      db.query.weeklyDebriefs.findFirst({
        where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, weekStartStr)),
      }),
      // Le débrief de la semaine passée n'était lu qu'en l'absence de celui de
      // la semaine en cours. Le lire toujours coûte une requête menée en
      // parallèle plutôt qu'un aller-retour supplémentaire mis bout à bout —
      // et le choix entre les deux se fait ensuite, en mémoire.
      db.query.weeklyDebriefs.findFirst({
        where: and(eq(weeklyDebriefs.userId, userId), eq(weeklyDebriefs.weekStart, lastWeekStartStr)),
      }),
      db.query.sessionLogs.findMany({
        where: seancesRealisees(userId),
        orderBy: [desc(sessionLogs.createdAt)],
        limit: 5,
      }),
      db.query.sessionLogs.findMany({
        columns: { date: true },
        where: and(
          seancesRealisees(userId),
          gte(sessionLogs.date, weekStartStr),
        ),
      }),
      vueDuProgramme(userId, todayStr, { blocs, memoire }),
      alertes(userId, { blocs, memoire }),
    ]);

    const seanceSuivante = suite
      ? { lettre: suite.template.lettre, templateId: suite.template.id, templateNom: suite.template.nom }
      : { lettre: "", templateId: "", templateNom: "Aucune séance programmée" };

    const lastWeekDebrief = weeklyDebrief ? null : debriefSemainePrecedente;

    let feuJour: "vert" | "orange" | "rouge" | null = null;
    if (dailyStateToday) {
      // Mêmes valeurs par défaut que le constructeur de séance : le tableau de
      // bord annonçait un feu que la séance pouvait ensuite contredire.
      feuJour = computeFeuJour(etatPourLeMoteur(dailyStateToday)).feu;
    }

    let feuTendance: "vert" | "orange" | "rouge" | null = null;
    if (lastSession?.feuBiologiqueTendance) {
      const f = lastSession.feuBiologiqueTendance;
      if (f === "vert" || f === "orange" || f === "rouge") {
        feuTendance = f;
      }
    }

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

    /**
     * Salle du jour : la préférence posée à l'onboarding, sinon l'unique salle
     * DU COMPTE. L'accueil envoyait jusqu'ici `gymId=` vide, et la séance ne
     * pouvait pas démarrer.
     *
     * La règle vit désormais dans le moteur, avec sa démonstration. Ici, elle
     * comptait toutes les salles lisibles — et la lecture est commune à tous
     * les comptes, par décision de schéma : un compte sans aucun lieu pouvait
     * donc hériter de celui d'un autre. La règle 1 (désigner explicitement la
     * salle où l'on va, même tenue par quelqu'un d'autre) est intacte.
     */
    const salleDuJour = choisirSalleDuJour(
      { id: userId, prefSalleParDefautId: user?.prefSalleParDefautId ?? null },
      sallesUtilisateur,
    );

    // Compter les appareils décrits sous-estimait ce qu'un lieu permet : une
    // salle dont le matériel est coché, ou une maison où l'on fait des pompes,
    // s'affichait « vide » et renvoyait l'utilisateur saisir du matériel.
    /**
     * Combien d'exercices ce lieu permet, et a-t-on dit quoi que ce soit de lui.
     *
     * Deux corrections de coût ici, sans aucun changement de résultat.
     *
     * Le catalogue était lu avec sept colonnes — dont `muscles_principaux`, un
     * tableau JSON — pour les cent vingt exercices, alors que seul le NOMBRE
     * d'exercices faisables est renvoyé. Les quatre colonnes servant à décrire
     * les entrées rendues étaient chargées puis jetées. Trois suffisent à
     * compter : l'identifiant, la famille de matériel et le slug.
     *
     * Et l'appareil décrit était compté une seconde fois par un `$count` dont
     * le filtre était le même, au mot près, que la lecture des instances qui
     * venait de se faire. Un aller-retour pour une information déjà en main.
     */
    const inventaireDuJour = salleDuJour
      ? await Promise.all([
          db.query.exercises.findMany({
            columns: { id: true, equipement: true, slug: true },
          }),
          db.query.exerciseInstances.findMany({
            where: and(
              eq(exerciseInstances.gymId, salleDuJour.id),
              machinesUtilisablesAujourdhui(),
            ),
            columns: { id: true, exerciseId: true, machineNom: true, incrementsPossibles: true },
          }),
        ])
      : null;

    const exercicesRealisablesIci = salleDuJour && inventaireDuJour
      ? exercicesRealisables({
          catalogue: inventaireDuJour[0].map((e) => ({
            ...e, nom: "", pilier: "", categorieRole: "", musclesPrincipaux: [],
          })),
          equipementsDuLieu: salleDuJour.equipementsDisponibles ?? [],
          statut: statutInventaire(salleDuJour.inventaireStatut),
          // Le matériel emporté aujourd'hui compte comme présent, sans être
          // inscrit au lieu : des élastiques dans un sac ne sont pas ceux de
          // la salle.
          equipementsApportes: dailyStateToday?.materielApporte ?? [],
          instances: inventaireDuJour[1].map((i) => ({
            ...i, incrementsPossibles: i.incrementsPossibles ?? [],
          })),
        }).length
      : 0;

    // Décrit veut dire : quelqu'un s'est prononcé sur ce lieu — en cochant du
    // matériel, fût-ce aucun, ou en décrivant un appareil.
    const lieuRenseigne = salleDuJour
      ? salleDuJour.equipementsDisponibles !== null || (inventaireDuJour?.[1].length ?? 0) > 0
      : false;

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

    return {
      etat,
      user: {
        nom: user?.nom ?? "Sacha",
        poidsActuel: lastWeight?.poids ?? null,
      },
      // Le raccourci vers l'écran Programme, avec exactement ce qu'il faut
      // pour l'annoncer — et rien de plus. Les valeurs viennent du même
      // service que l'écran lui-même : les deux ne peuvent pas diverger.
      blocActif: vueProgramme.cycle
        ? {
            nom: vueProgramme.cycle.nom,
            libelleCycle: vueProgramme.cycle.libelle.libelle,
            semaine: vueProgramme.cycle.position.semaine,
            semainesTotal: vueProgramme.cycle.position.semainesTotal,
            enCalibration: vueProgramme.etat === "calibration",
            seancesFaites: vueProgramme.cycle.seancesFaites,
            seancesDeLaSemaine: vueProgramme.semaine.length,
          }
        : null,
      prochaineSeance: seanceSuivante,
      feuJour,
      feuTendance,
      // Renvoyait un tableau vide en dur : le moteur d'alertes tournait dans le
      // vide, ses agrégats n'étant calculés nulle part.
      alertesPreSeance,
      poids30jours: poids30jours.slice(0, 30).map((bw) => ({
        date: bw.date,
        poids: bw.poids,
      })),
      precalcSession: precalcSession ? { contenu: precalcSession.contenu } : null,
      weeklyDebrief: weeklyDebrief
        ? { contenu: weeklyDebrief.contenu, weekStart: weeklyDebrief.weekStart }
        : (lastWeekDebrief ? { contenu: lastWeekDebrief.contenu, weekStart: lastWeekDebrief.weekStart } : null),
      recentSessions: recentSessionsWithData,
    };
}
