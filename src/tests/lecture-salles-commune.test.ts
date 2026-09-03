import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `gyms.user_id` ne doit jamais servir de filtre de LECTURE.
 *
 * C'est une confusion qui s'est déjà produite, et qui se reproduira : la
 * colonne ressemble à toutes les autres colonnes `user_id` de ce schéma, dont
 * elle est pourtant la seule exception. Partout ailleurs — séances, séries,
 * blocs, contraintes, poids —, elle borne ce qu'un compte a le droit de lire.
 * Sur `gyms`, elle désigne qui tient le lieu à jour.
 *
 * Le jour où l'écran des salles a été « corrigé » en ajoutant ce filtre, rien
 * n'a échoué : les tests d'intégration passaient, et le seul symptôme était
 * qu'un compte ne voyait plus la salle où il s'entraîne. Un test de données ne
 * l'attrapera pas non plus, puisqu'il recopie la requête au lieu de la lire.
 * D'où ce garde, qui regarde le code des écrans.
 *
 * Il ne dit pas « ce fichier ne doit pas nommer `gyms.userId` » — la fiche a
 * besoin de la colonne pour décider qui voit le formulaire. Il dit : elle
 * n'apparaît pas dans un `.where(...)`.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

/** Les commentaires de ce projet citent les requêtes qu'ils expliquent. */
function code(fichier: string): string {
  return readFileSync(path.join(RACINE, fichier), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ECRANS = ["app/(app)/gyms/page.tsx", "app/(app)/gyms/[id]/page.tsx"];

describe("le catalogue des salles se lit sans filtre par compte", () => {
  for (const ecran of ECRANS) {
    it(`${ecran} ne borne aucune lecture par gyms.userId`, () => {
      const source = code(ecran);
      // Tout ce qui est passé à un `.where(` de cet écran, d'un bout à
      // l'autre : un `and(...)` imbriqué y est donc compris.
      const debut = source.indexOf(".where(");
      expect(debut, "cet écran ne lit plus de salles ?").toBeGreaterThan(-1);
      const clause = source.slice(debut, source.indexOf(";", debut));
      expect(clause).not.toMatch(/gyms\.userId/);
    });
  }

  it("la fiche décide néanmoins des droits de maintenance", () => {
    // Le contrôle négatif de la règle : retirer le filtre de lecture sans
    // garder l'écriture reviendrait à laisser n'importe qui éditer le lieu.
    const source = code("app/(app)/gyms/[id]/page.tsx");
    expect(source).toMatch(/peutGererLaSalle\(/);
  });

  it("et l'écran ne s'annonce plus comme une possession", () => {
    // « Mes salles » sous-entend une propriété qui n'existe pas dans le
    // modèle : le lieu est commun, seule sa tenue à jour a un responsable.
    expect(code("app/(app)/gyms/page.tsx")).not.toMatch(/Mes salles/);
  });
});
