import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Personne ne doit pouvoir relire `set_logs` en oubliant l'archivage.
 *
 * `set_logs` n'a pas de colonne d'archivage : une série suit le sort de sa
 * séance. Tant qu'on lit dans le sens naturel — les séances filtrées, puis
 * leurs séries —, la règle s'applique toute seule. Le piège est la lecture
 * inverse, celle qui part d'une INSTANCE pour retrouver son historique : là,
 * `set_logs` est la table de tête, `session_logs` n'est plus dans la requête,
 * et rien ne rappelle qu'elle devrait y être.
 *
 * Les trois fuites trouvées avaient toutes cette forme. Ce fichier la
 * surveille — et rien d'autre : une règle du genre « tout fichier qui nomme
 * `setLogs` doit nommer `archiveLe` » serait fausse la moitié du temps, parce
 * qu'une requête bornée par une liste de séances déjà filtrée n'a aucune raison
 * de reparler d'archivage.
 *
 * Deux garde-fous, donc, l'un exact et l'autre humain :
 *
 *   1. toute lecture ENRACINÉE SUR UNE INSTANCE porte la règle dans sa propre
 *      requête — c'est vérifiable mécaniquement, sans faux positif ;
 *   2. l'inventaire des lecteurs est déclaré ici, avec pour chacun la raison
 *      qui le rend correct. Ajouter une lecture de `set_logs` fait échouer ce
 *      test tant que la raison n'est pas écrite.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function sources(dossier = ""): string[] {
  const entrees = readdirSync(path.join(RACINE, dossier), { withFileTypes: true });
  const fichiers: string[] = [];
  for (const e of entrees) {
    const relatif = dossier ? `${dossier}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (relatif === "tests" || relatif === "db/migrations" || relatif === "scripts") continue;
      fichiers.push(...sources(relatif));
    } else if (/\.tsx?$/.test(e.name) && !/\.i?test\.ts$/.test(e.name)) {
      // Le fichier qui DÉFINIT la règle en parle forcément.
      if (relatif !== "db/archivage.ts") fichiers.push(relatif);
    }
  }
  return fichiers.sort();
}

/**
 * Le code seul : les commentaires de ce projet citent volontiers les requêtes
 * qu'ils expliquent, et une citation n'est pas une lecture.
 */
function code(fichier: string): string {
  return readFileSync(path.join(RACINE, fichier), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Les appels qui LISENT `set_logs`. Les écritures ne posent pas la question. */
const LECTURE = /\.from\(setLogs\)|query\.setLogs\.find|[a-zA-Z]+Join\(setLogs\b/g;

/**
 * Ce qui prouve, dans une requête, que les séances archivées sont écartées.
 *
 * `seancesRealisees` et `estUneSeanceRealisee` y figurent parce qu'elles
 * contiennent `archive_le IS NULL` : elles sont strictement plus exigeantes que
 * `seancesActives`, jamais moins.
 */
const PORTE_LA_REGLE =
  /seriesActives|seriesNonArchivees|seancesActives|seancesRealisees|estUneSeanceRealisee|sessionLogs\.archiveLe/;

function compter(texte: string, motif: RegExp): number {
  return texte.match(new RegExp(motif.source, "g"))?.length ?? 0;
}

/**
 * Les lectures de `set_logs`, et pourquoi chacune est correcte.
 *
 * Trois justifications seulement, et elles ne se valent pas :
 *
 *   `regle-dans-la-requete`  la requête nomme elle-même l'archivage. C'est la
 *                            seule forme sûre pour une lecture enracinée sur
 *                            une instance, et le garde-fou 1 la vérifie.
 *   `bornee-par-des-seances` la requête est bornée par des identifiants de
 *                            séances issus d'une lecture déjà filtrée. Correct,
 *                            mais indémontrable d'ici : c'est une relecture
 *                            humaine, et la relire est le prix de l'ajout.
 *   `archive-assumee`        ce chemin DOIT voir les séances archivées. Y
 *                            appliquer le filtre effacerait l'histoire.
 */
type Justification = "regle-dans-la-requete" | "bornee-par-des-seances" | "archive-assumee";

const LECTEURS: Record<string, { lectures: number; pourquoi: Justification; note?: string }> = {
  "services/progression.ts": {
    lectures: 6, pourquoi: "bornee-par-des-seances",
    note: "trois lectures filtrent elles-mêmes, trois partent d'une liste de séances déjà filtrée",
  },
  "services/bilan.ts": { lectures: 2, pourquoi: "regle-dans-la-requete" },
  "services/seances.ts": {
    lectures: 1, pourquoi: "bornee-par-des-seances",
    note: "abandonner : compte les séries d'UNE séance déjà relue et vérifiée non archivée, "
      + "pour refuser d'effacer une séance où quelque chose a eu lieu",
  },
  "services/debrief-seance.ts": {
    lectures: 2, pourquoi: "bornee-par-des-seances",
    note: "génération : la séance est relue avec `seancesRealisees` avant ses séries. "
      + "Lecture : bornée à une séance qui a DÉJÀ un débrief, donc qui a passé ce "
      + "contrôle — et la lecture ne sert qu'à recalculer une empreinte, jamais un "
      + "calcul sportif. Une séance archivée après coup garde son texte, marqué "
      + "périmé, ce qui est le comportement voulu : on ne réécrit pas l'histoire.",
  },
  "services/cycle.ts": { lectures: 1, pourquoi: "bornee-par-des-seances" },
  "services/plan-seance.ts": { lectures: 1, pourquoi: "regle-dans-la-requete" },
  "lib/coach/tools.ts": {
    lectures: 3, pourquoi: "regle-dans-la-requete",
    note: "deux des trois fuites d'origine ; la troisième boucle sur des séances filtrées",
  },
  "lib/coach/outils-programme.ts": { lectures: 1, pourquoi: "regle-dans-la-requete" },
  "app/api/progression/exercise/route.ts": { lectures: 1, pourquoi: "regle-dans-la-requete" },
  "app/api/progression/pillar-volume/route.ts": { lectures: 1, pourquoi: "regle-dans-la-requete" },
  "app/api/sessions/last/route.ts": { lectures: 1, pourquoi: "regle-dans-la-requete" },
  "app/api/sessions/tendency/route.ts": {
    lectures: 1, pourquoi: "bornee-par-des-seances",
    note: "les séances viennent de `seancesActives` juste au-dessus",
  },
  "app/api/cron/weekly-debrief/route.ts": { lectures: 1, pourquoi: "bornee-par-des-seances" },
  "app/api/exercise-instances/[id]/route.ts": {
    lectures: 1, pourquoi: "regle-dans-la-requete",
    note: "garde d'immutabilité : sans compte, le parc étant partagé",
  },
  "app/api/export/route.ts": {
    lectures: 1, pourquoi: "archive-assumee",
    note: "l'export rend tout ce qui a eu lieu — le filtrer reviendrait à effacer",
  },
  "app/(app)/historique/page.tsx": {
    lectures: 1, pourquoi: "bornee-par-des-seances",
    note: "les séances viennent de `seancesRealisees` : ni archivées, ni vides",
  },
  "app/(app)/sessions/[id]/page.tsx": {
    lectures: 1, pourquoi: "bornee-par-des-seances",
    note: "la séance est relue avec `seancesRealisees` avant ses séries",
  },
};

describe("les lectures enracinées sur une instance portent la règle", () => {
  /**
   * La forme dangereuse, reconnaissable sans ambiguïté : `set_logs` filtrée par
   * `exerciseInstanceId`. Une condition de jointure s'écrit dans l'autre sens
   * — `eq(exerciseInstances.id, setLogs.exerciseInstanceId)` —, donc ce motif
   * ne désigne que les requêtes qui partent vraiment d'un appareil.
   */
  /**
   * `inArray` autant que `eq` : grouper la lecture ne la sort pas de la règle.
   *
   * Le garde ne reconnaissait que la forme unitaire. Le jour où six lectures
   * d'historique — une par exercice — ont été remplacées par une seule sur
   * plusieurs instances, la requête a cessé d'être surveillée sans que rien ne
   * le signale : le nombre de cas vérifiés a simplement baissé de un.
   */
  const ENRACINEE = /(?:eq|inArray)\(setLogs\.exerciseInstanceId,/g;

  /**
   * L'instruction qui contient ce point, et elle seule.
   *
   * Vérifier le FICHIER ne prouverait rien : la ligne `import` des filtres
   * d'archivage suffirait à le faire passer, y compris avec la requête d'à côté
   * remise dans son état fautif. C'est ce qu'a montré le contrôle négatif — la
   * première version de ce test ne voyait pas la régression qu'elle devait
   * voir. Une requête Drizzle tient entre deux points-virgules ; c'est donc là
   * qu'on découpe.
   */
  function instruction(texte: string, position: number): string {
    const debut = texte.lastIndexOf(";", position) + 1;
    const fin = texte.indexOf(";", position);
    return texte.slice(debut, fin === -1 ? texte.length : fin);
  }

  const concernes: Array<[string, string]> = [];
  for (const fichier of sources()) {
    const texte = code(fichier);
    for (const m of texte.matchAll(ENRACINEE)) {
      concernes.push([fichier, instruction(texte, m.index)]);
    }
  }

  it("il en existe, sinon ce test ne surveille rien", () => {
    expect(concernes.length).toBeGreaterThan(0);
  });

  for (const [fichier, requete] of concernes) {
    it(`${fichier} exclut les séances archivées dans sa propre requête`, () => {
      expect(PORTE_LA_REGLE.test(requete), requete.trim()).toBe(true);
    });
  }
});

describe("l'inventaire des lecteurs de set_logs", () => {
  const trouves = new Map<string, number>();
  for (const fichier of sources()) {
    const n = compter(code(fichier), LECTURE);
    if (n > 0) trouves.set(fichier, n);
  }

  it("ne contient aucun lecteur non déclaré", () => {
    const inconnus = [...trouves.keys()].filter((f) => !(f in LECTEURS));
    expect(
      inconnus,
      "Une lecture de set_logs est apparue ici. Comment exclut-elle les séances "
      + "archivées ? Déclare-la dans LECTEURS avec sa justification.",
    ).toEqual([]);
  });

  it("ne garde aucune entrée devenue obsolète", () => {
    const disparus = Object.keys(LECTEURS).filter((f) => !trouves.has(f));
    expect(disparus, "Ces fichiers ne lisent plus set_logs : retire-les.").toEqual([]);
  });

  it("compte le même nombre de lectures que ce qui est déclaré", () => {
    for (const [fichier, n] of trouves) {
      const declare = LECTEURS[fichier];
      if (!declare) continue;
      expect(
        n,
        `${fichier} : ${n} lecture(s) de set_logs pour ${declare.lectures} déclarée(s). `
        + "Une lecture a été ajoutée ou retirée — revois la justification.",
      ).toBe(declare.lectures);
    }
  });

  it("n'accepte l'archive assumée que sur le seul chemin qui doit tout rendre", () => {
    // Un calcul sportif ne peut pas se déclarer « archive assumée ». L'export
    // est désormais le seul chemin de ce genre : l'historique et la fiche d'une
    // séance ont rejoint `seancesRealisees` — une séance ouverte et vide n'a
    // rien à montrer, et une séance archivée est sortie du calcul.
    const assumes = Object.entries(LECTEURS)
      .filter(([, d]) => d.pourquoi === "archive-assumee")
      .map(([f]) => f);
    expect(assumes.sort()).toEqual(["app/api/export/route.ts"]);
  });
});
