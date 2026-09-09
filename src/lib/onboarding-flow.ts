import { BORNES_CORPS, BORNES_DUREE, bornesDeNaissance } from "@/lib/validators/onboarding";

export interface EtatOnboardingMinimal {
  mesures: { dateNaissance: string; sexe: string; taille: string; poids: string; poidsDate: string };
  objectifType: string;
  niveauExperience: string;
  anneesDePratique: string;
  moisDInterruption: string;
  dureeCible: string;
  dureeMax: string;
  lieuId: string;
  nouveauLieuNom: string;
}

const nombreValide = (v: string, min: number, max: number) => {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n >= min && n <= max;
};

export function erreursMesures(etat: EtatOnboardingMinimal) {
  const erreurs: Partial<Record<keyof EtatOnboardingMinimal["mesures"], string>> = {};
  const m = etat.mesures;
  const bornes = bornesDeNaissance();
  if (!m.dateNaissance || m.dateNaissance < bornes.min || m.dateNaissance > bornes.max) {
    erreurs.dateNaissance = "Indique une date de naissance valide.";
  }
  if (!m.sexe) erreurs.sexe = "Choisis une réponse.";
  if (!nombreValide(m.taille, BORNES_CORPS.taille.min, BORNES_CORPS.taille.max)) {
    erreurs.taille = `Entre ${BORNES_CORPS.taille.min} et ${BORNES_CORPS.taille.max} cm.`;
  }
  if (!nombreValide(m.poids, BORNES_CORPS.poids.min, BORNES_CORPS.poids.max)) {
    erreurs.poids = `Entre ${BORNES_CORPS.poids.min} et ${BORNES_CORPS.poids.max} kg.`;
  }
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (!m.poidsDate || m.poidsDate > aujourdhui) {
    erreurs.poidsDate = "Indique la date réelle de cette pesée.";
  }
  return erreurs;
}

export function blocageEtape(etape: number, etat: EtatOnboardingMinimal): string | null {
  if (etape === 1 && Object.keys(erreursMesures(etat)).length > 0) {
    return "Complète les informations signalées.";
  }
  if (etape === 2) {
    if (!etat.niveauExperience) return "Choisis l’expérience qui te ressemble aujourd’hui.";
    if (!nombreValide(etat.anneesDePratique, 0, 60)) return "Indique tes années de pratique, même 0.";
    if (!nombreValide(etat.moisDInterruption, 0, 600)) return "Indique ton interruption en mois, même 0.";
  }
  if (etape === 3 && !etat.objectifType) return "Choisis ton objectif principal.";
  if (etape === 5) {
    if (!nombreValide(etat.dureeCible, BORNES_DUREE.min, BORNES_DUREE.max)
      || !nombreValide(etat.dureeMax, BORNES_DUREE.min, BORNES_DUREE.max)) {
      return `Choisis des durées entre ${BORNES_DUREE.min} et ${BORNES_DUREE.max} minutes.`;
    }
    if (Number(etat.dureeCible) > Number(etat.dureeMax)) {
      return "La durée idéale ne peut pas dépasser le maximum.";
    }
  }
  if (etape === 6 && !etat.lieuId && etat.nouveauLieuNom.trim().length < 2) {
    return "Choisis un lieu ou donne-lui un nom.";
  }
  return null;
}
