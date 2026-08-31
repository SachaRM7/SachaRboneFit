import { db } from "./client";

/**
 * De quoi lire : le client de base, ou la transaction en cours.
 *
 * Un service qui lit avec `db` alors qu'une transaction est ouverte lit *à
 * côté* d'elle — hors du verrou, sur l'état d'avant, et sans voir les écritures
 * qui viennent d'être faites. Un validateur appelé ainsi juge donc autre chose
 * que ce qu'il croit juger.
 *
 * Ce type existe pour rendre ce choix explicite plutôt que subi : tout service
 * qui peut être appelé depuis une transaction prend un exécuteur en dernier
 * paramètre, avec `db` par défaut. Les appelants hors transaction ne changent
 * pas, et ceux qui sont dedans passent leur `tx`.
 */
export type Lecteur = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
