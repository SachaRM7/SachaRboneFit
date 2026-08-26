import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local explicitly
const envPath = resolve(__dirname, "../../.env.local");
config({ path: envPath });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is missing!");
  process.exit(1);
}

console.log("Testing connection to:", url.substring(0, 30) + "...");

import("postgres").then(({ default: postgres }) => {
  const client = postgres(url, { prepare: false });
  client.unsafe("SELECT 1").then((result: unknown) => {
    console.log("✅ Connection successful!", result);
    client.end();
  }).catch((e: Error) => {
    console.error("❌ Connection failed:", e.message);
    process.exit(1);
  });
});
