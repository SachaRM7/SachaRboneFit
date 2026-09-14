/**
 * Rédaction déterministe des briefs automatiques.
 *
 * Le fichier garde son nom historique pour éviter de casser tous les imports,
 * mais il ne parle plus à aucun fournisseur LLM. Le moteur calcule déjà les
 * faits ; cette couche ne fait que les mettre en forme de façon stable.
 */
import { CoachIndisponible } from "@/lib/coach/llm-client";

export interface TexteGenere {
  texte: string;
  modeleUtilise: string;
  genereLe: string;
}

export class BriefIndisponible extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = "BriefIndisponible";
  }
}

const SIGNATURES_HERITEES = [
  "Configurez l'intégration LLM",
  "[Pré-calcul pour ",
  "[Debrief hebdomadaire pour ",
  "Ce résumé est généré automatiquement.",
];

/**
 * Compatibilité avec les lecteurs existants : un contenu déterministe possède
 * lui aussi une signature de générateur dans la trace (`deterministe:*`).
 */
export function contenuIAValide(
  contenu: string | null | undefined,
  trace: unknown,
): boolean {
  const texte = (contenu ?? "").trim();
  if (!texte) return false;
  if (SIGNATURES_HERITEES.some((s) => texte.includes(s))) return false;

  const modele = (trace as { modeleUtilise?: unknown } | null | undefined)?.modeleUtilise;
  return typeof modele === "string" && modele.trim().length > 0;
}

export function raisonCourte(e: unknown): string {
  if (e instanceof BriefIndisponible) {
    return /aucun texte|vide/i.test(e.message)
      ? "réponse vide du modèle"
      : e.message || "données insuffisantes";
  }
  if (e instanceof CoachIndisponible) {
    return e.statut === undefined
      ? "modèle non configuré ou requête refusée"
      : `modèle indisponible (HTTP ${e.statut})`;
  }
  return "échec inattendu de l'appel au modèle";
}

type Objet = Record<string, unknown>;

function objet(v: unknown): Objet | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Objet : null;
}

function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function nombre(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function liste(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function joindreNoms(v: unknown, cle = "muscle", limite = 3): string | null {
  const noms = liste(v)
    .map((x) => objet(x))
    .map((x) => x ? texte(x[cle]) : null)
    .filter((x): x is string => Boolean(x))
    .slice(0, limite);
  return noms.length ? noms.join(", ") : null;
}

function produit(texteProduit: string): TexteGenere {
  const propre = texteProduit.trim();
  if (!propre) throw new BriefIndisponible("données insuffisantes");
  return {
    texte: propre,
    modeleUtilise: "deterministe:briefs-v1",
    genereLe: new Date().toISOString(),
  };
}

export async function genererBriefPreSeance(contexte: unknown): Promise<TexteGenere> {
  const c = objet(contexte);
  const seance = objet(c?.seanceDeDemain);
  const cycle = objet(c?.cycle);
  const nom = texte(seance?.nom);
  const lettre = texte(seance?.lettre);
  if (!nom && !lettre) throw new BriefIndisponible("séance suivante absente");

  const lignes: string[] = [];
  lignes.push(`Demain : ${[lettre, nom].filter(Boolean).join(" — ")}.`);

  const phase = texte(cycle?.phase);
  const tendance = texte(cycle?.tendancePerformance);
  if (phase || tendance) {
    const morceaux = [phase ? `phase ${phase}` : null, tendance ? `tendance ${tendance}` : null].filter(Boolean);
    lignes.push(`Repère : ${morceaux.join(", ")}.`);
  }

  const contraintes = joindreNoms(c?.contraintes);
  if (contraintes) lignes.push(`Attention : contraintes actives sur ${contraintes}.`);

  const recuperation = joindreNoms(c?.recuperation);
  if (recuperation) lignes.push(`Récupération : ${recuperation} ne sont pas encore considérés comme pleinement prêts.`);

  if (!contraintes && !recuperation) {
    lignes.push("Récupération : aucun signal particulier remonté par le moteur pour demain.");
  }

  return produit(lignes.join("\n"));
}

export async function genererDebriefHebdo(contexte: unknown): Promise<TexteGenere> {
  const c = objet(contexte);
  if (!c) throw new BriefIndisponible("statistiques hebdomadaires absentes");

  const nbSeances = nombre(c.nbSeances) ?? 0;
  if (nbSeances <= 0) throw new BriefIndisponible("aucune séance cette semaine");

  const nbSeries = nombre(c.nbSeries) ?? 0;
  const minutes = nombre(c.dureeTotaleMinutes) ?? 0;
  const lignes: string[] = [
    `Cette semaine : ${nbSeances} séance${nbSeances > 1 ? "s" : ""}, ${nbSeries} séries${minutes > 0 ? `, ${minutes} min au total` : ""}.`,
  ];

  const feux = objet(c.feux);
  const orange = nombre(feux?.orange) ?? 0;
  const rouge = nombre(feux?.rouge) ?? 0;
  if (rouge > 0) lignes.push(`Récupération : ${rouge} séance${rouge > 1 ? "s" : ""} avec feu rouge.`);
  else if (orange > 0) lignes.push(`Récupération : ${orange} séance${orange > 1 ? "s" : ""} avec feu orange.`);

  const zones = liste(c.zonesSignalees)
    .map((x) => objet(x))
    .filter((x): x is Objet => Boolean(x))
    .map((x) => {
      const muscle = texte(x.muscle);
      const fois = nombre(x.fois);
      return muscle ? `${muscle}${fois ? ` (${fois}×)` : ""}` : null;
    })
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);
  if (zones.length) lignes.push(`À surveiller : ${zones.join(", ")}.`);

  const recuperation = joindreNoms(c.recuperation);
  if (recuperation) {
    lignes.push(`Pour la semaine qui vient : laisse le moteur ménager en priorité ${recuperation}.`);
  } else if (rouge > 0 || orange > 0) {
    lignes.push("Pour la semaine qui vient : conserve les adaptations prévues par le feu biologique.");
  } else {
    lignes.push("Pour la semaine qui vient : poursuis la rotation prévue sans ajouter de volume hors programme.");
  }

  return produit(lignes.join("\n"));
}
