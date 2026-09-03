import { describe, it, expect } from "vitest";
import { PILIERS, PROFILS, ROLES, TYPES } from "@/lib/schemas/exercise";
import {
  libelleCategorieRole, libellePilier, libelleProfilTension, libelleTypeMouvement,
} from "./libelles";

/**
 * Aucune clé du moteur ne doit atteindre l'écran.
 *
 * Les enums de ce projet portent leur usage interne dans leur nom : le préfixe
 * de `P1_poussee` ordonne les piliers, `mi_range` nomme une position sur la
 * courbe de tension. Utiles au moteur, illisibles pour quelqu'un qui filtre sa
 * bibliothèque — et les filtres affichaient exactement ça, « P1 » et
 * « mi_range », parce qu'ils tenaient leur propre table.
 *
 * Le référentiel est la seule source. Ce test le vérifie sur TOUTES les valeurs
 * déclarées, plutôt que sur celles auxquelles on aura pensé : ajouter un pilier
 * sans son libellé fait échouer ici, et pas sur l'appareil.
 */

const tables: Array<{ nom: string; valeurs: readonly string[]; libelle: (v: string) => string }> = [
  { nom: "piliers", valeurs: PILIERS, libelle: libellePilier },
  { nom: "profils de tension", valeurs: PROFILS, libelle: libelleProfilTension },
  { nom: "rôles", valeurs: ROLES, libelle: libelleCategorieRole },
  { nom: "types de mouvement", valeurs: TYPES, libelle: libelleTypeMouvement },
];

describe("les libellés couvrent tout ce que le moteur déclare", () => {
  for (const { nom, valeurs, libelle } of tables) {
    it(`${nom} : chaque valeur a un libellé, et ce n'est pas sa clé`, () => {
      for (const v of valeurs) {
        const rendu = libelle(v);
        expect(rendu, `${v} n'a pas de libellé`).not.toBe(v);
        // `traduire` renvoie la valeur brute quand la table ne la connaît
        // pas : c'est ce silence que ce test casse.
        expect(rendu, `${v} : libellé vide`).not.toBe("");
        expect(rendu, `${v} : le libellé porte encore une clé`).not.toMatch(/_/);
      }
    });
  }

  it("aucun pilier ne s'annonce par son rang de tri", () => {
    // « P1 », « P2 » : le préfixe est une clé d'ordre, pas un nom de geste.
    for (const p of PILIERS) {
      expect(libellePilier(p), `${p} rendu comme un rang`).not.toMatch(/^P\d/);
    }
  });

  it("une valeur inconnue reste rendue telle quelle, sans planter", () => {
    // Le contrôle négatif : le repli existe et se voit, plutôt que d'afficher
    // « — » à la place d'une donnée réelle.
    expect(libellePilier("pilier_inconnu")).toBe("pilier_inconnu");
    expect(libellePilier(null)).toBe("—");
  });
});
