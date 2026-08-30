import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Suite d'intégration : elle parle à une vraie base Postgres.
 *
 * Séparée de la suite unitaire parce qu'elle a besoin d'un serveur : les 238
 * tests unitaires vérifient des décisions, pas la persistance. Or c'est
 * précisément entre les deux — le schéma, les jointures, l'enchaînement des
 * routes — que les pannes de cette application se sont toujours produites.
 *
 *   DATABASE_URL=postgres://… npx vitest run --config vitest.integration.config.ts
 *
 * À faire tourner sur une base jetable : la suite écrit et efface.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.itest.ts"],
    // Les scénarios partagent la base : les faire tourner en parallèle
    // reviendrait à tester des interférences plutôt que le parcours.
    fileParallelism: false,
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
