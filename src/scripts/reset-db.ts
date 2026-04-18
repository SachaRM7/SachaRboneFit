import { config } from "dotenv";
import path from "path";

// Find .env.local in the project root (two levels up from scripts/)
const projectRoot = path.resolve(__dirname, "../..");
config({ path: path.join(projectRoot, ".env.local") });

console.log("Looking for .env.local at:", path.join(projectRoot, ".env.local"));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing! Available vars:", Object.keys(process.env).filter(k => k.includes("DATABASE") || k.includes("POSTGRES")));
  process.exit(1);
}

import postgres from "postgres";

const client = postgres(url, { prepare: false });

async function reset() {
  console.log("Dropping all tables...");
  try {
    await client.unsafe(`
      DROP TABLE IF EXISTS set_logs CASCADE;
      DROP TABLE IF EXISTS session_logs CASCADE;
      DROP TABLE IF EXISTS daily_states CASCADE;
      DROP TABLE IF EXISTS exercise_in_template CASCADE;
      DROP TABLE IF EXISTS seance_templates CASCADE;
      DROP TABLE IF EXISTS programme_blocs CASCADE;
      DROP TABLE IF EXISTS exercise_instances CASCADE;
      DROP TABLE IF EXISTS exercises CASCADE;
      DROP TABLE IF EXISTS gyms CASCADE;
      DROP TABLE IF EXISTS body_weights CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP INDEX IF EXISTS user_date_unique CASCADE;
      DROP INDEX IF EXISTS user_date_unique_body_weights CASCADE;
    `);
    console.log("✅ All tables dropped");
  } catch (e: unknown) {
    console.error("❌ Error:", (e as Error).message);
  } finally {
    await client.end();
  }
}

reset();
