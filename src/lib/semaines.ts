/**
 * Les semaines, définies une fois.
 *
 * Il en existait quatre versions qui ne donnaient pas le même résultat :
 * le tableau de bord (correcte depuis peu), la traçabilité (correcte, en
 * ligne), le débrief hebdomadaire (sa propre fonction), et le volume par
 * pilier — dont la clé de semaine valait
 * `Math.ceil((jourDuMois + mois × 30) / 7)`, un numéro inventé qui collait
 * deux semaines différentes sous la même étiquette et les triait dans le
 * désordre.
 *
 * Une semaine commence le lundi. Tout est calculé en UTC sur des dates
 * `YYYY-MM-DD` : ces dates viennent d'une colonne `date` de PostgreSQL, elles
 * n'ont pas d'heure, et les interpréter en heure locale décalait la journée
 * d'un cran selon le fuseau.
 */

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/** Le lundi de la semaine contenant cette date, au format `YYYY-MM-DD`. */
export function lundiDe(dateISO: string): string {
  const jour = new Date(`${dateISO}T00:00:00Z`);
  // `getUTCDay()` vaut 0 le dimanche : `(j + 6) % 7` ramène lundi à 0 et
  // dimanche à 6. Sans cette rotation, le dimanche part sur le lundi SUIVANT.
  const decalage = (jour.getUTCDay() + 6) % 7;
  jour.setUTCDate(jour.getUTCDate() - decalage);
  return jour.toISOString().slice(0, 10);
}

/** Nombre de semaines distinctes couvertes par ces dates. */
export function semainesDistinctes(dates: string[]): number {
  return new Set(dates.map(lundiDe)).size;
}

/** Jours entiers écoulés entre deux dates, la seconde exclue. */
export function joursEntre(debutISO: string, finISO: string): number {
  const a = new Date(`${debutISO}T00:00:00Z`).getTime();
  const b = new Date(`${finISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / MS_PAR_JOUR);
}

/** Décale une date d'un nombre de jours, positif ou négatif. */
export function decalerDe(dateISO: string, jours: number): string {
  const j = new Date(`${dateISO}T00:00:00Z`);
  j.setUTCDate(j.getUTCDate() + jours);
  return j.toISOString().slice(0, 10);
}

/**
 * Les lundis des `nombre` dernières semaines RÉVOLUES, la plus ancienne
 * d'abord — la semaine en cours exclue.
 *
 * Comparer une semaine commencée mardi à des semaines entières fait chuter
 * tous les indicateurs le lundi matin et les fait remonter le dimanche soir.
 * Ce n'est pas une tendance, c'est le calendrier.
 */
export function semainesRevolues(aujourdhuiISO: string, nombre: number): string[] {
  const lundiCourant = lundiDe(aujourdhuiISO);
  const lundis: string[] = [];
  for (let i = nombre; i >= 1; i--) lundis.push(decalerDe(lundiCourant, -7 * i));
  return lundis;
}
