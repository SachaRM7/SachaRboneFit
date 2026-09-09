import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ETATS_MASCOTTE } from "@/lib/coach/mascotte-assets";

/**
 * LES TREIZE ÉTATS SONT-ILS RÉELLEMENT BRANCHÉS ?
 *
 * POURQUOI UN TEST QUI LIT DU CODE SOURCE
 *
 * Un résolveur peut être parfait et n'être appelé nulle part. Le lot précédent
 * a livré exactement cela : cinq états enregistrés, résolus, testés — et
 * absents de l'application. Aucun test de fonction pure ne pouvait le dire,
 * puisque les fonctions, elles, passaient.
 *
 * Ce fichier lit donc les écrans et vérifie le BRANCHEMENT : quelle surface
 * appelle quel résolveur. C'est un idiome déjà employé ici (`live-deux-vues`,
 * `lectures-set-logs`) et il a la même limite qu'eux — il constate qu'un appel
 * existe, pas ce qu'il rend à l'écran. Les tests de composants, à côté,
 * couvrent l'autre moitié.
 */

const src = (p: string) => readFileSync(path.join(process.cwd(), "src", p), "utf8");

/**
 * Le code sans ses commentaires.
 *
 * Ces fichiers DOCUMENTENT les résolveurs qu'ils n'appellent pas — « voir
 * `resoudreMascotteAccueil` ». Un garde qui se déclenche sur la documentation
 * expliquant qu'il n'y a rien à trouver finit désarmé au premier faux positif ;
 * la leçon a déjà été payée sur `beast`.
 */
const sansCommentaires = (s: string) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const LIVE = src("app/(app)/sessions/new/[templateId]/page.tsx");
const ACCUEIL = src("components/dashboard/ContenuTableauDeBord.tsx");
const CARTE_DU_JOUR = src("components/dashboard/CarteAujourdhui.tsx");
const PROGRESSION = src("components/progression/ContenuProgression.tsx");
const PROGRAMME = src("app/(app)/programme/page.tsx");
const FICHE = src("components/session/FicheExecution.tsx");
const DEMO = src("components/session/DemonstrationMouvement.tsx");

describe("la calibration du Live désigne un moment, plus une phase entière", () => {
  it("le contexte ne se déduit PLUS de la phase du cycle", () => {
    /*
     * LE DÉFAUT CORRIGÉ.
     *
     * `modeSaisieEffort(phaseCycle) === "reserve"` est vrai d'un bout à l'autre
     * d'un bloc « Reprise & calibration ». Passé à `calibration`, il rendait la
     * mascotte de calibration ambiante pendant des séances entières — y compris
     * sur des machines dont l'historique était complet, c'est-à-dire là où il
     * n'y a précisément rien à calibrer.
     *
     * La phase garde son rôle : elle pilote la SAISIE (réserve plutôt que RPE),
     * et ces appels-là doivent rester.
     */
    const appel = LIVE.match(/resoudreMascotteLive\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(appel, "le Live n'appelle plus resoudreMascotteLive").not.toBe("");
    expect(appel, "la phase du cycle décide encore de la mascotte")
      .not.toMatch(/modeSaisieEffort/);
    // Ce que la phase doit continuer de piloter, ailleurs dans l'écran.
    expect(LIVE).toMatch(/modeReserve=\{modeSaisieEffort/);
  });

  it("il se déduit de l'absence de repère SUR L'ENTRÉE AFFICHÉE", () => {
    // Le même fait que « Pas encore de repère sur cette machine », que
    // `LecteurExercice` écrit déjà au même instant. Une seule vérité, deux
    // lectures — et non deux définitions qui finiraient par diverger.
    expect(LIVE).toMatch(/const sansRepereIci = \(courant\?\.historique\?\.length \?\? 0\) === 0;/);
    expect(LIVE.match(/resoudreMascotteLive\(\{[\s\S]*?\}\)/)?.[0])
      .toMatch(/calibration: sansRepereIci/);
  });
});

describe("les surfaces appellent bien un résolveur", () => {
  it("l'accueil résout l'état du jour, et ne l'écrit pas en dur", () => {
    expect(ACCUEIL).toMatch(/mascotteDeLAccueil\(\{/);
    // Le calcul a lieu à UN endroit : la carte reçoit le résultat.
    expect(CARTE_DU_JOUR).toMatch(/mascotte\?: EtatVisuelMascotte \| null/);
    expect(sansCommentaires(CARTE_DU_JOUR))
      .not.toMatch(/mascotteDeLAccueil\(|resoudreMascotte\w*\(/);
  });

  it("la progression résout sur le bilan du moteur", () => {
    expect(PROGRESSION).toMatch(/resoudreMascotteProgression\(\{/);
    expect(PROGRESSION).toMatch(/sansRepere: bilan\.etat !== "en_route"/);
    expect(PROGRESSION).toMatch(/progresConfirme: bilan\.enProgression\.length > 0/);
  });

  it("le programme passe par le résolveur plutôt que par une chaîne", () => {
    expect(PROGRAMME).toMatch(/etat=\{resoudreMascotteProgramme\(\)\}/);
  });

  it("la technique est sur les deux surfaces qui l'expliquent", () => {
    for (const [nom, code] of [["FicheExecution", FICHE], ["DemonstrationMouvement", DEMO]] as const) {
      expect(code, `${nom} sans mascotte technique`)
        .toMatch(/<MascotteCoach etat="technique"/);
    }
  });

  it("et la technique ne REMPLACE rien de ce qui portait l'information", () => {
    /*
     * La règle explicite du lot : la mascotte représente le Coach qui explique.
     * Elle ne prend la place ni de l'illustration, ni de la démonstration, ni
     * de la fiche, ni des réglages.
     */
    expect(DEMO).toMatch(/IllustrationExercice/);
    expect(FICHE).toMatch(/DeclarerReglage/);
    expect(FICHE).toMatch(/Mannequin/);
  });
});

describe("aucun état ne reste dormant sans raison", () => {
  it("les douze états non dormants sont atteints par au moins une surface", () => {
    /*
     * LE TEST QUI DIT « LE LOT EST FINI ».
     *
     * Sa version honnête : chaque état apparaît soit dans un résolveur, soit
     * directement dans un écran. `beast` est la seule exception, et elle est
     * revendiquée — voir `mascotte-assets.test.ts`.
     */
    const surfaces = [
      LIVE, ACCUEIL, CARTE_DU_JOUR, PROGRESSION, PROGRAMME, FICHE, DEMO,
      src("lib/coach/resoudre-mascotte.ts"),
      src("components/session/ObservateurSeance.tsx"),
      src("components/coach/CoachDrawer.tsx"),
      src("components/coach/ProactiveAlert.tsx"),
      src("components/coach/SessionDebrief.tsx"),
    ].join("\n");

    const orphelins = ETATS_MASCOTTE.filter(
      (e) => e !== "beast" && !new RegExp(`"${e}"`).test(surfaces),
    );
    expect(orphelins, "états enregistrés mais branchés nulle part").toEqual([]);
  });

  it("beast n'est cité par AUCUNE surface", () => {
    const surfaces = [LIVE, ACCUEIL, CARTE_DU_JOUR, PROGRESSION, PROGRAMME, FICHE, DEMO];
    for (const code of surfaces) expect(code).not.toMatch(/"beast"/);
  });
});

describe("une seule présence forte par surface", () => {
  it("le Live n'affiche jamais l'ambiante en même temps que la feuille de repos", () => {
    // Deux mascottes à l'écran pour un seul état, et l'image cesse de vouloir
    // dire quoi que ce soit.
    expect(LIVE).toMatch(/etatMascotte !== "repos" &&/);
  });

  it("l'accueil n'a qu'un seul point de calcul", () => {
    expect(ACCUEIL.match(/mascotteDeLAccueil\(/g) ?? []).toHaveLength(1);
    // Les deux rendus (reprise / carte du jour) s'excluent par `canResume` :
    // ils ne peuvent pas être à l'écran ensemble.
    expect(ACCUEIL).toMatch(/!canResume && \(/);
  });

  it("aucune autre carte de l'accueil ne porte de mascotte", () => {
    /*
     * Récupération, alertes, séances récentes, programme : elles gardent leurs
     * informations et n'ajoutent pas chacune la leur. Le Coach de la journée
     * est un.
     */
    for (const fichier of [
      "components/dashboard/CarteRecuperation.tsx",
      "components/dashboard/CarteProgramme.tsx",
      "components/dashboard/ComplementTableauDeBord.tsx",
      "components/dashboard/ActionsCoach.tsx",
    ]) {
      expect(src(fichier), `${fichier} ajoute une seconde mascotte`)
        .not.toMatch(/MascotteCoach/);
    }
  });
});
