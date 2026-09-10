import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Le préchargement ne doit pas devenir une tempête.
 *
 * Tant qu'aucune limite de suspension n'existait, `<Link>` ne préchargeait
 * rien sur ces routes : Next ne peut préparer que ce qui va jusqu'à la
 * première limite, et il n'y en avait pas. Ajouter `loading.tsx` a rendu la
 * navigation immédiate — et, du même coup, a réveillé le préchargement de
 * TOUS les liens affichés.
 *
 * Les journaux Vercel l'ont montré tout de suite : une rafale de
 * `/sessions/new/<id>` pour plusieurs gabarits, au même instant, alors que
 * personne n'avait demandé la moindre séance. Or chacune de ces cibles
 * CONSTRUIT un plan complet — parc du lieu, charges, progression. Le
 * préchargement d'une liste de N éléments, c'est N rendus serveur lourds.
 *
 * La règle retenue, et ce fichier la tient : aucune surface de l'accueil ni
 * de la navigation globale ne précharge une page serveur. Chaque cible est
 * dynamique (`force-dynamic`) et l'ouverture explicite est le seul moment où
 * l'utilisateur a demandé son travail. Les listes d'éléments gardent la même
 * règle : séances, exercices, historique et salles ne lancent jamais une
 * construction en arrière-plan.
 *
 * Le test compte, plutôt que de faire confiance. Un lien de liste ajouté sans
 * `prefetch={false}` le fait échouer.
 */

const RACINE = path.resolve(import.meta.dirname, "..");

function sources(dossier = ""): string[] {
  const entrees = readdirSync(path.join(RACINE, dossier), { withFileTypes: true });
  const fichiers: string[] = [];
  for (const e of entrees) {
    const relatif = dossier ? `${dossier}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (relatif === "tests") continue;
      fichiers.push(...sources(relatif));
    } else if (/\.tsx$/.test(e.name)) {
      fichiers.push(relatif);
    }
  }
  return fichiers.sort();
}

/**
 * Un lien dont la cible est CALCULÉE — donc un élément d'une liste, pas une
 * destination fixe de la navigation. C'est exactement la population à
 * surveiller : un `href` littéral désigne un écran, un `href` interpolé
 * désigne une ligne parmi d'autres.
 */
const LIEN_DYNAMIQUE = /<Link\b[^>]*href=\{`[^`]*\$\{[\s\S]*?>/g;

interface LienTrouve {
  fichier: string;
  precharge: boolean;
}

function liensDynamiques(): LienTrouve[] {
  const trouves: LienTrouve[] = [];
  for (const fichier of sources()) {
    const contenu = readFileSync(path.join(RACINE, fichier), "utf8");
    for (const lien of contenu.match(LIEN_DYNAMIQUE) ?? []) {
      trouves.push({ fichier, precharge: !/prefetch=\{false\}/.test(lien) });
    }
  }
  return trouves;
}

/**
 * Les liens dont la cible est calculée SANS être une liste.
 *
 * L'heuristique — « `href` interpolé, donc élément de liste » — se trompe dans
 * un cas : un écran de détail qui renvoie vers un autre écran du même objet.
 * La cible est calculée, mais il n'y en a qu'une, et c'est le geste suivant le
 * plus probable. Chaque exemption porte sa raison, et en ajouter une se voit.
 */
const EXEMPTES: Record<string, string> = {
  "app/(app)/gyms/[id]/page.tsx":
    "Un seul lien, vers le parc de CETTE salle : le geste suivant attendu " +
    "quand on ouvre une salle.",
  "app/(app)/gyms/[id]/exercices/page.tsx":
    "Le retour vers la salle qu'on vient de quitter. Une cible, déjà rendue.",
};

describe("préchargement des liens de liste", () => {
  it("aucun lien de liste n'est préchargé", () => {
    const precharges = liensDynamiques()
      .filter((l) => l.precharge && !(l.fichier in EXEMPTES))
      .map((l) => l.fichier);

    expect(
      [...new Set(precharges)],
      "Un lien dont la cible est calculée appartient à une liste. Ajoute " +
        "`prefetch={false}`, ou explique ici pourquoi celui-là mérite d'être " +
        "anticipé.",
    ).toEqual([]);
  });

  it("désactive le préchargement sur la navigation et l'accueil", () => {
    const fichiers = [
      "components/layout/BottomNav.tsx",
      "components/layout/AppTopbar.tsx",
      "components/settings/ListeReglages.tsx",
      "components/dashboard/ContenuTableauDeBord.tsx",
      "components/dashboard/CarteProgramme.tsx",
      "components/dashboard/CarteAujourdhui.tsx",
      "components/dashboard/ComplementTableauDeBord.tsx",
    ];

    for (const fichier of fichiers) {
      const contenu = readFileSync(path.join(RACINE, fichier), "utf8");
      const liens = contenu.match(/<Link\b[^>]*>/g) ?? [];
      expect(liens, fichier).not.toEqual([]);
      expect(
        liens.every((lien) => /prefetch=\{false\}/.test(lien)),
        `${fichier}: chaque lien visible doit opt-out du préchargement`,
      ).toBe(true);
    }
  });

  it("la limite de suspension qui rend tout ça possible existe toujours", () => {
    // Elle conserve un retour visuel immédiat pendant la navigation explicite.
    expect(sources()).toContain("app/(app)/loading.tsx");
  });
});
