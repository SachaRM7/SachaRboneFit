import { pgTable, uuid, text, boolean, timestamp, real, integer, bigint, jsonb, date, unique, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { FicheTechnique, TypeReglage } from "@/lib/engine/execution";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").unique().notNull(),
  nom: text("nom"),
  dateNaissance: date("date_naissance"),
  taille: integer("taille"),
  /**
   * 'homme' | 'femme' | 'non_precise'.
   *
   * `NULL` et `non_precise` ne disent pas la même chose : jamais demandé, et
   * demandé sans réponse. Le moteur doit fonctionner dans les deux cas — rien
   * ne se calcule à partir d'une valeur par défaut inventée.
   *
   * Le poids, lui, n'a pas de colonne ici : sa source est `body_weights`, qui
   * est datée. Une seconde source diverge dès la deuxième pesée.
   */
  sexe: text("sexe"),
  phaseNutritionnelle: text("phase_nutritionnelle"),
  objectifChiffre: text("objectif_chiffre"),
  dateCible: date("date_cible"),
  // Objectif structure : `objectifChiffre` restait un texte libre, inexploitable
  // par le moteur. Ces colonnes le rendent lisible par le code.
  objectifType: text("objectif_type"),
  objectifMusclesPrioritaires: jsonb("objectif_muscles_prioritaires").$type<string[]>(),
  frequenceCibleParSemaine: integer("frequence_cible_par_semaine"),
  /**
   * Fourchette de frequence, et non une valeur unique.
   *
   * Un programme construit sur une seule frequence s'effondre des qu'une
   * seance est manquee. Connaitre le minimum realiste permet de le degrader
   * proprement, et le maximum d'utiliser une semaine plus disponible.
   */
  frequenceMinParSemaine: integer("frequence_min_par_semaine"),
  frequenceMaxParSemaine: integer("frequence_max_par_semaine"),
  dureeSeanceCibleMinutes: integer("duree_seance_cible_minutes"),
  dureeSeanceMaxMinutes: integer("duree_seance_max_minutes"),

  /** 'debutant' | 'intermediaire' | 'avance' — l'aisance technique, pas la performance. */
  niveauExperience: text("niveau_experience"),
  anneesDePratique: integer("annees_de_pratique"),
  /**
   * Mois d'interruption declares a l'inscription.
   *
   * Au-dela de deux, la programmation part en reprise : les schemas moteurs
   * reviennent vite, la tolerance au volume beaucoup moins. On ne demande
   * jamais les anciennes charges — cette application est un nouveau depart.
   */
  moisDInterruption: integer("mois_d_interruption"),

  /** 'machines' | 'poids_libres' | 'melange' | 'aucune'. */
  preferenceMateriel: text("preference_materiel"),
  /**
   * Materiel personnel qu'on emporte d'ordinaire. Propose coche au demarrage :
   * quelqu'un qui a toujours ses elastiques ne doit pas le redire chaque fois.
   */
  materielPersonnelHabituel: jsonb("materiel_personnel_habituel").$type<string[]>(),
  /**
   * Exercices dont l'utilisateur ne veut pas.
   *
   * Identifiants du catalogue, et des NOMS pour les profils enregistrés avant
   * ce changement — `lib/engine/refus.ts` reconnaît les deux formes, et c'est
   * le seul endroit qui sait le faire.
   *
   * Lu par le plan de calibration ET par la résolution de salle. Ce second
   * point a manqué longtemps : le refus ne tenait que le temps du bloc de
   * calibration, puis l'exercice revenait dans les séances proposées, et
   * pouvait même servir de remplaçant à un autre.
   */
  exercicesRefuses: jsonb("exercices_refuses").$type<string[]>(),
  /**
   * DORMANTE. Ni écrite, ni lue, par personne.
   *
   * Aucun écran ne la remplit — l'onboarding ne pose pas la question — et
   * aucun moteur ne la consulte. Elle est conservée telle quelle plutôt que
   * supprimée : une migration destructive sur une colonne inoffensive n'a rien
   * à gagner, et l'idée reste bonne pour plus tard — une PRÉFÉRENCE DOUCE dans
   * le choix d'un remplaçant, à départager entre deux candidats équivalents.
   *
   * Ce jour-là, il faudra une question à l'onboarding et une règle dans la
   * résolution. En attendant, ne pas la lire est le comportement correct :
   * `exercices_refuses` et `preference_materiel` couvrent déjà le besoin.
   */
  exercicesApprecies: jsonb("exercices_apprecies").$type<string[]>(),

  /** Tant qu'elle est nulle, l'application ouvre l'onboarding plutot que l'accueil. */
  onboardingTermineLe: timestamp("onboarding_termine_le"),

  prefSalleParDefautId: uuid("pref_salle_par_defaut_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const gyms = pgTable("gyms", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Compte ayant enregistre la salle.
   *
   * Une salle et les exercices qu'on y trouve decrivent un lieu, pas un
   * pratiquant : deux comptes qui s'y entrainent y trouvent la meme chose. La
   * lecture est donc commune a tous.
   *
   * Cet identifiant designe le responsable : celui qui a saisi la salle est le
   * seul a pouvoir la modifier et a gerer les exercices qu'elle contient. Tenir
   * un parc a jour est un travail de terrain, il a un auteur.
   */
  userId: uuid("user_id").references(() => users.id).notNull(),
  nom: text("nom").notNull(),
  /**
   * Types de materiel presents sur place.
   *
   * Un exercice n'etait realisable quelque part que si une ligne
   * `exercise_instances` le declarait, une par exercice et par salle :
   * declarer un lieu demandait de saisir a la main chaque mouvement possible,
   * pompes et gainage compris. C'est le lieu qui possede des ressources ;
   * l'exercice, lui, dit ce dont il a besoin. Le moteur fait l'intersection.
   *
   * C'est aussi ce qui permet a « Maison » d'etre un lieu comme un autre
   * plutot qu'une deuxieme bibliotheque d'exercices a maintenir.
   *
   * `null` et `[]` ne disent pas la meme chose : `null` = personne n'a encore
   * decrit ce lieu, `[]` = decrit, et il n'y a rien de plus que le poids du
   * corps. Sans cette distinction, une salle inconnue aurait recu une seance
   * de pompes au lieu qu'on demande ce qu'elle contient.
   */
  equipementsDisponibles: jsonb("equipements_disponibles").$type<string[]>(),
  /**
   * `inconnu` | `partiel` | `complet` — ce qu'on sait de ce lieu, déclaré.
   *
   * Le matériel coché et les appareils décrits sont deux voies indépendantes
   * vers la faisabilité : cocher « Poulie » rendait faisables les vingt-trois
   * exercices à la poulie du catalogue, sans qu'aucune poulie n'ait été vue.
   * Pire, la calibration matérialisait ensuite ces exercices déduits en vraies
   * lignes `exercise_instances`, et des appareils inexistants entraient dans
   * l'inventaire.
   *
   * Ce champ dit à partir de quand la déduction cesse d'être permise. Il n'est
   * jamais calculé : un seuil sur le nombre d'instances serait arbitraire, et
   * « dès qu'une instance existe » punirait la première saisie. C'est une
   * DÉCLARATION.
   *
   *   inconnu   rien de fiable n'est su du lieu. Les familles génériques
   *             rendent des exercices faisables. Comportement historique.
   *   partiel   des appareils sont connus. Les instances réelles priment,
   *             les familles complètent encore, et l'écran doit dire que
   *             l'inventaire est incomplet.
   *   complet   inventaire validé. Un exercice exigeant un appareil n'est
   *             faisable QUE par une instance active de cette salle, et
   *             aucune capacité générique ne matérialise plus rien.
   *
   * `inconnu` par défaut : aucune salle existante ne change de comportement
   * tant que quelqu'un ne s'est pas prononcé.
   */
  inventaireStatut: text("inventaire_statut").default("inconnu").notNull(),
  horairesOuverture: text("horaires_ouverture"),
  est24h: boolean("est_24h").default(false),
  notes: text("notes"),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exercises = pgTable("exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Auteur de l'entree, `null` pour la bibliotheque commune.
   *
   * Un exercice decrit un mouvement, pas une personne : le dupliquer par compte
   * n'avait aucun sens et produisait trois cent soixante et une lignes pour
   * cent vingt mouvements. Seules les entrees creees a la main par quelqu'un
   * portent encore son identifiant.
   */
  userId: uuid("user_id").references(() => users.id),
  nom: text("nom").notNull(),
  pilier: text("pilier").notNull(),
  profilTension: text("profil_tension").notNull(),
  type: text("type").notNull(),
  categorieRole: text("categorie_role").notNull(),
  musclesPrincipaux: jsonb("muscles_principaux").$type<string[]>(),
  // Muscles secondaires : absents du modele, ils empechaient tout raisonnement
  // correct sur le volume reel et le chevauchement entre seances.
  musclesSecondaires: jsonb("muscles_secondaires").$type<string[]>(),
  // Type de materiel requis (referentiel equipements). Permet de repondre a
  // "cet exercice est-il faisable ici ?" autrement que par l'existence d'une instance.
  equipement: text("equipement"),
  // Identifiant dans la bibliotheque workout-guide : sert aussi de cle des illustrations.
  slug: text("slug"),
  /**
   * Ce qu'on peut dire du MOUVEMENT, indépendamment du lieu et de la personne.
   *
   * Un document plutôt qu'une colonne par section : les cent vingt exercices ne
   * seront pas renseignés le même jour, et chaque section ajoutée demanderait
   * sinon sa migration. Le contenu est validé par `ficheTechniqueSchema` à
   * l'écriture — il est structuré, pas opaque.
   *
   * Nul partout au départ, et c'est voulu : une section absente disparaît de
   * l'écran plutôt que d'afficher un texte générique.
   */
  ficheTechnique: jsonb("fiche_technique").$type<FicheTechnique>(),
  /**
   * Le tempo propre au mouvement — le plus général des trois niveaux.
   *
   * Reste nul tant que personne ne l'a prescrit. Poser un `3-1-1-0` universel
   * ferait passer un remplissage automatique pour une consigne réfléchie, et
   * l'athlète n'aurait aucun moyen de faire la différence.
   */
  tempoParDefaut: text("tempo_par_defaut"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exerciseInstances = pgTable("exercise_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  /**
   * Compte ayant saisi l'entree. Trace d'auteur, sans effet sur les droits :
   * c'est le createur de la SALLE qui decide de son contenu. Sinon le premier a
   * corriger un reglage se l'approprierait.
   */
  userId: uuid("user_id").references(() => users.id).notNull(),
  exerciseId: uuid("exercise_id").references(() => exercises.id).notNull(),
  gymId: uuid("gym_id").references(() => gyms.id).notNull(),
  machineNom: text("machine_nom").notNull(),
  typePoulie: text("type_poulie").default("na"),
  /**
   * Ce que signifie le nombre saisi en séance, sur CET appareil.
   *
   * `pile_affichee` : la valeur lue sur la pile. `pile_par_cote` : la valeur
   * d'une pile lorsque deux côtés sont réglés pareil. `disques_ajoutes` : ce
   * qu'on a ajouté, hors chariot. `poids_total` : tout ce qui se déplace, barre
   * comprise. `poids_par_main` : le nombre marqué sur un haltère, jamais ×2.
   * `sans_charge` : aucune charge externe; l'UX reste vide et la persistance
   * enregistre zéro kilogramme ajouté (jamais le poids du corps).
   *
   * La convention ne rend pas les nombres comparables entre appareils : deux
   * Smith machines à contrepoids différents affichent la même convention et
   * mesurent autre chose. Elle dit seulement quoi saisir ici, et fige
   * l'interprétation de l'historique de cette entrée.
   */
  conventionCharge: text("convention_charge").notNull(),
  /**
   * Sauts de charge réellement disponibles. `null` quand ils n'ont pas été
   * mesurés — et `null` veut dire inconnu, jamais « prends la valeur
   * habituelle ». Une donnée absente empêche une prescription précise ; elle ne
   * s'invente pas.
   */
  incrementsPossibles: jsonb("increments_possibles").$type<number[]>(),
  /**
   * Charges réellement atteignables, quand elles forment une collection
   * discrète : barres préchargées 10/15/20/25/30, haltères de la salle, pile
   * aux crans irréguliers. Prime sur les incréments — la liste est mesurée, la
   * grille est déduite.
   */
  paliersCharges: jsonb("paliers_charges").$type<number[]>(),
  /**
   * Plancher : premier cran de la pile, haltère le plus léger, barre à vide.
   * Rien ne doit être prescrit en dessous.
   */
  chargeMinimale: real("charge_minimale"),
  /**
   * Résistance intrinsèque annoncée par le constructeur : chariot d'une presse,
   * plateforme d'un hack squat.
   *
   * MÉTADONNÉE, jamais un terme de calcul. Ce n'est pas une masse sommable :
   * inclinaison, bras de levier et cames font varier la résistance ressentie,
   * et la convention constructeur n'est pas publiée. L'ajouter à la charge
   * saisie produirait un nombre plus précis en apparence et moins exact en
   * réalité. Elle sert à reconnaître l'appareil et à expliquer un écart entre
   * deux salles, pas à corriger un historique.
   */
  poidsNonCompte: real("poids_non_compte"),
  // Plafond de la pile ou du chargement : permet de detecter qu'un exercice
  // est arrive en butee et qu'il faut en changer.
  chargeMax: real("charge_max"),
  /**
   * Sens de la charge.
   *
   * `resistance` : plus lourd, plus dur — le cas courant. `assistance` : la
   * charge AIDE, et progresser c'est en demander moins (Dip/Chin Assist).
   *
   * Remplace un booléen de sens de progression : l'orientation n'est pas une
   * propriété à déclarer à part, elle découle de ce que le nombre mesure. Une
   * assistance n'entre ni dans un maximum estimé ni dans un record de charge
   * croissante — voir `charges.ts`.
   */
  natureCharge: text("nature_charge").default("resistance").notNull(),
  /**
   * `disponible` | `temporairement_indisponible`.
   *
   * Une machine en panne n'est pas une machine archivée : elle revient. L'état
   * la retire de la faisabilité du jour sans toucher à son historique ni
   * obliger à la re-saisir au retour. `archiveLe` reste réservé au retrait
   * durable.
   */
  etat: text("etat").default("disponible").notNull(),
  /**
   * Combien d'exemplaires. Métadonnée d'inventaire : aucun module ne la lit
   * aujourd'hui, et rien n'en déduit une probabilité d'occupation — il n'y a
   * pas de temps réel ici.
   */
  quantite: integer("quantite"),
  notesMachine: text("notes_machine"),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  activeIdentityUnique: uniqueIndex("exercise_instances_active_identity_unique")
    .on(table.gymId, table.exerciseId, table.machineNom)
    .where(sql`${table.archiveLe} IS NULL`),
}));

export const programmeBlocs = pgTable("programme_blocs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  nom: text("nom").notNull(),
  dateDebut: date("date_debut").notNull(),
  dateFinPrevue: date("date_fin_prevue"),
  typeCycle: text("type_cycle").notNull(),
  semaineActuelle: integer("semaine_actuelle").default(1),
  actif: boolean("actif").default(false),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const seanceTemplates = pgTable("seance_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  blocId: uuid("bloc_id").references(() => programmeBlocs.id).notNull(),
  lettre: text("lettre").notNull(),
  nom: text("nom").notNull(),
  ordreDansSemaine: integer("ordre_dans_semaine").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exerciseInTemplate = pgTable("exercise_in_template", {
  id: uuid("id").defaultRandom().primaryKey(),
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id).notNull(),
  exerciseInstanceId: uuid("exercise_instance_id").references(() => exerciseInstances.id).notNull(),
  ordre: integer("ordre").notNull(),
  seriesCibles: integer("series_cibles").notNull(),
  fourchetteRepsMin: integer("fourchette_reps_min").notNull(),
  fourchetteRepsMax: integer("fourchette_reps_max").notNull(),
  rpeCible: real("rpe_cible"),
  tempo: text("tempo"),
  reposSecondes: integer("repos_secondes"),
  notes: text("notes"),
  /**
   * Date de retrait du programme.
   *
   * Une ligne de programme ne se supprime pas une fois qu'elle a servi.
   * `session_plan_items` la référence pour dire d'où venait un exercice réalisé,
   * et la clé étrangère refusait la suppression — l'écran Programme échouait
   * donc dès qu'on retirait un exercice déjà travaillé, et l'écran Matériel
   * conseillait précisément cette manœuvre pour libérer une machine.
   *
   * Retirer, c'est cesser de programmer. La ligne reste, l'historique garde son
   * origine, et plus rien ne la propose. Les lectures du programme ACTIF
   * l'excluent ; celles de l'historique n'en dépendent pas — `lirePlan` lit
   * `session_plan_items`, qui porte sa propre copie de la prescription.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  /**
   * Les lignes encore programmées d'un gabarit : la lecture la plus fréquente
   * de cette table.
   *
   * Cet index vivait dans la migration 0005 sans être déclaré ici. Un
   * `drizzle-kit push` l'aurait supprimé sans bruit — un index manquant ne
   * casse rien, il ralentit, et personne ne l'aurait vu partir.
   */
  index("exercise_in_template_actives_idx").on(t.seanceTemplateId, t.archiveLe),
]);

export const dailyStates = pgTable("daily_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  // La salle du jour ne transitait que par un parametre d'URL : elle n'etait
  // jamais persistee, alors qu'elle conditionne le materiel disponible.
  gymId: uuid("gym_id").references(() => gyms.id),
  sommeilHeures: real("sommeil_heures"),
  jeuneBool: boolean("jeune_bool").default(false),
  shiftRecentBool: boolean("shift_recent_bool").default(false),
  shiftType: text("shift_type"),
  energieDepart: integer("energie_depart"),
  courbatures: jsonb("courbatures").$type<{muscle: string; intensite: number}[]>(),
  /**
   * Materiel personnel emporte ce jour-la. Il s'ajoute a celui du lieu sans
   * jamais le modifier : personne ne doit declarer que la salle possede ses
   * propres elastiques.
   */
  materielApporte: jsonb("materiel_apporte").$type<string[]>(),
  dernierRepasHeure: text("dernier_repas_heure"),
  horaireSeancePrevu: text("horaire_seance_prevu"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateUnique: unique("user_date_unique").on(table.userId, table.date),
}));

export const sessionLogs = pgTable("session_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id),
  dailyStateId: uuid("daily_state_id").references(() => dailyStates.id),
  date: date("date").notNull(),
  gymId: uuid("gym_id").references(() => gyms.id),
  dureeMinutes: integer("duree_minutes"),
  energieFin: integer("energie_fin"),
  feuBiologiqueJour: text("feu_biologique_jour"),
  feuBiologiqueTendance: text("feu_biologique_tendance"),
  volumeAjustePct: integer("volume_ajuste_pct"),
  volumeAjusteRaison: text("volume_ajuste_raison"),
  notesSeance: text("notes_seance"),
  /**
   * Date d'archivage.
   *
   * Une reprise apres une longue interruption, ou un demenagement, rend
   * l'existant trompeur : les anciennes charges et l'ancien parc fausseraient
   * la programmation sans rien apporter. Les archiver plutot que les supprimer
   * les retire de tout calcul en preservant la trace de ce qui a ete fait.
   */
  archiveLe: timestamp("archive_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const setLogs = pgTable("set_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id).notNull(),
  exerciseInstanceId: uuid("exercise_instance_id").references(() => exerciseInstances.id).notNull(),
  numeroSerie: integer("numero_serie").notNull(),
  repsEffectuees: integer("reps_effectuees").notNull(),
  charge: real("charge").notNull(),
  rpeEffectif: real("rpe_effectif"),
  tempoRespecte: boolean("tempo_respecte"),
  reposReelSecondes: integer("repos_reel_secondes"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bodyWeights = pgTable("body_weights", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  date: date("date").notNull(),
  poids: real("poids").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateUnique: unique("body_weights_user_date_unique").on(table.userId, table.date),
}));

export const coachConversations = pgTable("coach_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  title: text("title"),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const coachMessages = pgTable("coach_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => coachConversations.id).notNull(),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  toolResults: jsonb("tool_results"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessionIncidents = pgTable("session_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id).notNull(),
  type: text("type").notNull(), // 'machine_occupee' | 'douleur' | 'energie_chute' | 'temps_depasse'
  contexte: jsonb("contexte").$type<Record<string, unknown>>().notNull(),
  decision: text("decision").notNull(),
  impactProgramme: text("impact_programme"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const precalcSessions = pgTable("precalc_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  targetDate: date("target_date").notNull(),
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id),
  contenu: text("contenu").notNull(),
  contexteUtilise: jsonb("contexte_utilise").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userDateUnique: unique("precalc_user_date_unique").on(table.userId, table.targetDate),
}));

/**
 * Le débrief d'UNE séance, conservé.
 *
 * Il ne l'était pas : chaque ouverture de la fiche d'une séance relançait une
 * génération complète — un appel modèle, une conversation de coach, deux
 * messages écrits — pour un texte que l'écran n'affichait même pas. Consulter
 * une vieille séance coûtait donc un appel modèle, à chaque fois.
 *
 * La règle : la séance se clôt, le débrief est généré une fois, il est
 * conservé. Une consultation LIT. Régénérer est une action demandée.
 */
export const sessionDebriefs = pgTable("session_debriefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  sessionLogId: uuid("session_log_id")
    .references(() => sessionLogs.id, { onDelete: "cascade" })
    .notNull(),
  contenu: text("contenu").notNull(),
  genereLe: timestamp("genere_le").defaultNow().notNull(),
  /** `fournisseur:modele` du modèle qui a répondu. */
  modele: text("modele"),
  /**
   * Empreinte des séries qui ont servi de source.
   *
   * Elle ne déclenche rien : elle permet de constater qu'un débrief ne décrit
   * plus l'état de la séance — après correction d'une charge, par exemple.
   */
  empreinteSource: text("empreinte_source"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // La régénération remplace, elle n'empile pas.
  seanceUnique: unique("session_debrief_unique").on(table.sessionLogId),
}));

export const weeklyDebriefs = pgTable("weekly_debriefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(),
  contenu: text("contenu").notNull(),
  stats: jsonb("stats").$type<{
    nbSeances: number;
    volumeTotal: number;
    feux: { vert: number; orange: number; rouge: number };
    progressions: string[];
    stagnations: string[];
    incidentsNb: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userWeekUnique: unique("weekly_debrief_user_week_unique").on(table.userId, table.weekStart),
}));


/**
 * La seance du jour : ce que l'application a decide pour aujourd'hui.
 *
 * Il manquait un objet entre le TEMPLATE (ce qui etait prevu il y a des semaines)
 * et le LOG (ce qui a ete fait). Sans lui, les calculs d'adaptation n'avaient nulle
 * part ou se poser : l'ajustement de volume finissait dans un sessionStorage que
 * personne ne relisait, et la charge suggeree etait recalculee puis oubliee.
 *
 * Une ligne = un exercice prescrit pour cette seance, apres resolution de la salle,
 * ajustement du volume et calcul de la charge.
 */
export const sessionPlanItems = pgTable("session_plan_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionLogId: uuid("session_log_id").references(() => sessionLogs.id).notNull(),
  ordre: integer("ordre").notNull(),

  /** Instance retenue APRES resolution de la salle du jour. */
  exerciseInstanceId: uuid("exercise_instance_id").references(() => exerciseInstances.id).notNull(),
  /** Ligne de template d'origine, absente pour un exercice ajoute a la volee. */
  exerciseInTemplateId: uuid("exercise_in_template_id").references(() => exerciseInTemplate.id),
  /** Instance initialement prevue, quand la salle a impose une substitution. */
  substitutionDeInstanceId: uuid("substitution_de_instance_id").references(() => exerciseInstances.id),
  /**
   * Ce qui etait prevu au depart, ecrit une fois et jamais reecrit.
   *
   * `substitution_de_instance_id` ne suffisait pas : il porte le remplacement
   * precedent, donc il bouge a chaque adaptation. Apres un aller-retour
   * salle -> maison -> salle, plus rien ne disait ce que la seance devait etre.
   *
   * La progression en a besoin pour ne PAS conclure a une stagnation ni a une
   * absence inexpliquee : un exercice remplace faute de materiel n'a pas ete
   * rate, il n'a pas ete propose.
   */
  exerciseInstancePrevuId: uuid("exercise_instance_prevu_id").references(() => exerciseInstances.id),
  /**
   * Pourquoi l'adaptation a eu lieu : lieu change, materiel absent, machine
   * occupee, materiel apporte. La raison textuelle s'adresse a l'utilisateur ;
   * ceci s'adresse au moteur et au planificateur.
   */
  contexteAdaptation: jsonb("contexte_adaptation").$type<{
    type: "changement_lieu" | "materiel_absent" | "machine_occupee" | "autre";
    lieuAvantId?: string | null;
    lieuAvantNom?: string | null;
    lieuApresId?: string | null;
    lieuApresNom?: string | null;
    materielApporte?: string[];
    niveauFidelite?: string;
    qualite?: string;
    horodatage?: string;
  }>(),
  raisonSubstitution: text("raison_substitution"),

  /** Prescription effective, ajustement de volume compris. */
  seriesCibles: integer("series_cibles").notNull(),
  seriesPrevuesAvantAjustement: integer("series_prevues_avant_ajustement"),
  fourchetteRepsMin: integer("fourchette_reps_min").notNull(),
  fourchetteRepsMax: integer("fourchette_reps_max").notNull(),
  rpeCible: real("rpe_cible"),
  tempo: text("tempo"),
  reposSecondes: integer("repos_secondes"),

  /** Issue de la double progression sur l'historique de CETTE instance. */
  chargeSuggeree: real("charge_suggeree"),
  repsSuggerees: jsonb("reps_suggerees").$type<number[]>(),
  messageProgression: text("message_progression"),

  /** 'prevu' | 'fait' | 'passe' | 'reporte' */
  statut: text("statut").notNull().default("prevu"),
  raisonStatut: text("raison_statut"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Contraintes physiques persistantes : blessure, zone sensible, douleur recurrente.
 *
 * Une douleur n'existait que le temps d'une modale : elle n'etait pas historisee et
 * ne survivait pas a la seance. Le lendemain, l'application reproposait le meme
 * exercice sur la meme epaule, sans memoire.
 */
export const contraintes = pgTable("contraintes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  /** Muscle du referentiel, ou zone de douleur. */
  muscle: text("muscle").notNull(),
  /** 'blessure' | 'douleur' | 'zone_sensible' */
  type: text("type").notNull(),
  /** 1-10 : au-dela de 7, l'exercice est ecarte plutot qu'allege. */
  severite: integer("severite").notNull(),
  notes: text("notes"),
  dateDebut: date("date_debut").notNull(),
  /**
   * Dernier jour où la contrainte s'applique. Nulle tant qu'elle vaut.
   *
   * La colonne existait depuis le début et n'était écrite par AUCUN chemin :
   * seulement lue. Une gêne déclarée un jour valait donc pour toujours, et la
   * seule sortie passait par le SQL. C'est elle qui porte désormais la
   * résolution.
   */
  dateFin: date("date_fin"),
  /**
   * Jour où reposer la question.
   *
   * Ce n'est pas une date de guérison — l'application n'en sait rien. C'est le
   * moment où elle redemande « est-ce toujours le cas ? ». Nulle veut dire :
   * ne plus demander, parce que l'athlète a déclaré une limitation qu'il sait
   * durable.
   */
  aReevaluerLe: date("a_reevaluer_le"),
  /** 'onboarding' | 'athlete' | 'coach' : d'où vient la ligne. */
  origine: text("origine").notNull().default("athlete"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  /**
   * Les contraintes actives d'un compte : lues à chaque construction de séance.
   *
   * Déclaré dans la migration 0006 et nulle part ici — même angle mort que les
   * deux autres index de lecture.
   */
  index("contraintes_actives_idx").on(t.userId, t.dateFin),
]);

/**
 * Mémoire du coach.
 *
 * L'historique brut dit ce qui s'est passé ; il ne dit pas ce qu'on en a
 * appris. Sans cette séparation, le coach doit re-déduire les mêmes constats à
 * chaque conversation, à partir d'un contexte forcément tronqué — et il oublie
 * tout entre deux échanges.
 *
 * Une observation peut venir d'un calcul de l'application ou d'une déduction du
 * modèle ; `source` les distingue, parce qu'elles ne méritent pas la même
 * confiance. `confirmee` marque celles que l'utilisateur a validées.
 */
export const coachMemoires = pgTable("coach_memoires", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  /** L'observation, en une phrase, telle qu'elle serait dite à voix haute. */
  observation: text("observation").notNull(),
  /** 'recuperation' | 'preference' | 'technique' | 'progression' | 'contrainte' */
  categorie: text("categorie").notNull(),
  /** 'calcul' quand l'application l'a mesurée, 'modele' quand le coach l'a déduite. */
  source: text("source").notNull().default("modele"),
  /** Muscles ou exercices concernés, pour retrouver l'observation au bon moment. */
  motsCles: jsonb("mots_cles").$type<string[]>(),
  /** 1-5 : une déduction isolée ne pèse pas autant qu'une régularité mesurée. */
  poids: integer("poids").notNull().default(3),
  confirmee: boolean("confirmee").notNull().default(false),
  /** Nulle tant que l'observation vaut ; datée quand elle cesse d'être vraie. */
  invalideeLe: timestamp("invalidee_le"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


/**
 * Propositions du coach.
 *
 * Une proposition n'est pas une modification : c'est une modification calculée,
 * montrée, et qui attend un oui. Elle vit en base plutôt qu'en mémoire pour
 * trois raisons.
 *
 * D'abord parce que la confirmation arrive dans une seconde requête : entre les
 * deux, rien ne dit que le serveur est le même. Ensuite parce que l'avant doit
 * être figé au moment du calcul — le reconstruire à l'application reviendrait à
 * comparer l'après à un avant qui a peut-être bougé. Enfin parce que ces lignes
 * sont la trace : ce qui a été proposé, par quelle conversation, accepté ou non,
 * et ce que l'application a donné. Une proposition refusée se conserve autant
 * qu'une proposition appliquée.
 */
export const coachPropositions = pgTable("coach_propositions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  /** La conversation d'où elle vient, pour l'afficher au bon endroit. */
  conversationId: uuid("conversation_id").references(() => coachConversations.id),
  /**
   * De quoi parle la proposition : 'seance' ou 'contrainte'.
   *
   * Un second sujet plutôt qu'un second mécanisme. L'aperçu, l'empreinte, la
   * péremption et l'application atomique valent pour les deux ; seule change
   * la chose qu'on relit et qu'on écrit.
   */
  sujet: text("sujet").notNull().default("seance"),
  /** Séance programmée visée, pour les propositions de sujet 'seance'. */
  seanceTemplateId: uuid("seance_template_id").references(() => seanceTemplates.id),
  /** Contrainte visée, pour une résolution. Nulle pour une création. */
  contrainteId: uuid("contrainte_id").references(() => contraintes.id),
  /** 'remplacer_exercice' | 'ajuster_volume' | 'ajouter_exercice' | 'retirer_exercice' */
  operation: text("operation").notNull(),
  /** L'opération telle que le serveur l'a retenue, identifiants vérifiés. */
  parametres: jsonb("parametres").$type<Record<string, unknown>>().notNull(),
  /** L'état d'avant, construit par le serveur — jamais transmis par le modèle. */
  avant: jsonb("avant").$type<unknown[]>().notNull(),
  apres: jsonb("apres").$type<unknown[]>().notNull(),
  /** Ce qui a été montré à l'humain, mot pour mot. */
  apercu: jsonb("apercu").$type<Record<string, unknown>>().notNull(),
  /**
   * Empreinte de la séance au moment du calcul.
   *
   * Applique-t-on encore la bonne chose ? Si la séance a changé entre la
   * proposition et le oui, l'opération pourrait s'exécuter et produire autre
   * chose que ce qui était affiché. Cette empreinte rend l'écart détectable.
   */
  empreinte: text("empreinte").notNull(),
  /** 'en_attente' | 'appliquee' | 'refusee' | 'perimee' | 'echouee' */
  statut: text("statut").notNull().default("en_attente"),
  /** Contrôles passés après écriture, ou la raison d'un échec. */
  resultat: jsonb("resultat").$type<Record<string, unknown>>(),
  decideLe: timestamp("decide_le"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  /**
   * Les propositions qu'un compte doit encore trancher.
   *
   * Déclaré dans la migration 0004 et absent du schéma jusqu'ici.
   */
  index("coach_propositions_en_attente_idx").on(t.userId, t.statut, t.createdAt),
]);


// ---------------------------------------------------------------------------
// Exécution : ce qu'il faut savoir devant la machine
// ---------------------------------------------------------------------------

/**
 * Ce que CETTE machine propose comme réglages.
 *
 * Une ligne par possibilité physique — « il y a un siège, il a dix crans ».
 * Surtout pas une colonne par type de réglage sur `exercise_instances` : le
 * rack a des safety bars que la Leg Extension n'a pas, le banc une inclinaison
 * que la poulie n'a pas, et la table finirait creuse à quatre-vingt pour cent.
 *
 * Cette définition décrit l'OBJET, pas la personne. Elle est donc commune à
 * tous les comptes du lieu, exactement comme l'instance qui la porte.
 */
export const instanceReglages = pgTable("instance_reglages", {
  id: uuid("id").defaultRandom().primaryKey(),
  exerciseInstanceId: uuid("exercise_instance_id")
    .references(() => exerciseInstances.id).notNull(),
  /**
   * Stable, en snake_case : c'est elle qui relie une valeur personnelle à sa
   * définition. La renommer orpheline les valeurs déjà mémorisées.
   */
  cle: text("cle").notNull(),
  libelle: text("libelle").notNull(),
  /** `cran` | `degres` | `choix` | `texte` — voir `TYPES_REGLAGE`. */
  typeValeur: text("type_valeur").$type<TypeReglage>().notNull(),
  min: real("min"),
  max: real("max"),
  options: jsonb("options").$type<string[]>(),
  unite: text("unite"),
  ordre: integer("ordre").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("instance_reglages_cle_unique").on(t.exerciseInstanceId, t.cle),
]);

/**
 * Les valeurs d'une personne sur un appareil précis.
 *
 * La machine propose des crans de 1 à 10 ; Sacha met le siège au 6, Maria au 3.
 * Ces valeurs n'appartiennent ni au mouvement ni à l'appareil mais au couple —
 * et elles ne se recopient JAMAIS d'une machine à l'autre au motif que c'est le
 * même exercice. Deux Leg Extension de marques différentes ne numérotent pas
 * leurs crans pareil.
 */
export const reglagesPersonnels = pgTable("reglages_personnels", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  exerciseInstanceId: uuid("exercise_instance_id")
    .references(() => exerciseInstances.id).notNull(),
  cle: text("cle").notNull(),
  /**
   * En texte quelle que soit la nature du réglage : la validation contre la
   * définition a lieu à l'écriture, et un cran comme un choix se réaffichent
   * tels qu'ils ont été saisis.
   */
  valeur: text("valeur").notNull(),
  /**
   * L'instant où l'utilisateur a formé cette intention — pas celui où la
   * requête est arrivée. Voir `notesExercice.intention`.
   */
  intention: bigint("intention", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("reglages_personnels_unique").on(t.userId, t.exerciseInstanceId, t.cle),
]);

/**
 * La note qu'on se laisse à soi-même.
 *
 * « siège 6 parfait », « 36 kg trop facile », « légère gêne épaule ». Du
 * contexte, jamais une métrique : rien de ce qui est écrit ici n'entre dans la
 * progression, les records ou le feu biologique. Le moteur ne la lit pas.
 *
 * Deux portées, parce que tout exercice n'a pas d'appareil : la note d'un
 * développé couché se range sur SON banc, celle des pompes sur l'exercice.
 * Exactement une des deux références est renseignée — la base le vérifie.
 */
export const notesExercice = pgTable("notes_exercice", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  exerciseInstanceId: uuid("exercise_instance_id").references(() => exerciseInstances.id),
  exerciseId: uuid("exercise_id").references(() => exercises.id),
  /**
   * La chaîne vide est le vide : elle SE STOCKE au lieu de se supprimer.
   *
   * Effacer par DELETE emporterait le repère d'intention avec la ligne, et une
   * requête ancienne arrivée après coup réinsérerait la note qu'on vient de
   * vider. Les lectures traduisent cette chaîne vide en `null` ; l'écran ne
   * voit pas la différence, l'ordre des écritures si.
   */
  texte: text("texte").notNull(),
  /**
   * L'instant où l'utilisateur a formé cette intention, horodaté chez lui.
   *
   * Une écriture ne l'emporte que si son intention est plus récente que celle
   * déjà en base. C'est ce qui distingue « la plus récente gagne » de « la
   * dernière arrivée gagne » — deux choses différentes dès que deux requêtes
   * sont en vol en même temps.
   */
  intention: bigint("intention", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  check(
    "notes_exercice_une_seule_portee",
    sql`(${t.exerciseInstanceId} is not null and ${t.exerciseId} is null)
        or (${t.exerciseInstanceId} is null and ${t.exerciseId} is not null)`,
  ),
  // Deux index partiels plutôt qu'un composite : `NULL` n'entre pas dans une
  // contrainte d'unicité, et sans eux la même personne empilerait dix notes
  // sur le même banc.
  uniqueIndex("notes_exercice_par_instance_unique")
    .on(t.userId, t.exerciseInstanceId).where(sql`${t.exerciseInstanceId} is not null`),
  uniqueIndex("notes_exercice_par_exercice_unique")
    .on(t.userId, t.exerciseId).where(sql`${t.exerciseId} is not null`),
]);

// ---------------------------------------------------------------------------
// Relations
//
// Sans ces declarations, toute requete `db.query.X.findMany({ with: { ... } })`
// echoue a l'execution : Drizzle ne connait pas le lien. Cinq appels du code
// (fiche exercice, routes exercices/instances, outils du coach) en dependaient.
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  gyms: many(gyms),
  exercises: many(exercises),
  exerciseInstances: many(exerciseInstances),
  sessionLogs: many(sessionLogs),
  dailyStates: many(dailyStates),
  bodyWeights: many(bodyWeights),
  programmeBlocs: many(programmeBlocs),
}));

export const gymsRelations = relations(gyms, ({ one, many }) => ({
  user: one(users, { fields: [gyms.userId], references: [users.id] }),
  exerciseInstances: many(exerciseInstances),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  user: one(users, { fields: [exercises.userId], references: [users.id] }),
  instances: many(exerciseInstances),
}));

export const exerciseInstancesRelations = relations(exerciseInstances, ({ one, many }) => ({
  user: one(users, { fields: [exerciseInstances.userId], references: [users.id] }),
  exercise: one(exercises, { fields: [exerciseInstances.exerciseId], references: [exercises.id] }),
  gym: one(gyms, { fields: [exerciseInstances.gymId], references: [gyms.id] }),
  setLogs: many(setLogs),
  templateEntries: many(exerciseInTemplate),
}));

export const programmeBlocsRelations = relations(programmeBlocs, ({ one, many }) => ({
  user: one(users, { fields: [programmeBlocs.userId], references: [users.id] }),
  seanceTemplates: many(seanceTemplates),
}));

export const seanceTemplatesRelations = relations(seanceTemplates, ({ one, many }) => ({
  bloc: one(programmeBlocs, { fields: [seanceTemplates.blocId], references: [programmeBlocs.id] }),
  exercises: many(exerciseInTemplate),
  sessionLogs: many(sessionLogs),
}));

export const exerciseInTemplateRelations = relations(exerciseInTemplate, ({ one }) => ({
  seanceTemplate: one(seanceTemplates, { fields: [exerciseInTemplate.seanceTemplateId], references: [seanceTemplates.id] }),
  exerciseInstance: one(exerciseInstances, { fields: [exerciseInTemplate.exerciseInstanceId], references: [exerciseInstances.id] }),
}));

export const dailyStatesRelations = relations(dailyStates, ({ one, many }) => ({
  user: one(users, { fields: [dailyStates.userId], references: [users.id] }),
  gym: one(gyms, { fields: [dailyStates.gymId], references: [gyms.id] }),
  sessionLogs: many(sessionLogs),
}));

export const sessionLogsRelations = relations(sessionLogs, ({ one, many }) => ({
  user: one(users, { fields: [sessionLogs.userId], references: [users.id] }),
  seanceTemplate: one(seanceTemplates, { fields: [sessionLogs.seanceTemplateId], references: [seanceTemplates.id] }),
  dailyState: one(dailyStates, { fields: [sessionLogs.dailyStateId], references: [dailyStates.id] }),
  gym: one(gyms, { fields: [sessionLogs.gymId], references: [gyms.id] }),
  setLogs: many(setLogs),
  incidents: many(sessionIncidents),
  planItems: many(sessionPlanItems),
}));

export const sessionPlanItemsRelations = relations(sessionPlanItems, ({ one }) => ({
  sessionLog: one(sessionLogs, { fields: [sessionPlanItems.sessionLogId], references: [sessionLogs.id] }),
  exerciseInstance: one(exerciseInstances, { fields: [sessionPlanItems.exerciseInstanceId], references: [exerciseInstances.id] }),
}));

export const contraintesRelations = relations(contraintes, ({ one }) => ({
  user: one(users, { fields: [contraintes.userId], references: [users.id] }),
}));

export const coachMemoiresRelations = relations(coachMemoires, ({ one }) => ({
  user: one(users, { fields: [coachMemoires.userId], references: [users.id] }),
}));

export const setLogsRelations = relations(setLogs, ({ one }) => ({
  sessionLog: one(sessionLogs, { fields: [setLogs.sessionLogId], references: [sessionLogs.id] }),
  exerciseInstance: one(exerciseInstances, { fields: [setLogs.exerciseInstanceId], references: [exerciseInstances.id] }),
}));

export const bodyWeightsRelations = relations(bodyWeights, ({ one }) => ({
  user: one(users, { fields: [bodyWeights.userId], references: [users.id] }),
}));

export const coachConversationsRelations = relations(coachConversations, ({ one, many }) => ({
  user: one(users, { fields: [coachConversations.userId], references: [users.id] }),
  sessionLog: one(sessionLogs, { fields: [coachConversations.sessionLogId], references: [sessionLogs.id] }),
  messages: many(coachMessages),
}));

export const coachMessagesRelations = relations(coachMessages, ({ one }) => ({
  conversation: one(coachConversations, { fields: [coachMessages.conversationId], references: [coachConversations.id] }),
}));

export const sessionIncidentsRelations = relations(sessionIncidents, ({ one }) => ({
  sessionLog: one(sessionLogs, { fields: [sessionIncidents.sessionLogId], references: [sessionLogs.id] }),
}));


// Inferred types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type ExerciseInstance = typeof exerciseInstances.$inferSelect;
export type NewExerciseInstance = typeof exerciseInstances.$inferInsert;
export type ProgrammeBloc = typeof programmeBlocs.$inferSelect;
export type NewProgrammeBloc = typeof programmeBlocs.$inferInsert;
export type SeanceTemplate = typeof seanceTemplates.$inferSelect;
export type NewSeanceTemplate = typeof seanceTemplates.$inferInsert;
export type ExerciseInTemplate = typeof exerciseInTemplate.$inferSelect;
export type NewExerciseInTemplate = typeof exerciseInTemplate.$inferInsert;
export type DailyState = typeof dailyStates.$inferSelect;
export type NewDailyState = typeof dailyStates.$inferInsert;
export type SessionLog = typeof sessionLogs.$inferSelect;
export type NewSessionLog = typeof sessionLogs.$inferInsert;
export type SetLog = typeof setLogs.$inferSelect;
export type NewSetLog = typeof setLogs.$inferInsert;
export type BodyWeight = typeof bodyWeights.$inferSelect;
export type NewBodyWeight = typeof bodyWeights.$inferInsert;
export type CoachConversation = typeof coachConversations.$inferSelect;
export type NewCoachConversation = typeof coachConversations.$inferInsert;
export type CoachMessage = typeof coachMessages.$inferSelect;
export type NewCoachMessage = typeof coachMessages.$inferInsert;
export type SessionIncident = typeof sessionIncidents.$inferSelect;
export type NewSessionIncident = typeof sessionIncidents.$inferInsert;
export type PrecalcSession = typeof precalcSessions.$inferSelect;
export type NewPrecalcSession = typeof precalcSessions.$inferInsert;
export type SessionDebriefEnregistre = typeof sessionDebriefs.$inferSelect;
export type NewSessionDebrief = typeof sessionDebriefs.$inferInsert;
export type WeeklyDebrief = typeof weeklyDebriefs.$inferSelect;
export type NewWeeklyDebrief = typeof weeklyDebriefs.$inferInsert;
export type SessionPlanItem = typeof sessionPlanItems.$inferSelect;
export type NewSessionPlanItem = typeof sessionPlanItems.$inferInsert;
export type Contrainte = typeof contraintes.$inferSelect;
export type NewContrainte = typeof contraintes.$inferInsert;
