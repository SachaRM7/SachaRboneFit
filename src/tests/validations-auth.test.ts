import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Combien de fois l'identité est-elle vérifiée pour une seule navigation ?
 *
 * La réponse était trois, et personne ne pouvait le voir en lisant un fichier :
 * le proxy appelait `getUser()` deux fois de suite — « une pour rafraîchir, une
 * pour lire » — et le rendu une troisième. Chacun de ces appels est un
 * aller-retour réseau vers le serveur d'authentification, payé avant le premier
 * octet de la page.
 *
 * Le nombre n'est jamais visible d'un seul endroit : il se compte en
 * additionnant des appels dispersés. Ce fichier le compte donc à la place du
 * lecteur, de deux façons complémentaires :
 *
 *   1. un inventaire déclaré de TOUS les appels d'authentification du code
 *      serveur, avec pour chacun la raison qui le justifie. En ajouter un
 *      ailleurs fait échouer ce test tant que la raison n'est pas écrite ;
 *   2. le proxy en particulier ne doit en faire qu'un seul, ce qui se vérifie
 *      sur son texte : deux appels séparés par un `await` sont exactement la
 *      forme qui avait échappé à la relecture.
 *
 * Ce test ne remplace pas la mesure — c'est l'instrumentation qui dit ce que
 * ça coûte. Il empêche la régression silencieuse.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function sources(dossier = ""): string[] {
  const entrees = readdirSync(path.join(RACINE, dossier), { withFileTypes: true });
  const fichiers: string[] = [];
  for (const e of entrees) {
    const relatif = dossier ? `${dossier}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (relatif === "tests" || relatif === "db/migrations") continue;
      fichiers.push(...sources(relatif));
    } else if (/\.tsx?$/.test(e.name) && !/\.i?test\.ts$/.test(e.name)) {
      fichiers.push(relatif);
    }
  }
  return fichiers.sort();
}

/**
 * Le code seul. Les commentaires de ce projet citent volontiers l'appel
 * qu'ils expliquent — et le commentaire du proxy cite `getUser()` deux fois,
 * précisément pour raconter ce qui a été supprimé.
 */
function code(fichier: string): string {
  return readFileSync(path.join(RACINE, fichier), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Tout ce qui vérifie une identité auprès de Supabase. */
const VERIFICATION = /auth\s*\.\s*(getUser|getClaims|getSession)\s*\(/g;

/**
 * L'inventaire, et la raison de chaque appel.
 *
 * La clé est le fichier, la valeur le nombre d'appels attendus. Un fichier
 * absent d'ici ne doit contenir aucune vérification : il passe par
 * `getAuthenticatedUserId`, qui la mémoïse pour tout le rendu.
 */
const AUTORISES: Record<string, { appels: number; pourquoi: string }> = {
  "proxy.ts": {
    appels: 1,
    pourquoi:
      "Le garde d'entrée. Il s'exécute dans un runtime distinct du rendu et ne " +
      "peut donc pas partager sa vérification avec lui. UNE seule, jamais deux.",
  },
  "lib/supabase/auth-helper.ts": {
    appels: 1,
    pourquoi:
      "La source unique du rendu. `cache()` la ramène à un appel par requête " +
      "HTTP, quel que soit le nombre de composants qui la demandent.",
  },
  "app/api/user/route.ts": {
    appels: 1,
    pourquoi:
      "Création de la ligne applicative juste après l'inscription : elle a " +
      "besoin de l'objet utilisateur complet (courriel, métadonnées), pas " +
      "seulement de l'identifiant. Une fois par compte, jamais sur un écran.",
  },
  "app/api/onboarding/route.ts": {
    appels: 1,
    pourquoi:
      "Même cas : le courriel d'authentification est recopié dans le profil " +
      "au premier enregistrement. Une fois par compte.",
  },
  "app/(app)/settings/page.tsx": {
    appels: 1,
    pourquoi:
      "Côté navigateur, après le montage, pour afficher l'adresse du compte " +
      "connecté. Ne retient aucun rendu serveur.",
  },
  "app/nouveau-mot-de-passe/page.tsx": {
    appels: 1,
    pourquoi:
      "Le lien de réinitialisation dépose une session dans l'URL ; la page " +
      "doit vérifier qu'elle existe avant de proposer le formulaire.",
  },
};

describe("les vérifications d'identité sont comptées", () => {
  it("aucun fichier n'en ajoute une sans raison écrite", () => {
    const trouves: Record<string, number> = {};
    for (const fichier of sources()) {
      const n = code(fichier).match(VERIFICATION)?.length ?? 0;
      if (n > 0) trouves[fichier] = n;
    }

    const inattendus = Object.keys(trouves).filter((f) => !(f in AUTORISES));
    expect(
      inattendus,
      "Vérification d'identité non déclarée. Passe par `getAuthenticatedUserId`, " +
        "ou ajoute le fichier à AUTORISES avec la raison.",
    ).toEqual([]);

    for (const [fichier, { appels }] of Object.entries(AUTORISES)) {
      expect(trouves[fichier] ?? 0, `${fichier} : nombre d'appels`).toBe(appels);
    }
  });

  it("le proxy n'en fait qu'une, et le rendu une autre : deux au total", () => {
    // Le compte qui intéresse vraiment : ce que paie UNE navigation protégée.
    // Le proxy et le rendu s'exécutent dans des runtimes séparés, sans mémoire
    // partagée — deux est le minimum atteignable sans faire confiance à un
    // en-tête que le client pourrait forger.
    const proxy = code("proxy.ts").match(VERIFICATION)?.length ?? 0;
    const rendu = code("lib/supabase/auth-helper.ts").match(VERIFICATION)?.length ?? 0;
    expect(proxy + rendu).toBe(2);
  });

  it("le rendu ne construit qu'un seul point d'entrée, mémoïsé", () => {
    // `cache()` est ce qui empêche le layout, la page et chaque composant
    // serveur de refaire la vérification chacun de leur côté. Sans elle, le
    // tableau de bord en paierait quatre à lui seul.
    const helper = code("lib/supabase/auth-helper.ts");
    expect(helper).toMatch(/cache\(\s*async/);
  });
});
