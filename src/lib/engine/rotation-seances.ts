/** Les gabarits arrivent dans l'ordre du programme. Le lundi ne remet pas la rotation à zéro. */
export function gabaritSuivant<T extends { id: string }>(
  gabarits: readonly T[],
  dernierId: string | null,
): T | null {
  if (!gabarits.length) return null;
  const precedent = dernierId ? gabarits.findIndex((g) => g.id === dernierId) : -1;
  return gabarits[(precedent + 1) % gabarits.length]!;
}
