import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Un symptôme général ne doit jamais redevenir une douleur.
 *
 * Cinquième garde structurel du dépôt, après `reglages-ont-un-chemin`,
 * `douleur-a-un-chemin`, `fiche-a-un-chemin` et `recuperation-a-un-chemin`.
 *
 * CE QU'IL EMPÊCHE
 *
 * Les trois notions se ressemblent assez pour qu'on les confonde en écrivant
 * du code, et les conséquences ne se ressemblent pas du tout :
 *
 *   COURBATURE          entre dans `scoreRecuperation`. Un mal de tête qui y
 *                       entrerait bloquerait la séance du LENDEMAIN.
 *   DOULEUR D'EXERCICE  passe par `musclesDeLaZone`, peut créer une contrainte
 *                       et écarter des exercices. Un mal de tête qui y
 *                       entrerait retirerait des exercices au hasard — il n'y
 *                       a aucun muscle à désigner.
 *   SYMPTÔME GÉNÉRAL    est consigné, et propose une conduite. Rien d'autre.
 *
 * Le fichier lit le texte du dépôt. Il ne remplace pas les tests de
 * comportement (`symptome-general.itest.ts` le vérifie sur de vraies données) :
 * il empêche la FORME qui les rendrait faux.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const lire = (f: string) => sansCommentaires(readFileSync(path.join(RACINE, f), "utf8"));

const REFERENTIEL = "lib/referentiels/symptomes.ts";
const REGLE = "lib/engine/symptome-general.ts";
const MODALE_SEANCE = "components/session/SOSSymptome.tsx";
const MODALE_JOUR = "components/daily-state/SymptomesModal.tsx";
const ROUTE_INCIDENTS = "app/api/incidents/route.ts";
const FEU = "lib/engine/feu-biologique.ts";

function fichiers(relatif: string, suffixes: string[]): string[] {
  return readdirSync(path.join(RACINE, relatif), { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(relatif, e.name);
    if (e.isDirectory()) return fichiers(chemin, suffixes);
    return suffixes.some((s) => e.name.endsWith(s)) ? [chemin] : [];
  });
}

describe("le symptôme ne touche jamais la chaîne de la douleur", () => {
  it("la règle ne connaît ni muscle, ni zone, ni contrainte", () => {
    /*
     * Les quatre portes d'entrée de la chaîne musculaire. Aucune n'a de sens
     * pour un état global : `musclesDeLaZone("mal de tête")` ne rend rien, et
     * si un jour elle rendait quelque chose, ce serait pire.
     */
    const source = lire(REGLE);
    for (const interdit of [
      "musclesDeLaZone", "propositionsDepuis", "contraintesActives",
      "scoreRecuperation", "versMuscle", "libelleMuscle",
    ]) {
      expect(source, `la règle appelle ${interdit}`).not.toContain(interdit);
    }
  });

  it("le référentiel non plus", () => {
    const source = lire(REFERENTIEL);
    expect(source).not.toMatch(/@\/lib\/referentiels\/muscles/);
    expect(source).not.toMatch(/@\/lib\/referentiels\/anatomie/);
  });

  it("la modale de séance ne poste jamais vers /api/douleur", () => {
    // La forme exacte du défaut à empêcher : router un symptôme vers le moteur
    // douleur parce que les deux écrans se ressemblent.
    const source = lire(MODALE_SEANCE);
    expect(source, "un symptôme part vers le moteur douleur").not.toContain("/api/douleur");
    expect(source).not.toContain("type: \"douleur\"");
    expect(source).toContain("type: \"symptome_general\"");
  });

  it("et aucun composant ne mélange les deux types d'incident", () => {
    const fautifs = fichiers("components", [".tsx"]).filter((f) => {
      const s = lire(f);
      return s.includes("symptome_general") && s.includes("/api/douleur");
    });
    expect(fautifs, `${fautifs.join(", ")} mélange(nt) symptôme et douleur`).toEqual([]);
  });

  it("le type d'incident est distinct de `energie_chute`", () => {
    /*
     * Le bouton est commun — « État ↓ » — mais la donnée ne l'est pas. Les
     * fondre rendrait impossible de dire, dans un débrief, laquelle des deux
     * a eu lieu.
     */
    const source = lire(ROUTE_INCIDENTS);
    expect(source).toContain("symptome_general");
    expect(source).toContain("energie_chute");
    expect(lire("components/session/SOSEnergie.tsx")).toContain("energie_chute");
    expect(lire(MODALE_SEANCE), "le symptôme écrit un incident d'énergie")
      .not.toContain("energie_chute");
  });
});

describe("le symptôme n'entre pas dans la récupération musculaire", () => {
  it("le service de récupération ne lit pas les symptômes", () => {
    // Il lit `courbatures`, et rien d'autre du même écran. Un symptôme qui y
    // entrerait ferait basculer des muscles sans rapport.
    const source = lire("services/recuperation.ts");
    expect(source).not.toMatch(/symptome/i);
  });

  it("et la colonne reste séparée de `courbatures`", () => {
    /*
     * Détourner `courbatures` aurait évité une migration — et fait entrer un
     * état global dans un score musculaire, ce qui est exactement le défaut
     * que ce lot corrige.
     */
    const schema = lire("db/schema.ts");
    expect(schema).toContain('jsonb("symptomes_generaux")');
    expect(schema).toContain('jsonb("courbatures")');
    const migration = readFileSync(
      path.join(RACINE, "db/migrations/0016_symptomes_generaux.sql"), "utf8",
    );
    // Additive et nullable : aucune ligne existante n'est réécrite.
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS "symptomes_generaux" jsonb/);
    expect(migration, "la migration réécrit des lignes").not.toMatch(/UPDATE|DELETE|NOT NULL|DEFAULT/i);
  });
});

describe("le feu biologique n'est pas dénaturé", () => {
  it("il garde ses trois critères, sans symptôme", () => {
    /*
     * Décision assumée : le feu reste sommeil + énergie + courbatures, et la
     * prudence issue des symptômes est produite SÉPARÉMENT. Le brancher ici
     * aurait fait passer un mal de tête pour une mauvaise nuit dans une mesure
     * que le tableau de bord, le constructeur de séance et le coach consomment
     * tous les trois.
     */
    const source = lire(FEU);
    expect(source, "le feu consomme désormais les symptômes").not.toMatch(/symptome/i);
    expect(source).toContain("criteresSommeil");
    expect(source).toContain("criteresEnergie");
    expect(source).toContain("criteresCourbatures");
  });
});

describe("une seule règle, et elle vit dans le moteur", () => {
  it("les deux écrans appellent la même fonction", () => {
    for (const f of [MODALE_SEANCE, "components/daily-state/DailyStateForm.tsx"]) {
      expect(lire(f), `${f} n'utilise pas la règle du moteur`)
        .toMatch(/prudenceSymptomes/);
    }
  });

  it("aucun composant ne compare une intensité à un seuil écrit à la main", () => {
    /*
     * La forme exacte à empêcher : `intensite >= 7`. Elle marcherait, un
     * temps — jusqu'au jour où le barème change et où l'écran de séance
     * proposerait d'arrêter là où l'état du jour dit de continuer.
     */
    for (const f of [MODALE_SEANCE, MODALE_JOUR]) {
      const source = lire(f);
      expect(source, `${f} compare une intensité en dur`)
        .not.toMatch(/intensite\s*[<>]=?\s*\d/);
      expect(source).not.toMatch(/SEUILS_|conduitePourUn\(/);
    }
  });

  it("les libellés viennent du référentiel, pas d'une seconde liste", () => {
    for (const f of [MODALE_SEANCE, MODALE_JOUR]) {
      expect(lire(f)).toMatch(/SYMPTOMES_GENERAUX|libelleSymptome/);
    }
    // Et les libellés français ne sont écrits qu'une fois.
    const ailleurs = fichiers("components", [".tsx"])
      .filter((f) => /"Mal de tête"|'Mal de tête'/.test(lire(f)));
    expect(ailleurs, `${ailleurs.join(", ")} recopie(nt) un libellé`).toEqual([]);
  });

  it("les deux portes d'entrée partagent le même schéma de validation", () => {
    // Sinon c'est par la plus permissive que passerait la note de trois cents
    // mots ou l'intensité hors bornes.
    expect(lire("lib/validators/daily-state.ts")).toMatch(/symptomesDeclaresSchema/);
    expect(lire(ROUTE_INCIDENTS)).toMatch(/symptomeDeclareSchema/);
  });
});

describe("rien de tout cela ne diagnostique", () => {
  it("aucun terme médical dans le référentiel ni dans la règle", () => {
    /*
     * La liste est celle des mots qui feraient basculer l'application d'un
     * carnet d'entraînement vers un avis de santé. « Mal de tête » est un
     * ressenti ; « migraine » est un diagnostic.
     */
    const interdits = /migraine|hypoglyc|hypertension|infection|vagal|déshydrat|pathologie|symptomatologie/i;
    for (const f of [REFERENTIEL, REGLE, MODALE_SEANCE, MODALE_JOUR]) {
      expect(lire(f), `${f} emploie un terme de diagnostic`).not.toMatch(interdits);
    }
  });

  it("aucun écran ne recommande de traitement ni de consultation", () => {
    const interdits = /médicament|paracétamol|ibuprof|consulte un|appelle un médecin|urgences/i;
    for (const f of [MODALE_SEANCE, MODALE_JOUR]) {
      expect(lire(f)).not.toMatch(interdits);
    }
  });

  it("et les deux écrans le disent explicitement", () => {
    // Un écran qui liste des symptômes et propose une conduite se lit vite
    // comme un avis médical. La phrase existe pour que ce ne soit pas le cas.
    for (const f of [MODALE_SEANCE, MODALE_JOUR]) {
      // Tolérant au retour à la ligne : JSX coupe les phrases où il veut, et
      // un garde qui exigerait une seule ligne casserait au premier reformatage.
      const texte = readFileSync(path.join(RACINE, f), "utf8").replace(/\s+/g, " ");
      expect(texte).toMatch(/pas un avis médical/);
    }
  });

  it("le modèle reçoit les symptômes mais pas la décision", () => {
    /*
     * Le coach peut dire « tu as signalé un léger mal de tête ». La conduite
     * qu'il relaie est calculée par le moteur et jointe au contexte : il ne la
     * choisit pas. Confier une décision de sécurité à un appel non
     * déterministe serait la seule vraie faute possible de ce lot.
     */
    const source = lire("lib/coach/outils-contexte.ts");
    expect(source).toMatch(/symptomesGeneraux/);
    expect(source).toMatch(/prudenceSymptomes\(/);
  });

  it("et le débrief hebdomadaire ne reçoit pas les notes libres", () => {
    // Elles sont écrites pour un humain qui relit sa séance. Le type et
    // l'intensité suffisent à ce qu'un débrief a le droit de dire.
    const source = lire("app/api/cron/weekly-debrief/route.ts");
    expect(source).toMatch(/agregerSymptomes\(/);
    expect(source, "les notes libres partent vers le modèle").not.toMatch(/\.note/);
  });
});
