import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * Tout ce que l'accueil doit savoir, en un aller-retour.
 *
 * Le chemin critique lisait treize fois la base. Avec `max: 1` — réglage voulu,
 * il évite la saturation du pooler — ces treize lectures ne se recouvrent pas :
 * elles s'additionnent. Et la fonction s'exécute à Washington. Treize fois la
 * traversée de l'Atlantique avant le premier pixel, pour des tables qui, pour
 * un compte, tiennent en quelques dizaines de lignes.
 *
 * Aucune de ces lectures n'avait besoin de la précédente. Elles étaient
 * séparées parce que l'ORM les écrit ainsi, pas parce que la base l'exigeait.
 * Postgres sait très bien répondre à treize questions indépendantes d'un coup :
 * c'est ce que fait cette requête, une CTE par question, un objet JSON par
 * réponse.
 *
 * Ce qui n'est PAS fait ici, et volontairement : aucune règle métier. Le choix
 * de la salle du jour, le calcul du feu, l'état du jour, la faisabilité d'un
 * exercice restent des fonctions pures, testées, en TypeScript. Cette requête
 * ne fait que lire — la déplacer en SQL, ce serait dupliquer des règles qui ont
 * déjà leur démonstration.
 *
 * Les dates sont converties en texte explicitement. Le pilote rend un objet
 * `Date` pour une colonne `date`, là où tout le reste de l'application compare
 * des chaînes `AAAA-MM-JJ` : la conversion implicite aurait produit des
 * comparaisons toujours fausses, silencieusement.
 */

export interface SalleLue {
  id: string;
  userId: string | null;
  nom: string;
  equipementsDisponibles: string[] | null;
  inventaireStatut: string | null;
}

export interface GabaritLu {
  id: string;
  lettre: string | null;
  nom: string;
  ordreDansSemaine: number | null;
}

export interface ContexteEssentiel {
  utilisateur: {
    nom: string | null;
    prefSalleParDefautId: string | null;
    frequenceMaxParSemaine: number | null;
  } | null;
  poids: Array<{ date: string; poids: number }>;
  feuTendance: string | null;
  etatDuJour: {
    date: string;
    sommeilHeures: number | null;
    jeuneBool: boolean | null;
    shiftRecentBool: boolean | null;
    shiftType: string | null;
    energieDepart: number | null;
    courbatures: { muscle: string; intensite: number }[] | null;
    materielApporte: string[] | null;
  } | null;
  /** Les dates des séances RÉALISÉES depuis lundi. */
  semaine: string[];
  salles: SalleLue[];
  blocActif: { id: string; nom: string; typeCycle: string | null } | null;
  /** Les gabarits du bloc actif, dans l'ordre de la semaine. */
  gabarits: GabaritLu[];
  /** Le gabarit de la dernière séance close du bloc — pour la rotation. */
  dernierGabaritId: string | null;
}

/**
 * « Réalisée » veut dire : non archivée, et portant au moins une série.
 *
 * Écrit ici en toutes lettres parce que la requête est brute. C'est la même
 * règle que `estUneSeanceRealisee()` dans `db/archivage.ts` — une séance
 * ouverte puis abandonnée ne compte pas, sinon la rotation avance sans que
 * rien n'ait été soulevé. Toute divergence entre les deux serait un bug : le
 * test d'intégration compare les deux chemins.
 */
const REALISEE = sql`sl.archive_le is null and exists (
  select 1 from set_logs where set_logs.session_log_id = sl.id
)`;

export async function contexteEssentiel(
  userId: string,
  aujourdhui: string,
  debutSemaine: string,
): Promise<ContexteEssentiel> {
  const lignes = await db.execute<{ contexte: ContexteEssentiel }>(sql`
    with
      bloc as (
        select id, nom, type_cycle
        from programme_blocs
        where user_id = ${userId} and archive_le is null and actif
        order by date_debut desc
        limit 1
      ),
      dernier as (
        select sl.seance_template_id as id
        from session_logs sl
        join seance_templates st on st.id = sl.seance_template_id
        join bloc on st.bloc_id = bloc.id
        where sl.user_id = ${userId} and sl.duree_minutes is not null and ${REALISEE}
        order by sl.date desc, sl.created_at desc
        limit 1
      )
    select json_build_object(
      'utilisateur', (
        select json_build_object(
          'nom', nom,
          'prefSalleParDefautId', pref_salle_par_defaut_id,
          'frequenceMaxParSemaine', frequence_max_par_semaine
        )
        from users where id = ${userId}
      ),
      'poids', coalesce((
        select json_agg(json_build_object('date', date::text, 'poids', poids)
                        order by date desc)
        from (
          select date, poids from body_weights
          where user_id = ${userId}
          order by date desc
          limit 30
        ) p
      ), '[]'::json),
      'feuTendance', (
        select sl.feu_biologique_tendance
        from session_logs sl
        where sl.user_id = ${userId} and ${REALISEE}
        order by sl.created_at desc
        limit 1
      ),
      'etatDuJour', (
        select json_build_object(
          'date', date::text,
          'sommeilHeures', sommeil_heures,
          'jeuneBool', jeune_bool,
          'shiftRecentBool', shift_recent_bool,
          'shiftType', shift_type,
          'energieDepart', energie_depart,
          'courbatures', courbatures,
          'materielApporte', materiel_apporte
        )
        from daily_states
        where user_id = ${userId} and date = ${aujourdhui}::date
      ),
      'semaine', coalesce((
        select json_agg(sl.date::text)
        from session_logs sl
        where sl.user_id = ${userId} and sl.date >= ${debutSemaine}::date and ${REALISEE}
      ), '[]'::json),
      'salles', coalesce((
        select json_agg(json_build_object(
          'id', id,
          'userId', user_id,
          'nom', nom,
          'equipementsDisponibles', equipements_disponibles,
          'inventaireStatut', inventaire_statut
        ))
        from gyms where archive_le is null
      ), '[]'::json),
      'blocActif', (
        select json_build_object('id', id, 'nom', nom, 'typeCycle', type_cycle)
        from bloc
      ),
      'gabarits', coalesce((
        select json_agg(json_build_object(
          'id', st.id,
          'lettre', st.lettre,
          'nom', st.nom,
          'ordreDansSemaine', st.ordre_dans_semaine
        ) order by st.ordre_dans_semaine asc)
        from seance_templates st join bloc on st.bloc_id = bloc.id
      ), '[]'::json),
      'dernierGabaritId', (select id from dernier)
    ) as contexte
  `);

  const contexte = lignes[0]?.contexte;
  if (!contexte) {
    throw new Error("Lecture de l'accueil : aucune ligne rendue.");
  }
  return contexte;
}

export interface InventaireLu {
  catalogue: Array<{ id: string; equipement: string | null; slug: string }>;
  instances: Array<{
    id: string;
    exerciseId: string;
    /** `machine_nom` est NOT NULL au schéma : le nom est toujours là. */
    machineNom: string;
    incrementsPossibles: number[] | null;
  }>;
}

/**
 * Le catalogue et le parc du lieu, ensemble.
 *
 * Deux lectures indépendantes qui servaient un seul calcul — combien
 * d'exercices ce lieu permet. Elles ne peuvent pas rejoindre la requête
 * précédente : le lieu qu'on interroge dépend de `choisirSalleDuJour`, une
 * règle qui vit en TypeScript avec sa démonstration, et qu'on ne va pas
 * réécrire en SQL pour économiser un aller-retour.
 *
 * Le catalogue est lu avec trois colonnes. Il l'était avec sept, dont
 * `muscles_principaux` — un tableau JSON — pour cent vingt exercices, alors
 * que seul le NOMBRE d'exercices faisables est renvoyé.
 */
export async function inventaireDuLieu(gymId: string): Promise<InventaireLu> {
  const lignes = await db.execute<{ inventaire: InventaireLu }>(sql`
    select json_build_object(
      'catalogue', coalesce((
        select json_agg(json_build_object('id', id, 'equipement', equipement, 'slug', slug))
        from exercises
      ), '[]'::json),
      'instances', coalesce((
        select json_agg(json_build_object(
          'id', id,
          'exerciseId', exercise_id,
          'machineNom', machine_nom,
          'incrementsPossibles', increments_possibles
        ))
        from exercise_instances
        where gym_id = ${gymId} and archive_le is null and etat = 'disponible'
      ), '[]'::json)
    ) as inventaire
  `);

  return lignes[0]?.inventaire ?? { catalogue: [], instances: [] };
}
