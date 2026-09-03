"use client";
import { useState } from "react";
import { PILIERS, PROFILS, ROLES } from "@/lib/schemas/exercise";
import {
  libelleCategorieRole, libellePilier, libelleProfilTension,
} from "@/lib/referentiels/libelles";

interface FiltersState {
  piliers: string[];
  profils: string[];
  roles: string[];
}

interface ExerciseFiltersProps {
  onChange: (filters: FiltersState) => void;
}

/**
 * Les filtres de la bibliothèque.
 *
 * Deux défauts, tous les deux visibles au premier coup d'œil sur l'appareil.
 *
 * Le filtre actif était INVISIBLE en thème clair. Il combinait le variant
 * `default` du bouton — dont le texte est `primary-foreground`, presque blanc —
 * avec un fond forcé à `--papier-2`, presque blanc lui aussi. Blanc sur blanc :
 * on voyait la pastille changer de teinte, sans pouvoir lire ce qu'elle disait.
 * En thème sombre le même code passait inaperçu, les deux valeurs s'y trouvant
 * de part et d'autre du contraste.
 *
 * Et les pastilles affichaient les clés du moteur : « P1 », « P2 », « stretch »,
 * « mi_range », « substitut ». Le référentiel des libellés existe, et son
 * commentaire dit déjà que le préfixe `P1_` est une clé de TRI qui n'a rien à
 * faire à l'écran — cette table vivait ici en troisième exemplaire, dans sa
 * version la plus cryptique.
 *
 * Les pastilles reprennent la forme de celles du filtre par salle, juste
 * au-dessus, qui étaient correctes : encre sur papier quand c'est actif, texte
 * secondaire sur carte sinon. Deux états qu'on distingue dans les deux thèmes,
 * sans dépendre de la couleur seule — le contour change avec le fond, et l'état
 * est annoncé.
 */
const PASTILLE_ACTIVE = "bg-encre text-papier border-encre";
const PASTILLE_INERTE = "bg-carte text-encre-2 border-filet";

interface Groupe {
  titre: string;
  categorie: keyof FiltersState;
  valeurs: readonly string[];
  libelle: (v: string) => string;
}

export function ExerciseFilters({ onChange }: ExerciseFiltersProps) {
  const [filters, setFilters] = useState<FiltersState>({
    piliers: [],
    profils: [],
    roles: [],
  });

  const toggle = (category: keyof FiltersState, value: string) => {
    const updated = {
      ...filters,
      [category]: filters[category].includes(value)
        ? filters[category].filter((v) => v !== value)
        : [...filters[category], value],
    };
    setFilters(updated);
    onChange(updated);
  };

  const groupes: Groupe[] = [
    { titre: "Pilier", categorie: "piliers", valeurs: PILIERS, libelle: libellePilier },
    { titre: "Profil de tension", categorie: "profils", valeurs: PROFILS, libelle: libelleProfilTension },
    { titre: "Rôle", categorie: "roles", valeurs: ROLES, libelle: libelleCategorieRole },
  ];

  return (
    <div className="space-y-3 p-4">
      {groupes.map(({ titre, categorie, valeurs, libelle }) => (
        <div key={categorie}>
          <p className="text-encre-3 text-xs mb-2">{titre}</p>
          <div className="flex flex-wrap gap-2">
            {valeurs.map((v) => {
              const actif = filters[categorie].includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => toggle(categorie, v)}
                  aria-pressed={actif}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    actif ? PASTILLE_ACTIVE : PASTILLE_INERTE
                  }`}
                >
                  {libelle(v)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
