import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Le niveau déclaré est consommé — et il ne décide pas des charges.
 *
 * `users.niveau_experience` était demandé à l'inscription et lu par PERSONNE.
 * Pas même par le coach, dont le prompt disait pourtant « ne la proposes que si
 * le niveau … le justifie » : il parlait d'une information qu'il ne recevait
 * pas.
 *
 * L'arbitrage retenu : le niveau sert à la façon de PARLER et à la complexité
 * des mouvements proposés. Il ne pilote ni charge, ni volume, ni vitesse de
 * progression — ceux-là viennent de la calibration et des séries réellement
 * faites. Une règle du genre « avancé ⇒ +20 % de volume » serait une heuristique
 * inventée pour justifier l'existence d'une colonne.
 *
 * Ce test tient les deux moitiés. La seconde est la plus importante : elle
 * échoue le jour où quelqu'un branche le niveau sur un calcul.
 */

const RACINE = path.resolve(import.meta.dirname, "..");
const lire = (f: string) => readFileSync(path.join(RACINE, f), "utf8");

describe("le coach reçoit le niveau", () => {
  const outil = lire("lib/coach/outils-contexte.ts");

  it("le profil transmis porte le niveau déclaré", () => {
    expect(outil).toMatch(/niveauDeclare/);
    expect(outil).toMatch(/u\.niveauExperience/);
  });

  it("et les deux nombres qui le relativisent", () => {
    // Quelqu'un qui se déclare avancé après deux ans d'arrêt n'est pas dans la
    // même situation que quelqu'un qui s'entraîne actuellement.
    expect(outil).toMatch(/anneesDePratique/);
    expect(outil).toMatch(/moisDInterruption/);
  });

  it("le prompt dit ce que le niveau change, et ce qu'il ne change pas", () => {
    const prompt = lire("lib/coach/system-prompt.ts");
    expect(prompt).toMatch(/niveauDeclare/);
    // La moitié qui compte : le refus est écrit, pas seulement sous-entendu.
    expect(prompt).toMatch(/ni les charges, ni le volume/);
  });
});

/**
 * Les modules qui décident des charges et du volume.
 *
 * Ce sont eux qui ne doivent jamais voir passer le niveau déclaré : la charge
 * se mesure, elle ne se déduit pas d'une case cochée à l'inscription.
 */
const MOTEURS_DE_CHARGE = [
  "lib/engine/double-progression.ts",
  "lib/engine/charges.ts",
  "lib/engine/records.ts",
  "lib/engine/volume-adjustment.ts",
  "lib/engine/calibration.ts",
  "lib/engine/plan-calibration.ts",
  "services/plan-seance.ts",
];

describe("le niveau ne décide pas des charges", () => {
  for (const moteur of MOTEURS_DE_CHARGE) {
    it(`${moteur} ignore le niveau déclaré`, () => {
      expect(lire(moteur), `${moteur} lit le niveau déclaré`)
        .not.toMatch(/niveauExperience|niveauDeclare/);
    });
  }

  it("la reprise se juge sur l'interruption, pas sur la déclaration", () => {
    // `calibration.ts` prend `moisDInterruption` et `anneesDePratique` : des
    // faits datés, pas un ressenti. C'est ce qui doit rester vrai.
    const calibration = lire("lib/engine/calibration.ts");
    expect(calibration).toMatch(/moisDInterruption/);
    expect(calibration).not.toMatch(/niveauExperience/);
  });
});

describe("la colonne dormante reste dormante", () => {
  it("exercices_apprecies n'est lu par personne, et le dit", () => {
    // Conservée pour plus tard — une préférence douce entre deux remplaçants
    // équivalents — mais rien n'est construit autour aujourd'hui. Le schéma
    // porte la raison, pour que la prochaine lecture soit une décision.
    const schema = lire("db/schema.ts");
    expect(schema).toMatch(/DORMANTE/);
    expect(schema).toMatch(/exercicesApprecies/);
  });
});
