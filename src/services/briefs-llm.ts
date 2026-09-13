import { appelerLLM, CoachIndisponible } from "@/lib/coach/llm-client";

/** Mettre en mots ce que le moteur a déjà calculé — et rien de plus. */
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
  if (e instanceof BriefIndisponible) return "réponse vide du modèle";
  if (e instanceof CoachIndisponible) {
    return e.statut === undefined
      ? "modèle non configuré ou requête refusée"
      : `modèle indisponible (HTTP ${e.statut})`;
  }
  return "échec inattendu de l'appel au modèle";
}

const REGLES_COMMUNES = [
  "Tu écris pour une application d'entraînement, en français, à la deuxième personne.",
  "Tu ne disposes QUE des données JSON fournies. N'invente jamais un chiffre, un exercice, une performance, une progression ni un incident qui n'y figure pas.",
  "Si une information manque, ne la mentionne pas — n'écris pas que tu ne l'as pas.",
  "Pas de conseil médical. Une gêne se signale, elle ne se diagnostique pas.",
  "Sois bref : quelques lignes courtes, sans introduction ni formule de politesse.",
].join(" ");

/**
 * La consigne de longueur du prompt n'est pas une garantie. On applique donc
 * aussi une limite dure côté serveur avant stockage et affichage.
 */
function bornerMots(texte: string, maximum: number): string {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  if (mots.length <= maximum) return texte.trim();
  return `${mots.slice(0, maximum).join(" ")}…`;
}

async function rediger(system: string, contexte: unknown, maximumMots: number): Promise<TexteGenere> {
  const reponse = await appelerLLM({
    system: `${REGLES_COMMUNES}\n\n${system}`,
    messages: [{ role: "user", content: JSON.stringify(contexte) }],
  }, "courant");

  const texte = bornerMots(reponse.texte, maximumMots);
  if (!texte) throw new BriefIndisponible("Le modèle n'a renvoyé aucun texte.");

  return {
    texte,
    modeleUtilise: reponse.modeleUtilise ?? "inconnu",
    genereLe: new Date().toISOString(),
  };
}

export async function genererBriefPreSeance(contexte: unknown): Promise<TexteGenere> {
  return rediger(
    [
      "Rédige un briefing de moins de 90 mots pour la séance de DEMAIN.",
      "Structure attendue, une ligne chacune, en omettant celles dont tu n'as pas la donnée :",
      "« Demain : <nom de la séance> », « Priorité : … », « Attention : … », « Repère : … », « Récupération : … ».",
      "La séance annoncée est celle du contexte. Ne la choisis pas, ne la renomme pas.",
    ].join(" "),
    contexte,
    90,
  );
}

export async function genererDebriefHebdo(contexte: unknown): Promise<TexteGenere> {
  return rediger(
    [
      "Rédige un débrief de la semaine écoulée, moins de 120 mots.",
      "Commente la régularité, la charge de travail et ce qui a été signalé.",
      "Ne conclus à une progression ou à une stagnation QUE si le contexte en porte une explicitement.",
      "Termine par une seule suggestion concrète pour la semaine qui vient, tirée des données.",
    ].join(" "),
    contexte,
    120,
  );
}
