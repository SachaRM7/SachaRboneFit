import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PHASES_TEMPO, lireTempo, phasesDuTempo } from "./execution";
import { FICHES_TECHNIQUES, TEMPOS_PAR_DEFAUT } from "@/lib/referentiels/fiches-techniques";

/**
 * Le mot du geste, sans jamais toucher à la sémantique du moteur.
 *
 * « Descente » et « Montée » étaient affichés pour toutes les phases de tous
 * les mouvements. C'est juste sur un hack squat, faux sur un seated row — où
 * rien ne monte ni ne descend — et exactement à l'envers sur un cable crunch,
 * dont l'effort produit descend et dont le retour remonte. Un athlète qui lit
 * « Montée — 1 s » sur un crunch apprend le contraire du geste.
 *
 * La correction ne pouvait pas être d'afficher « Excentrique » partout : c'est
 * vrai, et ça n'apprend rien devant une machine. La fiche apporte donc la
 * traduction concrète, le moteur garde ses quatre clés, et ce fichier vérifie
 * que la première n'a jamais le pouvoir de déplacer la seconde.
 */

const phasesDe = (slug: string) => {
  const tempo = lireTempo(TEMPOS_PAR_DEFAUT[slug] ?? "3-0-1-0")!;
  return phasesDuTempo(tempo, FICHES_TECHNIQUES[slug]?.libellesPhasesTempo);
};

const parCle = (slug: string) =>
  Object.fromEntries(phasesDe(slug).map((p) => [p.cle, p]));

describe("le moteur garde sa sémantique, quoi que dise la fiche", () => {
  it("les quatre phases sortent toujours dans l'ordre canonique", () => {
    for (const slug of Object.keys(FICHES_TECHNIQUES)) {
      expect(phasesDe(slug).map((p) => p.cle), slug).toEqual([
        "excentrique", "pause_etire", "concentrique", "pause_contracte",
      ]);
    }
  });

  it("les secondes viennent du tempo, jamais de la fiche", () => {
    // Une fiche ne peut renommer une phase, pas la déplacer : `3-0-1-1` reste
    // trois secondes d'excentrique même quand celui-ci s'appelle « retour ».
    const p = parCle("cable-crunch");
    expect(p.excentrique!.secondes).toBe(3);
    expect(p.pause_etire!.secondes).toBe(0);
    expect(p.concentrique!.secondes).toBe(1);
    expect(p.pause_contracte!.secondes).toBe(1);
  });

  it("le terme biomécanique reste disponible à côté du mot du geste", () => {
    const p = parCle("cable-crunch");
    expect(p.excentrique!.terme).toBe("Excentrique");
    expect(p.concentrique!.terme).toBe("Concentrique");
  });
});

describe("chaque mouvement parle sa propre langue", () => {
  it("le cable crunch n'appelle JAMAIS son excentrique une descente", () => {
    /*
     * Le cas qui renverse tout. Le concentrique descend — on enroule le buste
     * vers le bas — et c'est l'excentrique qui remonte. C'est l'erreur la plus
     * coûteuse du rendu précédent, parce qu'elle enseignait l'inverse du geste.
     */
    const p = parCle("cable-crunch");
    expect(p.excentrique!.libelle).toMatch(/haut/i);
    expect(p.excentrique!.libelle).not.toMatch(/descen/i);
    expect(p.concentrique!.libelle).toMatch(/bas/i);
    expect(p.concentrique!.libelle).not.toMatch(/mont/i);
    expect(p.pause_contracte!.libelle).toMatch(/contraction/i);
  });

  it("le seated row ne parle ni de montée ni de descente", () => {
    // Mouvement horizontal : les deux mots seraient dénués de sens.
    const p = parCle("seated-row");
    expect(p.excentrique!.libelle).toMatch(/avant/i);
    expect(p.concentrique!.libelle).toMatch(/arrière/i);
    for (const phase of Object.values(parCle("seated-row"))) {
      expect(phase.libelle, phase.cle).not.toMatch(/descen|mont[ée]/i);
    }
  });

  it("le hack squat, lui, peut parler de descente et de remontée", () => {
    // La direction visible y coïncide avec la phase : la refuser par principe
    // remplacerait un mot faux par un mot inutile.
    const p = parCle("hack-squat");
    expect(p.excentrique!.libelle).toMatch(/descente/i);
    expect(p.concentrique!.libelle).toMatch(/remontée/i);
    expect(p.pause_etire!.libelle).toMatch(/bas/i);
  });

  it("et chacun est marqué comme venant du mouvement", () => {
    for (const slug of ["cable-crunch", "seated-row", "hack-squat"]) {
      const nommees = phasesDe(slug).filter((p) => p.propreAuMouvement);
      expect(nommees.length, slug).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("sans libellé propre, le repli générique reste honnête", () => {
  it("un exercice sans traduction affiche le terme biomécanique", () => {
    const sansLibelles = Object.keys(FICHES_TECHNIQUES)
      .filter((s) => !FICHES_TECHNIQUES[s]!.libellesPhasesTempo);
    expect(sansLibelles.length, "tous les exercices ont des libellés : le repli n'est plus testé")
      .toBeGreaterThan(5);

    for (const p of phasesDe(sansLibelles[0]!)) {
      expect(p.libelle).toBe(p.terme);
      expect(p.propreAuMouvement).toBe(false);
    }
  });

  it("une phase non traduite d'un exercice qui en traduit d'autres retombe aussi", () => {
    // Le hack squat ne nomme pas sa pause contractée : elle vaut zéro seconde.
    const p = parCle("hack-squat");
    expect(p.pause_contracte!.propreAuMouvement).toBe(false);
    expect(p.pause_contracte!.libelle).toBe("Pause en position contractée");
  });

  it("un libellé vide ou blanc n'est pas un libellé", () => {
    // Il laisserait la ligne muette : le repli doit reprendre la main.
    const phases = phasesDuTempo(lireTempo("3-0-1-0")!, { excentrique: "   " });
    expect(phases[0]!.libelle).toBe("Excentrique");
    expect(phases[0]!.propreAuMouvement).toBe(false);
  });

  it("sans fiche du tout, les quatre phases s'affichent quand même", () => {
    const phases = phasesDuTempo(lireTempo("3-1-1-0")!);
    expect(phases.map((p) => p.libelle)).toEqual(PHASES_TEMPO.map((p) => p.terme));
    expect(phases.map((p) => p.secondes)).toEqual([3, 1, 1, 0]);
  });
});

describe("l'écran ne connaît aucun exercice", () => {
  const source = readFileSync(
    path.join(path.resolve(import.meta.dirname, "../.."), "components/session/FicheExecution.tsx"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

  it("aucun slug d'exercice n'apparaît dans FicheExecution", () => {
    /*
     * La forme exacte du défaut à empêcher : `if (slug === "cable-crunch")`.
     * Le mot d'un mouvement appartient à sa fiche — donnée canonique, semée,
     * synchronisable — pas à un branchement dans du JSX que personne ne relit.
     */
    for (const slug of Object.keys(FICHES_TECHNIQUES)) {
      expect(source, `${slug} est codé en dur dans l'écran`).not.toContain(slug);
    }
    expect(source).not.toMatch(/\bslug\s*===/);
  });

  it("il consomme l'assemblage du moteur, pas les phases brutes", () => {
    expect(source).toMatch(/phasesDuTempo\(/);
    expect(source).toMatch(/libellesPhasesTempo/);
    // `PHASES_TEMPO.map` dans l'écran reviendrait à réafficher le repli
    // générique pour tout le monde, en ignorant ce que la fiche sait dire.
    expect(source).not.toMatch(/PHASES_TEMPO\s*\.\s*map/);
  });
});

describe("les libellés n'inventent pas de vocabulaire", () => {
  it("chaque clé traduite est une phase du moteur", () => {
    const connues = new Set<string>(PHASES_TEMPO.map((p) => p.cle));
    for (const [slug, fiche] of Object.entries(FICHES_TECHNIQUES)) {
      for (const cle of Object.keys(fiche.libellesPhasesTempo ?? {})) {
        expect(connues.has(cle), `${slug} : phase inconnue « ${cle} »`).toBe(true);
      }
    }
  });

  it("et chaque libellé reste court assez pour tenir sur une ligne", () => {
    for (const [slug, fiche] of Object.entries(FICHES_TECHNIQUES)) {
      for (const [cle, mot] of Object.entries(fiche.libellesPhasesTempo ?? {})) {
        expect(mot.length, `${slug}.${cle}`).toBeLessThan(50);
        expect(mot.trim().length, `${slug}.${cle}`).toBeGreaterThan(0);
      }
    }
  });
});
