import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Les tests qui RENDENT des composants.
 *
 * Séparés de `vitest.config.mts` pour deux raisons. D'abord le coût : jsdom
 * démarre un navigateur simulé, et la suite unitaire — un millier de tests de
 * fonctions pures — doit rester en quelques secondes. Ensuite l'honnêteté du
 * périmètre : un test qui rend un composant ne prouve pas la même chose qu'un
 * test de logique, et les confondre dans un même compte donnerait une
 * couverture qu'on croit avoir.
 *
 * Ce qu'on vient chercher ici, et qu'aucune fonction pure ne peut donner : ce
 * que l'écran AFFICHE réellement après un geste. Le défaut que ce lot ferme —
 * une série validée qui disparaît de sa carte — était exactement de cette
 * nature : la donnée était juste, le rendu non.
 *
 * PAS DE `@vitejs/plugin-react` : il tire `@babel/core@8` là où le dépôt tient
 * la 7, et son seul apport ici serait le rafraîchissement à chaud, qui ne sert
 * pas dans une suite de tests. Vitest transforme déjà le JSX de lui-même.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.ctest.tsx"],
    setupFiles: ["src/tests/setup-composants.ts"],
    globals: true,
    restoreMocks: true,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
