import { cache } from "react";
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
import { phase } from "@/lib/mesure/trace";
import { contexteEssentiel, inventaireDuLieu } from "@/services/tableau-de-bord-lecture";

/**
 * L'accueil, coupé en deux : ce qu'on attend, et ce qui peut arriver après.
 *
 * L'écran lisait tout d'un bloc — une trentaine de requêtes sérialisées par
 * `max: 1`, toutes attendues avant le premier pixel. Or la moitié ne sert pas
 * à décider quoi faire aujourd'hui : `vueDuProgramme` (huit requêtes) alimente
 * un raccourci, `alertes` (dix requêtes) une carte qu'on lit après coup, les
 * débriefs et l'historique récent encore moins.
 *
 * D'où deux fonctions. `essentielTableauDeBord` rend ce dont dépend la
 * décision : qui on est, l'état du jour, la séance à faire, le feu.
 * `complementTableauDeBord` rend le reste, derrière une limite de suspension.
 * Le travail total ne diminue pas — ce n'est pas le but : ce qui diminue,
 * c'est le travail BLOQUANT, celui qui retient l'affichage.
 *
 * `donneesTableauDeBord` reste, et vaut exactement les deux réunies : la route
 * `/api/dashboard` et les tests d'intégration la lisent, et deux formes
 * différentes auraient divergé.
 */

/** Le jour courant, au format des colonnes `date` (texte ISO). */
function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Le lundi de la semaine en cours, et celui de la précédente. */
function bornesSemaine(): { debut: string; debutPrecedente: string } {
  const now = new Date();
  const startOfWeek = new Date(now);
  // `- getDay() + 1` plaçait le dimanche (getDay() === 0) au lundi SUIVANT :
  // le début de semaine tombait dans le futur, et le décompte des séances
  // valait zéro tous les dimanches.
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const precedente = new Date(startOfWeek);
  precedente.setDate(precedente.getDate() - 7);
  return {
    debut: startOfWeek.toISOString().slice(0, 10),
    debutPrecedente: precedente.toISOString().slice(0, 10),
  };
}

/**
 * Les lectures que les deux moitiés se partagent.
 *
 * `cache()` de React mémoïse pour la DURÉE D'UN RENDU, et pour lui seul. Deux
 * requêtes HTTP concurrentes gardent chacune la sienne ; rien ne survit d'une
 * requête à l'autre ; aucune donnée d'un compte ne peut atteindre le rendu d'un
 * autre. Ce n'est pas un cache de données : c'est la déduplication d'un appel
 * identique dans un même arbre.
 *
 * Sans elle, découper l'accueil en deux branches ferait relire `programme_blocs`
 * et la mémoire des empêchements une fois par branche — le découpage coûterait
 * plus qu'il ne rapporte.
 *
 * `lireBlocs` et `memoireEmpechements` gardent, elles, leur sémantique de
 * lecture franche : une écriture suivie d'une relecture, ailleurs dans
 * l'application, voit toujours son effet.
 */
const contexteCommun = cache(async (userId: string, todayStr: string) => {
  const [blocs, memoire] = await Promise.all([
    lireBlocs(userId),
    memoireEmpechements(userId, todayStr),
  ]);
  return { blocs, memoire };
});

/**
 * Le catalogue des lieux, lu une fois par rendu.
 *
 * L'état du jour a besoin de la salle ; l'historique récent a besoin des noms
 * de salle. Les deux moitiés lisaient donc la même table. La lecture est sans
 * filtre de propriétaire par décision de schéma — une salle et son inventaire
 * sont une ressource partagée, `user_id` désigne qui l'entretient — et c'est
 * `choisirSalleDuJour` qui refuse d'attribuer à quelqu'un une salle qu'il n'a
 * pas désignée.
 */
const lireSalles = cache(async () =>
  db.query.gyms.findMany({ where: isNull(gyms.archiveLe) }),
);

export type EssentielTableauDeBord = Awaited<ReturnType<typeof essentielTableauDeBord>>;
export type ComplementTableauDeBord = Awaited<ReturnType<typeof complementTableauDeBord>>;

/**
 * Ce qui doit être à l'écran tout de suite.
 *
 * Le critère n'est pas « ce qui est rapide » mais « ce dont dépend la décision
 * de l'utilisateur en ouvrant l'application » : son identité, l'état du jour,
 * la séance à faire, son feu. Tout le reste attend.
 *
 * Treize allers-retours vers la base, devenus DEUX. Le premier lit tout ce qui
 * ne dépend que du compte ; le second le parc du lieu, une fois ce lieu choisi
 * — et il ne part que s'il y a un lieu. Le découpage vient de là, pas d'une
 * limite technique : `choisirSalleDuJour` est une règle métier, avec sa
 * démonstration, et on ne la réécrit pas en SQL pour gagner un aller-retour.
 *
 * Toutes les règles restent en TypeScript. La base ne fait que lire.
 */
export async function essentielTableauDeBord(userId: string) {
  const todayStr = aujourdhui();
  const { debut: weekStartStr } = bornesSemaine();

  const contexte = await phase("calcul", "contexteEssentiel", () =>
    contexteEssentiel(userId, todayStr, weekStartStr),
  );

  /**
   * La rotation, à partir de ce qui vient d'être lu.
   *
   * `prochaineSeance()` faisait trois requêtes pour ça — le bloc actif (déjà
   * lu), ses gabarits, et le dernier gabarit clos. La règle, elle, ne change
   * pas : le gabarit suivant celui de la dernière séance close, dans l'ordre
   * de la semaine, en repartant du premier une fois le tour fini.
   */
  const gabarits = contexte.gabarits;
  const indexPrecedent = contexte.dernierGabaritId
    ? gabarits.findIndex((g) => g.id === contexte.dernierGabaritId)
    : -1;
  const suivante = gabarits.length > 0
    ? gabarits[(indexPrecedent + 1) % gabarits.length]!
    : null;

  const seanceSuivante = suivante
    ? { lettre: suivante.lettre ?? "", templateId: suivante.id, templateNom: suivante.nom }
    : { lettre: "", templateId: "", templateNom: "Aucune séance programmée" };

  let feuJour: "vert" | "orange" | "rouge" | null = null;
  if (contexte.etatDuJour) {
    // Mêmes valeurs par défaut que le constructeur de séance : le tableau de
    // bord annonçait un feu que la séance pouvait ensuite contredire.
    feuJour = computeFeuJour(etatPourLeMoteur(contexte.etatDuJour)).feu;
  }

  let feuTendance: "vert" | "orange" | "rouge" | null = null;
  const f = contexte.feuTendance;
  if (f === "vert" || f === "orange" || f === "rouge") feuTendance = f;

  /**
   * Salle du jour : la préférence posée à l'onboarding, sinon l'unique salle
   * DU COMPTE. L'accueil envoyait jusqu'ici `gymId=` vide, et la séance ne
   * pouvait pas démarrer.
   *
   * La règle vit dans le moteur, avec sa démonstration. La lecture des salles
   * est commune à tous les comptes, par décision de schéma : un compte sans
   * aucun lieu pouvait donc hériter de celui d'un autre. La règle 1 (désigner
   * explicitement la salle où l'on va, même tenue par quelqu'un d'autre) est
   * intacte.
   */
  const salleDuJour = choisirSalleDuJour(
    { id: userId, prefSalleParDefautId: contexte.utilisateur?.prefSalleParDefautId ?? null },
    contexte.salles,
  );

  // Compter les appareils décrits sous-estimait ce qu'un lieu permet : une
  // salle dont le matériel est coché, ou une maison où l'on fait des pompes,
  // s'affichait « vide » et renvoyait l'utilisateur saisir du matériel.
  const inventaire = salleDuJour
    ? await phase("calcul", "inventaireDuLieu", () => inventaireDuLieu(salleDuJour.id))
    : null;

  const exercicesRealisablesIci = salleDuJour && inventaire
    ? exercicesRealisables({
        catalogue: inventaire.catalogue.map((e) => ({
          ...e, nom: "", pilier: "", categorieRole: "", musclesPrincipaux: [],
        })),
        equipementsDuLieu: salleDuJour.equipementsDisponibles ?? [],
        statut: statutInventaire(salleDuJour.inventaireStatut),
        // Le matériel emporté aujourd'hui compte comme présent, sans être
        // inscrit au lieu : des élastiques dans un sac ne sont pas ceux de
        // la salle.
        equipementsApportes: contexte.etatDuJour?.materielApporte ?? [],
        instances: inventaire.instances.map((i) => ({
          ...i, incrementsPossibles: i.incrementsPossibles ?? [],
        })),
      }).length
    : 0;

  // Décrit veut dire : quelqu'un s'est prononcé sur ce lieu — en cochant du
  // matériel, fût-ce aucun, ou en décrivant un appareil.
  const lieuRenseigne = salleDuJour
    ? salleDuJour.equipementsDisponibles !== null || (inventaire?.instances.length ?? 0) > 0
    : false;

  const etat = etatDuJour({
    salle: salleDuJour ? { id: salleDuJour.id, nom: salleDuJour.nom } : null,
    exercicesRealisablesIci,
    lieuRenseigne,
    prochaineSeance: suivante
      ? { templateId: suivante.id, lettre: suivante.lettre ?? "", nom: suivante.nom }
      : null,
    seanceFaiteAujourdhui: contexte.semaine.includes(todayStr),
    enCalibration: contexte.blocActif?.typeCycle === "calibration",
    seancesCetteSemaine: contexte.semaine.length,
    frequenceMaxParSemaine: contexte.utilisateur?.frequenceMaxParSemaine ?? null,
  });

  return {
    etat,
    user: {
      nom: contexte.utilisateur?.nom ?? "Sacha",
      poidsActuel: contexte.poids[0]?.poids ?? null,
    },
    prochaineSeance: seanceSuivante,
    feuJour,
    feuTendance,
    poids30jours: contexte.poids,
  };
}

/**
 * Ce qui peut arriver une seconde plus tard.
 *
 * Aucune de ces lectures ne change ce que l'utilisateur va faire dans la
 * minute : le raccourci vers le programme, les alertes, la séance de demain,
 * les débriefs, l'historique récent. Ensemble elles pèsent une vingtaine de
 * requêtes — l'essentiel du temps de l'ancien accueil.
 */
export async function complementTableauDeBord(userId: string) {
  const todayStr = aujourdhui();
  const { debut: weekStartStr, debutPrecedente: lastWeekStartStr } = bornesSemaine();

  const { blocs, memoire } = await contexteCommun(userId, todayStr);

  const [
    precalcSession, weeklyDebrief, debriefSemainePrecedente,
    recentSessions, vueProgramme, alertesPreSeance, salles,
  ] = await Promise.all([
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
    phase("calcul", "vueDuProgramme", () => vueDuProgramme(userId, todayStr, { blocs, memoire })),
    phase("calcul", "alertes", () => alertes(userId, { blocs, memoire })),
    lireSalles(),
  ]);

  const lastWeekDebrief = weeklyDebrief ? null : debriefSemainePrecedente;

  // Une requete par seance et par jointure : jusqu'a dix appels concurrents
  // pour cinq lignes, la ou deux lectures groupees suffisent.
  // `seanceTemplates` ne porte pas d'`user_id` : une lecture sans filtre
  // remonterait les gabarits de tout le monde. On ne lit que les identifiants
  // effectivement cites par les seances de cet utilisateur.
  const idsGabarits = [...new Set(recentSessions.map((s) => s.seanceTemplateId).filter((v): v is string => Boolean(v)))];
  const gabaritsUtilisateur = idsGabarits.length
    ? await db.query.seanceTemplates.findMany({ where: inArray(seanceTemplates.id, idsGabarits) })
    : [];

  const salleParId = new Map(salles.map((g) => [g.id, g]));
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

  return {
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
    // Renvoyait un tableau vide en dur : le moteur d'alertes tournait dans le
    // vide, ses agrégats n'étant calculés nulle part.
    alertesPreSeance,
    precalcSession: precalcSession ? { contenu: precalcSession.contenu } : null,
    weeklyDebrief: weeklyDebrief
      ? { contenu: weeklyDebrief.contenu, weekStart: weeklyDebrief.weekStart }
      : (lastWeekDebrief ? { contenu: lastWeekDebrief.contenu, weekStart: lastWeekDebrief.weekStart } : null),
    recentSessions: recentSessionsWithData,
  };
}

/**
 * Les deux moitiés réunies, dans la forme historique.
 *
 * La route `/api/dashboard` sert le service worker et les appels différés :
 * elle n'a pas de limite de suspension à offrir, et veut donc l'ensemble.
 * Les deux appels partagent leurs lectures communes par `cache()`, si bien que
 * le total de requêtes ne dépasse pas celui d'avant le découpage.
 */
export async function donneesTableauDeBord(userId: string) {
  const [essentiel, complement] = await Promise.all([
    essentielTableauDeBord(userId),
    complementTableauDeBord(userId),
  ]);
  return { ...essentiel, ...complement };
}
