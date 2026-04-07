import type { Config } from "drizzle-kit";
import { config } from "dotenv";
import path from "path";

// Load .env.local explicitly
config({ path: path.resolve(__dirname, ".env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: DATABASE_URL },
} satisfies Config;
