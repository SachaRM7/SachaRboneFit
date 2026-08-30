/**
 * Construction des séances de la phase de calibration.
 *
 * C'est le chaînon qui manquait : l'écran de démarrage exigeait un gabarit
 * existant et répondait « Aucun programme actif. Crée un bloc et ses séances. »
 * à quelqu'un qui venait précisément de terminer son onboarding. Rien ne
 * fabriquait ces séances à partir du matériel réellement présent.
 *
 * Ce que fait la calibration, et ce qu'elle ne fait pas :
 *
 * — Elle mesure. Deux séries par exercice, jamais près de l'échec, une réserve
 *   demandée après chaque série. Un cycle d'accumulation viendra ensuite, quand
 *   les charges seront connues ; le démarrer maintenant reviendrait à programmer
 *   une progression à partir de chiffres inventés.
 * — Elle couvre. Sur peu de séances, la priorité est de toucher chaque pilier
 *   au moins une fois : on ne peut pas calibrer ce qu'on n'a pas fait.
 * — Elle n'invente rien. Un pilier que la salle ne permet pas de travailler
 *   n'est pas remplacé par un exercice absent : il est signalé.
 */

export interface MachineDisponible {
  instanceId: string;
  exerciceId: string;
  nom: string;
  pilier: string;
  categorieRole: string;
  musclesPrincipaux: string[];
  /** Famille de matériel, pour départager selon la préférence déclarée. */
  equipement?: string | null;
}

export interface EntreePlanCalibration {
  machines: MachineDisponible[];
  frequenceCibleParSemaine: number;
  dureeSeanceCibleMinutes: number;
  /** Muscles que l'utilisateur veut prioriser : départage à couverture égale. */
  musclesPrioritaires?: string[];
  /**
   * Exercices refusés à l'onboarding.
   *
   * Des identifiants depuis que la saisie passe par le catalogue. Les noms
   * restent acceptés : les profils enregistrés avant ce changement en
   * contiennent, et les oublier reviendrait à reproposer silencieusement un
   * exercice que quelqu'un avait écarté.
   */
  exercicesRefuses?: string[];
  /**
   * Préférence déclarée : machines, poids libres, mélange, peu importe.
   * Départage à fidélité égale, sans jamais écarter un exercice — une
   * préférence n'est pas une contrainte.
   */
  preferenceMateriel?: string;
  /** Muscles déclarés sensibles : écartés de la calibration. */
  musclesSensibles?: string[];
}

export interface ExerciceDeSeance {
  instanceId: string;
  ordre: number;
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number;
  reposSecondes: number;
}

export interface SeanceCalibration {
  lettre: string;
  nom: string;
  ordreDansSemaine: number;
  exercices: ExerciceDeSeance[];
}

export interface PlanCalibration {
  seances: SeanceCalibration[];
  /** Piliers qu'aucune machine de la salle ne permet de travailler. */
  piliersNonCouverts: string[];
  avertissements: string[];
}

/**
 * Ordre de passage des piliers dans une séance. Les mouvements les plus
 * exigeants viennent en premier : une mesure faite en fin de séance, sur un
 * muscle déjà fatigué, ne mesure pas la même chose.
 */
export const ORDRE_PILIERS = [
  "P3_squat",
  "P1_poussee",
  "P2_tirage",
  "P4_hanche",
  "epaules",
  "jambes_iso",
  "bras_triceps",
  "bras_biceps",
  "core",
] as const;

/** Familles rangées de part et d'autre de la préférence « machines / poids libres ». */
const FAMILLES_MACHINE = new Set(["machine", "poulie"]);
const FAMILLES_LIBRE = new Set(["barre", "halteres", "kettlebell", "disque", "poids_du_corps"]);

/** 0 quand l'exercice va dans le sens de la préférence, 1 sinon. */
function ecartPreference(equipement: string | null | undefined, preference?: string): number {
  if (!preference || preference === "aucune" || preference === "melange" || !equipement) return 0;
  if (preference === "machines") return FAMILLES_MACHINE.has(equipement) ? 0 : 1;
  if (preference === "poids_libres") return FAMILLES_LIBRE.has(equipement) ? 0 : 1;
  return 0;
}

/** Un rôle de pilier se mesure avant son substitut, qui passe avant un accessoire. */
const RANG_ROLE: Record<string, number> = { pilier: 0, substitut: 1, accessoire: 2 };

const LETTRES = ["A", "B", "C", "D", "E", "F"];

/** Deux séries suffisent à situer une charge, et ne coûtent pas de récupération. */
export const SERIES_CALIBRATION = 2;
/** RPE 7 : trois répétitions en réserve. On ne cherche pas l'échec ici. */
export const RPE_CALIBRATION = 7;

const borner = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Combien d'exercices tiennent dans la durée visée.
 * Dix minutes d'échauffement, puis environ neuf minutes par exercice de deux
 * séries, repos compris.
 */
export function nombreDExercices(dureeMinutes: number): number {
  return borner(Math.round((dureeMinutes - 10) / 9), 3, 7);
}

export function planCalibration(e: EntreePlanCalibration): PlanCalibration {
  // Identifiants et noms cohabitent : on indexe les deux formes.
  const refuses = new Set(
    (e.exercicesRefuses ?? []).flatMap((v) => [v, v.toLowerCase().trim()]),
  );
  const sensibles = new Set(e.musclesSensibles ?? []);
  const prioritaires = new Set(e.musclesPrioritaires ?? []);

  const utilisables = e.machines.filter((m) => {
    if (refuses.has(m.exerciceId) || refuses.has(m.nom.toLowerCase().trim())) return false;
    // Un exercice dont tous les muscles principaux sont sensibles est écarté.
    // S'il en sollicite d'autres, il reste proposable : une gêne à l'épaule
    // n'interdit pas de mesurer les jambes.
    const muscles = m.musclesPrincipaux ?? [];
    if (muscles.length > 0 && muscles.every((mu) => sensibles.has(mu))) return false;
    return true;
  });

  const parPilier = new Map<string, MachineDisponible[]>();
  for (const m of utilisables) {
    const liste = parPilier.get(m.pilier) ?? [];
    liste.push(m);
    parPilier.set(m.pilier, liste);
  }
  for (const [pilier, liste] of parPilier) {
    liste.sort((a, b) => {
      const parRole = (RANG_ROLE[a.categorieRole] ?? 3) - (RANG_ROLE[b.categorieRole] ?? 3);
      if (parRole !== 0) return parRole;
      const prioA = (a.musclesPrincipaux ?? []).some((mu) => prioritaires.has(mu)) ? 0 : 1;
      const prioB = (b.musclesPrincipaux ?? []).some((mu) => prioritaires.has(mu)) ? 0 : 1;
      if (prioA !== prioB) return prioA - prioB;
      // La préférence départage en dernier recours : elle oriente le choix
      // entre deux exercices également valables, elle n'en écarte aucun.
      const prefA = ecartPreference(a.equipement, e.preferenceMateriel);
      const prefB = ecartPreference(b.equipement, e.preferenceMateriel);
      if (prefA !== prefB) return prefA - prefB;
      // Tri final par identifiant : le plan doit être reproductible.
      return a.instanceId.localeCompare(b.instanceId);
    });
    parPilier.set(pilier, liste);
  }

  const piliersConnus = ORDRE_PILIERS.filter((p) => (parPilier.get(p)?.length ?? 0) > 0);
  const piliersNonCouverts = ORDRE_PILIERS.filter((p) => !piliersConnus.includes(p));

  const avertissements: string[] = [];
  const nbSeances = borner(Math.round(e.frequenceCibleParSemaine), 1, LETTRES.length);
  const parSeance = nombreDExercices(e.dureeSeanceCibleMinutes);

  if (utilisables.length === 0) {
    avertissements.push(
      e.machines.length === 0
        ? "Aucun exercice renseigné dans cette salle."
        : "Tous les exercices de cette salle sont écartés par tes contraintes.",
    );
    return { seances: [], piliersNonCouverts: [...ORDRE_PILIERS], avertissements };
  }

  // Curseur par pilier : d'une séance à l'autre, on mesure une autre machine du
  // même pilier quand la salle en offre plusieurs. Deux séances identiques
  // mesureraient deux fois la même chose.
  const curseur = new Map<string, number>();
  const seances: SeanceCalibration[] = [];

  for (let i = 0; i < nbSeances; i++) {
    const exercices: ExerciceDeSeance[] = [];
    const dejaPris = new Set<string>();

    // Chaque séance reprend les piliers là où la précédente s'est arrêtée.
    // Décaler d'un seul rang par séance laissait les derniers piliers — les
    // bras, le gainage — hors de toute mesure : avec six exercices sur neuf
    // piliers, trois séances ne dépassaient jamais le huitième.
    const depart = (i * parSeance) % piliersConnus.length;
    const ordre = piliersConnus.map(
      (_, k) => piliersConnus[(depart + k) % piliersConnus.length]!,
    );
    // On rétablit ensuite l'ordre d'exécution : la rotation choisit quoi
    // mesurer, pas dans quel ordre le faire.
    const retenus: MachineDisponible[] = [];

    for (const pilier of ordre) {
      if (retenus.length >= parSeance) break;
      const liste = parPilier.get(pilier)!;
      const depart = curseur.get(pilier) ?? 0;
      let choisi: MachineDisponible | undefined;
      for (let k = 0; k < liste.length; k++) {
        const candidat = liste[(depart + k) % liste.length]!;
        if (!dejaPris.has(candidat.instanceId)) {
          choisi = candidat;
          curseur.set(pilier, (depart + k + 1) % liste.length);
          break;
        }
      }
      if (!choisi) continue;
      dejaPris.add(choisi.instanceId);
      retenus.push(choisi);
    }

    retenus.sort(
      (a, b) =>
        ORDRE_PILIERS.indexOf(a.pilier as (typeof ORDRE_PILIERS)[number]) -
        ORDRE_PILIERS.indexOf(b.pilier as (typeof ORDRE_PILIERS)[number]),
    );

    retenus.forEach((m, k) => {
      exercices.push({
        instanceId: m.instanceId,
        ordre: k + 1,
        seriesCibles: SERIES_CALIBRATION,
        // Une fourchette large : on cherche la charge, pas encore la précision.
        fourchetteRepsMin: 8,
        fourchetteRepsMax: 12,
        rpeCible: RPE_CALIBRATION,
        reposSecondes: 120,
      });
    });

    seances.push({
      lettre: LETTRES[i]!,
      nom: `Calibration ${LETTRES[i]}`,
      ordreDansSemaine: i + 1,
      exercices,
    });
  }

  if (piliersNonCouverts.length > 0) {
    avertissements.push(
      `Rien pour : ${piliersNonCouverts.join(", ")}. Ajoute ce que tu trouves en salle.`,
    );
  }
  const tropCourt = seances.find((s) => s.exercices.length < parSeance);
  if (tropCourt) {
    avertissements.push(
      "La salle offre moins d'exercices que ta durée de séance ne le permettrait.",
    );
  }

  return { seances, piliersNonCouverts, avertissements };
}
