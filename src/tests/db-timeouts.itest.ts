import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

const { db } = await import("@/db/client");
const { complementTableauDeBord } = await import("@/services/tableau-de-bord");
const { recuperationMusculaire } = await import("@/services/recuperation");

const UTILISATEUR_INEXISTANT = randomUUID();

/**
 * Le timeout borne le scénario sans laisser un timer actif après son issue.
 * Le compte de test est volontairement absent : ce scénario ne crée ni ne
 * modifie aucune donnée, même si quelqu'un le lance par erreur sur une base
 * qui n'est pas la base jetable.
 */
async function avecDelai<T>(travail: Promise<T>, millisecondes: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Le travail dépasse ${millisecondes} ms.`)),
        millisecondes,
      );
      travail.then(resolve, reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe("accueil sous concurrence avec max:1", () => {
  it("termine les récupérations concurrentes sans requête pendante", async () => {
    const resultats = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        avecDelai(recuperationMusculaire(UTILISATEUR_INEXISTANT), 10_000),
      ),
    );

    expect(resultats.filter((r) => r.status === "rejected"), "récupérations rejetées")
      .toEqual([]);
  });

  it("termine les compléments concurrents sans bloquer l'accueil", async () => {
    const resultats = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        avecDelai(complementTableauDeBord(UTILISATEUR_INEXISTANT), 15_000),
      ),
    );

    expect(resultats.filter((r) => r.status === "rejected"), "compléments rejetés")
      .toEqual([]);
  });

  it("libère la connexion après une erreur SQL", async () => {
    await expect(db.execute(sql`select cast(1 as integer) / 0`)).rejects.toThrow();

    const lignes = await avecDelai(
      db.execute<{ ok: number }>(sql`select 1 as ok`),
      5_000,
    );
    expect(lignes[0]?.ok).toBe(1);
  });

  it("conserve les transactions avec le pipeline désactivé", async () => {
    const resultat = await avecDelai(
      db.transaction(async (tx) => {
        const lignes = await tx.execute<{ ok: number }>(sql`select 1 as ok`);
        return lignes[0]?.ok;
      }),
      5_000,
    );

    expect(resultat).toBe(1);
  });

  it("reprend les transactions après fermeture inactive, puis accepte des écritures concurrentes", async () => {
    const premier = await avecDelai(db.transaction(async (tx) => {
      const lignes = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      return lignes[0].pid;
    }), 5_000);

    // Vraie fermeture idle_timeout=20 s : une boucle rapide de transactions
    // ne reproduit pas la pause entre deux séries d'une séance.
    await new Promise((resolve) => setTimeout(resolve, 22_000));

    const second = await avecDelai(db.transaction(async (tx) => {
      const lignes = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      return lignes[0].pid;
    }), 5_000);
    expect(second).not.toBe(premier);

    const resultats = await avecDelai(Promise.all(Array.from({ length: 8 }, (_, valeur) =>
      db.transaction(async (tx) => {
        // Table temporaire propre à la transaction : aucune table utilisateur.
        await tx.execute(sql`create temporary table reprise_transaction (valeur integer) on commit drop`);
        await tx.execute(sql`insert into reprise_transaction values (${valeur})`);
        const lignes = await tx.execute<{ valeur: number }>(sql`select valeur from reprise_transaction`);
        return lignes[0].valeur;
      }),
    )), 5_000);
    expect(resultats).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    await expect(db.transaction(async (tx) => {
      await tx.execute(sql`select 1 / 0`);
    })).rejects.toThrow();
    const apresErreur = await avecDelai(db.transaction(async (tx) => {
      const lignes = await tx.execute<{ ok: number }>(sql`select 1 as ok`);
      return lignes[0].ok;
    }), 5_000);
    expect(apresErreur).toBe(1);
  }, 45_000);

});
