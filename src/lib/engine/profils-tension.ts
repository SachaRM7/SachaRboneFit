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
 * Deux natures d'exercice. La définition est FONCTIONNELLE, pas anatomique.
 *
 * `isolation` : mouvement LOCAL, principalement organisé autour d'une seule
 * articulation motrice — un geste ciblé, dont la demande tient à un segment.
 * Un curl, une extension de genou, un écarté, une élévation latérale.
 *
 * `polyarticulaire` : mouvement GLOBAL, qui exige la coordination de plusieurs
 * articulations ou segments, OU des stabilisations importantes. Un squat, une
 * traction, un hip thrust, un pull-through, un pallof press, un ab-wheel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE CHAMP N'EST PAS — trois relectures à ne pas faire.
 *
 * 1. Ce n'est PAS « combien d'articulations bougent ».
 *    Un pallof press, un woodchop, un hanging leg raise, un ab-wheel sont
 *    polyarticulaires alors que peu d'articulations parcourent une grande
 *    amplitude : ce qui les classe, c'est la coordination et la stabilisation
 *    qu'ils exigent du corps entier. Compter les degrés de liberté mobilisés
 *    donnerait un résultat différent, et faux au regard de ce champ.
 *
 * 2. Ce n'est PAS « ce muscle est-il bien ciblé ».
 *    Sinon un curl incliné et une traction supination tomberaient dans la
 *    même case, ce que ni l'un ni l'autre ne mérite.
 *
 * 3. Ce n'est PAS le rôle dans la séance.
 *    `categorieRole` — pilier, substitut, accessoire — dit ce que le PROGRAMME
 *    a décidé ; `type` dit ce qu'est le MOUVEMENT. Une isolation peut ouvrir
 *    une séance en pilier, un polyarticulaire finir en accessoire, et rien
 *    dans ce module ne s'y oppose. Ne dérive jamais l'un de l'autre.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * La frontière tient à l'ORGANISATION du geste. Un crunch fléchit le rachis
 * et rien d'autre : isolation. Un ab-wheel engage la chaîne antérieure entière
 * pour résister à l'extension : polyarticulaire, malgré une amplitude
 * articulaire modeste.
 */
export const TYPES_MOUVEMENT = ["polyarticulaire", "isolation"] as const;
export type TypeMouvement = (typeof TYPES_MOUVEMENT)[number];

export const DEFINITIONS_TYPE: Record<TypeMouvement, string> = {
  polyarticulaire:
    "Mouvement global : coordination de plusieurs articulations ou segments, ou "
    + "stabilisations importantes — y compris quand l'amplitude articulaire reste modeste",
  isolation:
    "Mouvement local, geste ciblé principalement organisé autour d'une seule "
    + "articulation motrice",
};

export function estUnType(valeur: string | null | undefined): valeur is TypeMouvement {
  return valeur === "polyarticulaire" || valeur === "isolation";
}
