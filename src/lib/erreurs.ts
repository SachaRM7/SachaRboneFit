/**
 * Deroule une chaine de causes en un message lisible.
 *
 * Drizzle enveloppe l'erreur du pilote dans un message « Failed query: … » qui
 * cite le SQL mais tait la raison du refus. C'est ce qui rendait une panne
 * indiagnosticable : on lisait la requete, jamais l'erreur. Postgres met le
 * detail utile dans `cause` — code SQLSTATE, contrainte violee, routine.
 */
export function detailErreur(erreur: unknown): string {
  const morceaux: string[] = [];
  let courant: unknown = erreur;

  // Une chaine de causes est bornee : au-dela, c'est un cycle.
  for (let profondeur = 0; courant && profondeur < 5; profondeur += 1) {
    if (courant instanceof Error) {
      const pg = courant as Error & { code?: string; detail?: string; constraint_name?: string };
      const annotations = [pg.code && `code ${pg.code}`, pg.constraint_name, pg.detail]
        .filter(Boolean)
        .join(" — ");
      morceaux.push(annotations ? `${courant.message} [${annotations}]` : courant.message);
      courant = courant.cause;
    } else {
      morceaux.push(String(courant));
      break;
    }
  }

  return morceaux.join(" ← ") || "erreur inconnue";
}
