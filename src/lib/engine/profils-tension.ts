/**
 * Les trois profils de tension, et ce qu'ils autorisent comme substitution.
 *
 * Le profil dit À QUEL MOMENT du mouvement le muscle cible reçoit le plus de
 * tension. Il ne dit rien de la valeur d'un exercice : aucun des trois n'est
 * meilleur, ils mesurent des qualités différentes.
 *
 *   stretch    tension maximale quand le muscle cible est en position allongée
 *   mi_range   tension maximale à mi-amplitude, aucun extrême ne domine
 *   contract   tension maximale quand le muscle cible est raccourci
 *
 * La règle de compatibilité vivait recopiée à l'identique dans deux modules —
 * la recherche de substituts et le dépannage « machine occupée » — sous cette
 * forme :
 *
 *     inst.profilTension !== criteria.profilTension && inst.profilTension !== "mi_range"
 *
 * Elle produisait une asymétrie que personne n'avait écrite. Remplacer un
 * `stretch` acceptait `stretch` et `mi_range` ; remplacer un `contract`
 * acceptait `contract` et `mi_range` ; mais remplacer un `mi_range`
 * n'acceptait QUE `mi_range`. Le profil le plus neutre était donc le plus
 * difficile à remplacer, ce qui est exactement l'inverse du bon sens.
 *
 * Une seule règle la remplace : les trois profils occupent un AXE ordonné, et
 * deux profils sont compatibles quand ils sont voisins.
 *
 *     stretch ——— mi_range ——— contract
 *        0           1            2
 *
 * `stretch` et `contract` restent incompatibles : c'est là que la substitution
 * cesse d'être fidèle. L'axe est symétrique — il ordonne, il ne classe pas.
 */

export const PROFILS_TENSION = ["stretch", "mi_range", "contract"] as const;
export type ProfilTension = (typeof PROFILS_TENSION)[number];

export const DEFINITIONS_PROFIL: Record<ProfilTension, string> = {
  stretch: "Tension maximale muscle cible en position allongée",
  mi_range: "Tension maximale à mi-amplitude, aucun extrême ne domine",
  contract: "Tension maximale muscle cible raccourci",
};

/** Position sur l'axe. Un ordre, pas un classement. */
const POSITION: Record<ProfilTension, number> = { stretch: 0, mi_range: 1, contract: 2 };

export function estUnProfil(valeur: string | null | undefined): valeur is ProfilTension {
  return valeur === "stretch" || valeur === "mi_range" || valeur === "contract";
}

/**
 * Écart entre deux profils sur l'axe : 0 identique, 1 voisin, 2 opposé.
 *
 * `null` quand l'un des deux n'est pas renseigné — l'absence n'est pas une
 * distance, et la traiter comme zéro rendrait compatible n'importe quoi.
 */
export function distanceProfil(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  if (!estUnProfil(a) || !estUnProfil(b)) return null;
  return Math.abs(POSITION[a] - POSITION[b]);
}

/**
 * Ce profil peut-il en remplacer un autre ?
 *
 * Voisins acceptés, opposés refusés. Un profil inconnu est accepté : refuser
 * faute d'information reviendrait à punir une donnée manquante, et le
 * catalogue en renseigne cent vingt sur cent vingt — l'inconnu ne viendrait
 * que d'une saisie libre.
 */
export function profilCompatible(
  cible: string | null | undefined,
  candidat: string | null | undefined,
): boolean {
  const d = distanceProfil(cible, candidat);
  return d === null || d <= 1;
}

// ---------------------------------------------------------------------------
// Nature du mouvement
// ---------------------------------------------------------------------------

/**
 * Deux natures d'exercice, définies par l'organisation du mouvement.
 *
 * `isolation` : mouvement local, principalement organisé autour d'UNE SEULE
 * articulation motrice. Un curl, une extension de genou, un écarté.
 *
 * `polyarticulaire` : mouvement global exigeant la coordination de plusieurs
 * articulations ou segments — y compris quand une articulation ou un muscle
 * domine nettement. Un hip thrust, un pull-through, un ab-wheel.
 *
 * La distinction porte sur l'ORGANISATION du mouvement, pas sur le fait qu'un
 * muscle soit particulièrement ciblé : « isolation » ne veut pas dire « ça
 * cible bien les biceps », sinon un curl incliné et une traction supination
 * tomberaient dans la même case.
 *
 * Elle est INDÉPENDANTE de `categorieRole`. Un programme peut placer une
 * isolation en pilier, et rien ici ne l'en empêche : le type décrit le
 * mouvement, le rôle décrit la décision.
 */
export const TYPES_MOUVEMENT = ["polyarticulaire", "isolation"] as const;
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];

export const DEFINITIONS_TYPE: Record<TypeMouvement, string> = {
  polyarticulaire:
    "Mouvement global, coordination de plusieurs articulations ou segments, "
    + "même lorsqu'une articulation domine",
  isolation:
    "Mouvement local, principalement organisé autour d'une seule articulation motrice",
};

export function estUnType(valeur: string | null | undefined): valeur is TypeMouvement {
  return valeur === "polyarticulaire" || valeur === "isolation";
}
