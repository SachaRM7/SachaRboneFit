import { config } from "dotenv";
import path from "path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

/**
 * Une base vide plus les migrations doit donner le schéma que l'application attend.
 *
 * Ça n'a pas toujours été vrai. Plusieurs chantiers ont modifié la base avec
 * `drizzle-kit push`, qui applique une différence sans laisser de fichier : le
 * schéma vivant avançait, l'historique versionné restait derrière, et rien ne
 * le signalait — une dérive de schéma ne casse rien tant qu'on ne reconstruit
 * pas. Elle s'est vue le jour où une base neuve a refusé une colonne
 * `archive_le` que tout le moteur utilise.
 *
 * Ce script reconstruit les deux côtés et les compare :
 *
 *   1. une base vide, puis toutes les migrations du dépôt dans l'ordre ;
 *   2. une base vide, puis `drizzle-kit push` — c'est-à-dire `schema.ts` ;
 *   3. la différence, colonne par colonne, contrainte par contrainte.
 *
 * Il sort en échec à la moindre divergence. C'est précisément ce qui manquait :
 * un `push` de plus recréerait la dérive, mais plus en silence.
 *
 *   DATABASE_URL=postgres://…/postgres npx tsx src/scripts/verifier-migrations.ts
 *
 * L'URL doit désigner une base d'ADMINISTRATION (souvent `postgres`) sur un
 * serveur jetable : le script crée et détruit deux bases temporaires.
 */

const projectRoot = path.resolve(__dirname, "../..");
config({ path: path.join(projectRoot, ".env.local") });

const DOSSIER_MIGRATIONS = path.join(projectRoot, "src/db/migrations");
const BASE_DEPUIS_MIGRATIONS = "verif_migrations";
const BASE_DEPUIS_SCHEMA = "verif_schema";

/**
 * L'inventaire du schéma, réduit à ce qui a un effet.
 *
 * On ne compare pas des fichiers SQL : l'ordre des instructions, les
 * commentaires et le formatage de `pg_dump` produiraient un bruit qui noierait
 * les vraies différences. On interroge le catalogue, et on trie.
 *
 * Ce qui entre dans la comparaison : colonnes (type, nullabilité, défaut),
 * clés étrangères avec leurs actions ON DELETE / ON UPDATE, clés primaires,
 * contraintes uniques et de vérification, et index.
 */
const INVENTAIRE = `
  SELECT 'colonne  ' || table_name || '.' || column_name || ' : ' || data_type
         || coalesce('(' || character_maximum_length || ')', '')
         || ' | ' || (CASE WHEN is_nullable = 'YES' THEN 'nullable' ELSE 'non nul' END)
         || ' | défaut ' || coalesce(column_default, '(aucun)') AS ligne
    FROM information_schema.columns
   WHERE table_schema = 'public'
  UNION ALL
  SELECT 'contrainte ' || c.conrelid::regclass || ' ' || c.conname
         || ' : ' || pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
   WHERE n.nspname = 'public' AND c.contype IN ('f', 'p', 'u', 'c')
  UNION ALL
  SELECT 'index    ' || tablename || ' : ' || indexdef
    FROM pg_indexes
   WHERE schemaname = 'public'
   ORDER BY 1
`;

function psql(base: string, sql: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${base}`;
  return execFileSync(
    "psql",
    [url.toString(), "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function psqlFichier(base: string, chemin: string): void {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${base}`;
  execFileSync("psql", [url.toString(), "-q", "-v", "ON_ERROR_STOP=1", "-f", chemin], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Une instruction d'administration à la fois.
 *
 * `CREATE DATABASE` et `DROP DATABASE` refusent de s'exécuter dans une
 * transaction, et le pilote en ouvre une dès qu'il reçoit plusieurs
 * instructions d'un coup.
 */
async function surLAdmin(instructions: string[]): Promise<void> {
  const db = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  for (const sql of instructions) await db.unsafe(sql);
  await db.end();
}

function inventaire(base: string): string[] {
  return psql(base, INVENTAIRE)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

/**
 * Les migrations, dans l'ordre.
 *
 * Le marqueur `--> statement-breakpoint` est une convention de Drizzle, pas du
 * SQL : `psql` s'en accommode mal, on le retire avant d'exécuter.
 */
function appliquerLesMigrations(base: string): string[] {
  const fichiers = fs
    .readdirSync(DOSSIER_MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const temporaire = path.join(projectRoot, ".migration-en-cours.sql");
  for (const fichier of fichiers) {
    const sql = fs
      .readFileSync(path.join(DOSSIER_MIGRATIONS, fichier), "utf8")
      .replaceAll("--> statement-breakpoint", "");
    fs.writeFileSync(temporaire, sql);
    try {
      psqlFichier(base, temporaire);
    } catch (e) {
      fs.rmSync(temporaire, { force: true });
      throw new Error(`Migration ${fichier} en échec :\n${String(e)}`);
    }
  }
  fs.rmSync(temporaire, { force: true });
  return fichiers;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL manquante.");
    process.exit(1);
  }

  await surLAdmin([
    `DROP DATABASE IF EXISTS ${BASE_DEPUIS_MIGRATIONS}`,
    `DROP DATABASE IF EXISTS ${BASE_DEPUIS_SCHEMA}`,
    `CREATE DATABASE ${BASE_DEPUIS_MIGRATIONS}`,
    `CREATE DATABASE ${BASE_DEPUIS_SCHEMA}`,
  ]);

  const fichiers = appliquerLesMigrations(BASE_DEPUIS_MIGRATIONS);
  console.log(`${fichiers.length} migrations appliquées sur une base vide.`);

  // `push` calcule la différence entre `schema.ts` et une base vide : le
  // résultat EST le schéma attendu, sans qu'on ait à le décrire deux fois.
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${BASE_DEPUIS_SCHEMA}`;
  execFileSync("npx", ["drizzle-kit", "push", "--force"], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log("Schéma Drizzle appliqué sur une seconde base vide.");

  const parMigrations = inventaire(BASE_DEPUIS_MIGRATIONS);
  const parSchema = inventaire(BASE_DEPUIS_SCHEMA);

  const attenduEtAbsent = parSchema.filter((l) => !parMigrations.includes(l));
  const presentEtInattendu = parMigrations.filter((l) => !parSchema.includes(l));

  await surLAdmin([
    `DROP DATABASE IF EXISTS ${BASE_DEPUIS_MIGRATIONS}`,
    `DROP DATABASE IF EXISTS ${BASE_DEPUIS_SCHEMA}`,
  ]);

  if (attenduEtAbsent.length === 0 && presentEtInattendu.length === 0) {
    console.log(
      `\n${parSchema.length} éléments de schéma comparés — aucune divergence.\n`
      + "Une base vide et les migrations de ce dépôt reproduisent exactement le "
      + "schéma attendu par l'application.",
    );
    return;
  }

  console.error("\nDÉRIVE DE SCHÉMA.\n");
  if (attenduEtAbsent.length > 0) {
    console.error(
      "Attendu par l'application, absent des migrations — une base reconstruite "
      + "n'aura pas ceci :",
    );
    for (const l of attenduEtAbsent) console.error(`  manque   ${l}`);
  }
  if (presentEtInattendu.length > 0) {
    console.error(
      "\nProduit par les migrations, absent du schéma Drizzle — un "
      + "`drizzle-kit push` supprimerait ceci :",
    );
    for (const l of presentEtInattendu) console.error(`  en trop  ${l}`);
  }
  console.error(
    "\nCorrige en ajoutant une migration de rattrapage, ou en déclarant "
    + "l'élément manquant dans src/db/schema.ts. Ne modifie pas la base "
    + "directement : c'est exactement ce qui a créé cette dérive.",
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
