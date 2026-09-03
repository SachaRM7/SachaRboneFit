/**
 * Les exercices dont on ne veut pas.
 *
 * `users.exercices_refuses` était lu par un seul endroit : le constructeur du
 * plan de CALIBRATION. Une fois le bloc de calibration en place, plus rien ne
 * le consultait — ni la séance du jour, ni la résolution de salle. Un exercice
 * refusé à l'inscription disparaissait donc des premières séances, puis
 * revenait sans explication dès le cycle suivant, ou dès qu'un exercice devait
 * être remplacé.
 *
 * La règle de correspondance vit ici, une fois, parce que deux implémentations
 * auraient fini par diverger sur un détail invisible : la colonne contient
 * aujourd'hui des identifiants, et des NOMS pour les profils enregistrés avant
 * ce changement. Les deux formes doivent continuer d'être reconnues.
 */

/**
 * Reconnaît les deux formes : identifiant du catalogue, ou nom historique.
 *
 * Le nom est REQUIS, même s'il n'est utile que pour les anciens profils. En le
 * rendant facultatif, n'importe quel objet portant un `exerciseId` satisfaisait
 * le type : la correspondance par nom se désactivait sans que rien ne le dise,
 * et un refus enregistré sous forme de nom cessait silencieusement de
 * s'appliquer. Le compilateur doit poser la question à chaque appel.
 */
export function estRefuse(
  exercice: { exerciseId: string; exerciceNom: string | null },
  refuses: ReadonlySet<string>,
): boolean {
  if (refuses.size === 0) return false;
  if (refuses.has(exercice.exerciseId)) return true;
  const nom = exercice.exerciceNom?.toLowerCase().trim();
  return Boolean(nom) && refuses.has(nom!);
}

/** Indexe les deux formes, pour que `estRefuse` n'ait plus à y penser. */
export function indexerRefus(refuses: readonly string[] | null | undefined): Set<string> {
  return new Set((refuses ?? []).flatMap((v) => [v, v.toLowerCase().trim()]));
}
