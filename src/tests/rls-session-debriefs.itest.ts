import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/**
 * La RLS de `session_debriefs`, exercée pour de vrai.
 *
 * La table avait été créée sans Row Level Security — c'est Supabase qui l'a
 * signalé au moment d'appliquer la migration. Un débrief contient le récit
 * d'une séance : charges, ressenti, note personnelle. Exactement ce que le
 * reste du modèle protège.
 *
 * Ce test ne recopie pas la condition de la policy : le vérifier en écrivant
 * `auth.uid() = user_id` dans une assertion ne prouverait que ma capacité à
 * relire le fichier de migration. Il ouvre une VRAIE connexion, avec un rôle
 * qui ne contourne pas la RLS, pose l'identité comme le fait Supabase — les
 * revendications du jeton — et regarde ce que la base accepte de rendre.
 *
 * Le rôle est le point central. La connexion applicative utilise `postgres`,
 * superutilisateur, `rolbypassrls = true` : sous ce rôle, la RLS est
 * intégralement ignorée et un test qui l'emprunterait passerait même sans
 * aucune policy. C'est le piège de ce genre de vérification, et c'est
 * précisément ce que le contrôle négatif ci-dessous met en évidence.
 */

const A = randomUUID();
const B = randomUUID();

const ROLE = "rls_epreuve";

const { db } = await import("@/db/client");
const schema = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");

/** La même base, mais vue par un rôle ordinaire. */
function connexionSansPrivilege(): postgres.Sql {
  const url = new URL(process.env.DATABASE_URL!);
  url.username = ROLE;
  url.password = "";
  return postgres(url.toString(), { max: 1, onnotice: () => {} });
}

let bride: postgres.Sql;
let seanceA = "";
let seanceB = "";
let salle = "";

/** Pose l'identité comme Supabase le fait : dans les revendications du jeton. */
async function enTantQue(sql: postgres.Sql, userId: string | null) {
  const claims = userId === null ? "" : JSON.stringify({ sub: userId });
  await sql`select set_config('request.jwt.claims', ${claims}, false)`;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();

  // Un rôle sans aucun privilège particulier : c'est tout l'intérêt.
  await db.execute(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
         CREATE ROLE ${ROLE} LOGIN;
       END IF;
     END $$;` as never,
  );
  await db.execute(`GRANT USAGE ON SCHEMA public, auth TO ${ROLE};` as never);
  await db.execute(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE session_debriefs TO ${ROLE};` as never,
  );

  for (const id of [A, B]) {
    await db.insert(schema.users).values({
      id, email: `${id}@t.test`, nom: "Testeur", onboardingTermineLe: new Date(),
    });
  }
  const [g] = await db.insert(schema.gyms)
    .values({ userId: A, nom: `Salle RLS ${A.slice(0, 6)}` }).returning();
  salle = g!.id;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [sa] = await db.insert(schema.sessionLogs)
    .values({ userId: A, date: aujourdhui, gymId: salle, dureeMinutes: 50 }).returning();
  seanceA = sa!.id;
  const [sb] = await db.insert(schema.sessionLogs)
    .values({ userId: B, date: aujourdhui, gymId: salle, dureeMinutes: 45 }).returning();
  seanceB = sb!.id;

  // Les deux débriefs sont écrits par le rôle applicatif, qui contourne la
  // RLS — c'est le chemin réel du serveur.
  await db.insert(schema.sessionDebriefs).values([
    { userId: A, sessionLogId: seanceA, contenu: "Débrief privé de A" },
    { userId: B, sessionLogId: seanceB, contenu: "Débrief privé de B" },
  ]);

  bride = connexionSansPrivilege();
});

afterAll(async () => {
  await bride?.end();
  await db.delete(schema.sessionDebriefs)
    .where(inArray(schema.sessionDebriefs.sessionLogId, [seanceA, seanceB]));
  await db.delete(schema.sessionLogs).where(inArray(schema.sessionLogs.id, [seanceA, seanceB]));
  await db.delete(schema.gyms).where(eq(schema.gyms.id, salle));
  await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
});

describe("la table est protégée", () => {
  it("la RLS est active", async () => {
    const [ligne] = await db.execute(
      "select relrowsecurity from pg_class where relname = 'session_debriefs'" as never,
    ) as unknown as Array<{ relrowsecurity: boolean }>;
    expect(ligne?.relrowsecurity).toBe(true);
  });

  it("la policy existe, sur toutes les commandes, dans les deux sens", async () => {
    const lignes = await db.execute(
      `select policyname, cmd, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'session_debriefs'` as never,
    ) as unknown as Array<{ policyname: string; cmd: string; qual: string; with_check: string }>;

    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.policyname).toBe("session_debriefs_all_own");
    expect(lignes[0]!.cmd).toBe("ALL");
    // `USING` protège la lecture, `WITH CHECK` l'écriture. L'une sans l'autre
    // laisserait écrire chez autrui, ou lire ce qu'on ne peut pas écrire.
    expect(lignes[0]!.qual).toBe("(auth.uid() = user_id)");
    expect(lignes[0]!.with_check).toBe("(auth.uid() = user_id)");
  });
});

describe("ce que la base rend, sous un rôle ordinaire", () => {
  it("A voit son débrief", async () => {
    await enTantQue(bride, A);
    const lignes = await bride`select contenu from session_debriefs where session_log_id = ${seanceA}`;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.contenu).toBe("Débrief privé de A");
  });

  it("B ne voit pas celui de A", async () => {
    await enTantQue(bride, B);
    const lignes = await bride`select contenu from session_debriefs where session_log_id = ${seanceA}`;
    // Zéro ligne, et non une erreur : c'est ainsi que la RLS filtre.
    expect(lignes).toHaveLength(0);
  });

  it("B voit le sien, ce qui prouve que la table n'est pas simplement vide", async () => {
    // Sans ce contrôle, un test qui ne rendrait JAMAIS rien passerait aussi.
    await enTantQue(bride, B);
    const lignes = await bride`select contenu from session_debriefs where session_log_id = ${seanceB}`;
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.contenu).toBe("Débrief privé de B");
  });

  it("sans identité, on ne voit rien du tout", async () => {
    await enTantQue(bride, null);
    const lignes = await bride`select contenu from session_debriefs`;
    expect(lignes).toHaveLength(0);
  });

  it("B ne peut pas écrire un débrief au nom de A", async () => {
    await enTantQue(bride, B);
    // C'est `WITH CHECK` qui refuse : sans lui, la lecture serait protégée et
    // l'écriture ouverte.
    await expect(
      bride`insert into session_debriefs (user_id, session_log_id, contenu)
            values (${A}, ${seanceA}, 'Écrit par B')`,
    ).rejects.toThrow(/row-level security/i);
  });

  it("B ne peut pas non plus effacer celui de A", async () => {
    await enTantQue(bride, B);
    const efface = await bride`delete from session_debriefs where session_log_id = ${seanceA} returning id`;
    expect(efface).toHaveLength(0);

    // Et il est toujours là, vu par le rôle applicatif.
    const reste = await db.select().from(schema.sessionDebriefs)
      .where(eq(schema.sessionDebriefs.sessionLogId, seanceA));
    expect(reste).toHaveLength(1);
  });
});

describe("le serveur applicatif reste compatible", () => {
  it("son rôle contourne la RLS — c'est pourquoi rien ne casse", async () => {
    /*
     * Le fait qui explique tout le reste, et qu'il vaut mieux vérifier
     * qu'affirmer : si ce rôle cessait un jour de contourner la RLS, les
     * lectures serveur de `session_debriefs` rendraient zéro ligne sans
     * erreur — la panne la plus discrète qui soit.
     */
    const [role] = await db.execute(
      "select rolbypassrls, rolsuper from pg_roles where rolname = current_user" as never,
    ) as unknown as Array<{ rolbypassrls: boolean; rolsuper: boolean }>;
    expect(role!.rolbypassrls || role!.rolsuper).toBe(true);
  });

  it("et il lit bien les deux débriefs, RLS active", async () => {
    const { debriefEnregistre } = await import("@/services/debrief-seance");
    expect((await debriefEnregistre(A, seanceA))?.contenu).toBe("Débrief privé de A");
    expect((await debriefEnregistre(B, seanceB))?.contenu).toBe("Débrief privé de B");
    // Le filtre applicatif tient tout seul : c'est la première barrière, la
    // RLS est la seconde.
    expect(await debriefEnregistre(A, seanceB)).toBeNull();
  });
});
