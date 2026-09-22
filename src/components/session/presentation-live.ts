import { LIBELLES, versMuscle } from "@/lib/referentiels/muscles";

/**
 * Ce que le Live montre des muscles d'un exercice.
 *
 * Les composants du Live appelaient `libelleMuscle()` directement sur les
 * valeurs du plan. Or le plan porte le vocabulaire de la base — « pecs »,
 * « epaule_ant » —, et `libelleMuscle()` ne connait que les cles du referentiel
 * (« pectoraux », « epaules ») : tout ce qui n'y figurait pas s'affichait tel
 * quel a l'ecran. « pecs », « epaule_ant » : la fiche technique parlait en base,
 * pas en francais.
 *
 * La conversion existait pourtant, dans `versMuscle()`, qui ramene tous les
 * vocabulaires (base, saisie, module douleur) aux quinze muscles du
 * referentiel. Ce module ne fait que la brancher sur l'affichage du Live et
 * fixer les regles de lecture : principaux d'abord, sans doublon, trois au
 * maximum.
 *
 * Rien n'est invente : une valeur hors referentiel est montree telle quelle
 * plutot que traduite de force. Un exercice ne se voit pas attribuer un muscle
 * qu'il n'a pas declare.
 */

/** Au-dela, la ligne de muscles concurrence le nom de l'exercice. */
export const MAX_MUSCLES_AFFICHES = 3;

/**
 * Les libelles lisibles d'un exercice : principaux, puis secondaires.
 *
 * « pecs » et « epaule_ant » ressortent en « Pectoraux » et « Épaules » ;
 * « epaule_ant » et « epaules » ne comptent que pour une seule « Épaules ».
 * Les valeurs nulles, vides ou en double sont ecartees. La liste est vide
 * quand l'exercice ne declare aucun muscle utile.
 */
export function libellesMusclesLive(
  principaux: readonly (string | null | undefined)[] | null | undefined,
  secondaires: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const vus = new Set<string>();
  const libelles: string[] = [];

  for (const brut of [...(principaux ?? []), ...(secondaires ?? [])]) {
    if (typeof brut !== "string") continue;
    const valeur = brut.trim();
    if (!valeur) continue;

    const muscle = versMuscle(valeur);
    const cle = muscle ?? valeur.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);

    libelles.push(muscle ? LIBELLES[muscle] : valeur);
    if (libelles.length === MAX_MUSCLES_AFFICHES) break;
  }

  return libelles;
}

/**
 * La meme chose en une ligne — « Pectoraux · Épaules ».
 *
 * `null` quand il n'y a rien a montrer : c'est a l'appelant de decider s'il
 * masque la ligne ou s'il affiche un vide explicite.
 */
export function ligneMusclesLive(
  principaux: readonly (string | null | undefined)[] | null | undefined,
  secondaires: readonly (string | null | undefined)[] | null | undefined,
  separateur = " · ",
): string | null {
  const libelles = libellesMusclesLive(principaux, secondaires);
  return libelles.length > 0 ? libelles.join(separateur) : null;
}
