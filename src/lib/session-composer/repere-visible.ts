/**
 * Résout le repère affiché d'une séance depuis son programme ACTUEL.
 *
 * `LIBRE` est une ancienne lettre de gabarit, pas une identité permanente :
 * elle cesse d'être vraie dès que la séance rejoint un programme structuré.
 * Les autres lettres, choisies par l'utilisateur, restent intactes.
 */
export function repereSeanceVisible(lettre: string, index: number, typeCycle: string) {
  if (typeCycle === "libre") return "LIBRE";
  return lettre.trim().toUpperCase() === "LIBRE"
    ? String(Math.max(index, 0) + 1).padStart(2, "0")
    : lettre;
}
