import { it, expect, vi } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { seancesRealisees } from "@/db/archivage";
import { REALISEE } from "@/services/tableau-de-bord-lecture";

vi.mock("@/db/client", () => ({ db: {} }));

// Uniquement des tables temporaires à cette connexion : aucune donnée métier
// n'est créée ou modifiée, même si DATABASE_URL pointe sur une base existante.
it("accueil et programme attendent la clôture, même après trois séries", async () => {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const dialect = new PgDialect();
  try {
    await client.begin(async (tx) => {
      await tx`create temporary table session_logs (
        id text, user_id text, archive_le timestamp, duree_minutes integer
      ) on commit drop`;
      await tx`create temporary table set_logs (session_log_id text) on commit drop`;
      await tx`insert into session_logs values ('C', 'sacha', null, null)`;
      const compter = async () => {
        const queries = [
          sql`select count(*)::int as n from session_logs where ${seancesRealisees("sacha")}`,
          sql`select count(*)::int as n from session_logs sl where sl.user_id = ${"sacha"} and ${REALISEE}`,
        ];
        const counts = [];
        for (const query of queries) {
          const compiled = dialect.sqlToQuery(query);
          const rows = await tx.unsafe(compiled.sql, compiled.params);
          counts.push(rows[0].n);
        }
        return counts;
      };
      expect(await compter()).toEqual([0, 0]);
      await tx`insert into set_logs values ('C'), ('C'), ('C')`;
      expect(await compter()).toEqual([0, 0]);
      await tx`update session_logs set duree_minutes = 45 where id = 'C'`;
      expect(await compter()).toEqual([1, 1]);
      await tx`insert into session_logs values ('vide', 'sacha', null, 0), ('autre', 'autre', null, 45)`;
      await tx`insert into set_logs values ('autre')`;
      expect(await compter()).toEqual([1, 1]);
      await tx`update session_logs set archive_le = now() where id = 'C'`;
      expect(await compter()).toEqual([0, 0]);
    });
  } finally {
    await client.end();
  }
});
