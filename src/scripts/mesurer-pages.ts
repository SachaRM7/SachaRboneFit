/**
 * Combien coûte l'ouverture d'une page, en requêtes et en millisecondes.
 *
 * Mesure LOCALE, sur une base locale : les chiffres ne sont pas ceux de la
 * production, où la base vit dans une autre région que la fonction et où
 * chaque aller-retour coûte des dizaines de millisecondes de plus. Ce qui se
 * transporte, c'est le NOMBRE de requêtes et leur enchaînement — c'est lui qui
 * se multiplie par la latence réelle.
 *
 *   DATABASE_URL=… npx tsx src/scripts/mesurer-pages.ts
 */
import { config } from "dotenv";
import path from "node:path";
import postgres from "postgres";

config({ path: path.resolve(process.cwd(), ".env.local") });

const URL_BASE = process.env.DATABASE_URL;
if (!URL_BASE) throw new Error("DATABASE_URL requis");

const sql = postgres(URL_BASE, { max: 5, onnotice: () => {} });

/**
 * Le compteur vient de Postgres, pas de l'application.
 *
 * Drizzle fixe son logger à la construction, et brancher un client à part ne
 * mesurerait pas le bon : c'est l'enchaînement des requêtes de `db` qui coûte,
 * d'autant plus que le pool applicatif est réglé à UNE connexion — elles se
 * sérialisent donc toutes, y compris sous `Promise.all`.
 *
 * Chaque requête sans transaction explicite valide la sienne : le compteur de
 * commits de la base est donc une mesure fidèle du nombre d'allers-retours.
 */
let requetes = 0;

/**
 * Le compteur s'intercale entre Drizzle et postgres.js.
 *
 * Le logger de Drizzle se fixe à la construction, et `pg_stat_database` est
 * alimenté de façon différée : ni l'un ni l'autre ne convient. Drizzle appelle
 * `unsafe()` sur le client sous-jacent pour chaque requête — c'est le point de
 * passage obligé, et le seul qui compte exactement.
 */
function brancherCompteur(db: unknown) {
  const client = (db as { $client: { unsafe: (...a: unknown[]) => unknown } }).$client;
  const original = client.unsafe.bind(client);
  client.unsafe = (...args: unknown[]) => {
    requetes += 1;
    return original(...args);
  };
}

async function chrono<T>(nom: string, f: () => Promise<T>) {
  requetes = 0;
  const debut = performance.now();
  const resultat = await f();
  return { nom, ms: Math.round(performance.now() - debut), requetes, resultat };
}

async function main() {
  const [utilisateur] = await sql`select id, email from users order by created_at limit 1`;
  if (!utilisateur) throw new Error("Aucun utilisateur dans cette base");
  const userId = utilisateur.id as string;

  process.env.DATABASE_URL = URL_BASE;
  const { db } = await import("../db/client");
  const schema = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  brancherCompteur(db);

  /**
   * Les modules sont chargés AVANT la première mesure.
   *
   * Ils l'étaient à l'intérieur, au premier `import()` dynamique de chaque
   * chemin. Le premier mesuré payait donc le chargement de tout le graphe des
   * services — transpilation comprise — et les suivants trouvaient le cache :
   * l'écran Programme est ressorti à 273 ms pour huit requêtes sur une base
   * locale minuscule, ce qui ne décrivait que le démarrage de `tsx`.
   *
   * Le nombre de requêtes, lui, n'a jamais été affecté : c'est la mesure qui
   * porte la conclusion, et le temps qui sert d'indice.
   */
  const { and, isNull, sql: raw } = await import("drizzle-orm");
  const { machinesUtilisablesAujourdhui, seancesRealisees } = await import("../db/archivage");
  const { vueDuProgramme } = await import("../services/cycle");
  const { alertes } = await import("../services/progression");
  const { bilanDeProgression } = await import("../services/bilan");
  const { donneesTableauDeBord } = await import("../services/tableau-de-bord");
  const { lirePlan } = await import("../services/plan-seance");

  const lignes: Array<{ nom: string; ms: number; requetes: number }> = [];

  // --- Le garde du layout, payé à CHAQUE navigation ---
  lignes.push(await chrono("layout : profil onboarding", async () => {
    await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
      columns: { onboardingTermineLe: true },
    });
  }));

  // --- Les pages serveur de « Plus » ---
  lignes.push(await chrono("salles : liste + inventaire", async () => {
    await db
      .select({ gym: schema.gyms, appareils: raw<number>`cast(count(${schema.exerciseInstances.id}) as int)` })
      .from(schema.gyms)
      .leftJoin(schema.exerciseInstances,
        and(eq(schema.exerciseInstances.gymId, schema.gyms.id), machinesUtilisablesAujourdhui()))
      .where(and(eq(schema.gyms.userId, userId), isNull(schema.gyms.archiveLe)))
      .groupBy(schema.gyms.id);
  }));

  lignes.push(await chrono("programme : vue du cycle", async () => {
    await vueDuProgramme(userId);
  }));

  lignes.push(await chrono("progression : alertes", async () => {
    await alertes(userId);
  }));

  lignes.push(await chrono("progression : bilan (page)", async () => {
    await bilanDeProgression(userId);
  }));

  // Le vrai service, celui que la page serveur appelle désormais.
  lignes.push(await chrono("dashboard : tout le contenu", async () => {
    await donneesTableauDeBord(userId);
  }));

  // L'écran de séance : c'est lui qui lit un historique par exercice.
  const [seanceRecente] = await sql`
    select id from session_logs where user_id = ${userId} and duree_minutes is not null
    order by date desc limit 1`;
  if (seanceRecente) {
    lignes.push(await chrono("séance live : lecture du plan", async () => {
      await lirePlan(userId, seanceRecente.id as string);
    }));
  }

  lignes.push(await chrono("historique : séances réalisées", async () => {
    await db.query.sessionLogs.findMany({ where: seancesRealisees(userId), limit: 20 });
  }));

  const largeur = Math.max(...lignes.map((l) => l.nom.length));
  console.log("\n  chemin".padEnd(largeur + 4) + "  requêtes      ms");
  console.log("  " + "─".repeat(largeur + 22));
  for (const l of lignes) {
    console.log(`  ${l.nom.padEnd(largeur)}  ${String(l.requetes).padStart(8)}  ${String(l.ms).padStart(6)}`);
  }
  console.log();

  await sql.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
