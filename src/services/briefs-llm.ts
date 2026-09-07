import { appelerLLM, CoachIndisponible } from "@/lib/coach/llm-client";

/**
 * Mettre en mots ce que le moteur a déjà calculé — et rien de plus.
 *
 * LA RÈGLE, inchangée depuis le début du projet :
 *
 *   MOTEUR   calcule, choisit, valide, refuse.
 *   LLM      explique, résume, hiérarchise.
 *   BASE     fait autorité.
 *
 * Le modèle ne décide donc ni la prochaine séance, ni les exercices, ni les
 * charges, ni les performances, ni les incidents, ni les muscles récupérés, ni
 * les statistiques de la semaine. Il reçoit tout cela déjà établi, et rédige.
 * Le prompt le lui dit en toutes lettres, et le contexte lui est passé en JSON
 * plutôt qu'en prose : un chiffre reformulé est un chiffre qu'on peut perdre.
 *
 * POURQUOI CE FICHIER
 *
 * Les deux crons écrivaient chacun un texte fixe. Les brancher séparément
 * aurait dupliqué la même plomberie — prompt, appel, validation de la réponse,
 * traçabilité du modèle — dans deux routes que personne ne relit ensemble. Ce
 * n'est pas un framework : deux fonctions, un garde commun, rien d'autre.
 */

/** Ce qu'un appel réussi rend, traçabilité comprise. */
export interface TexteGenere {
  texte: string;
  /** `fournisseur:modele` — celui qui a RÉPONDU, pas celui qu'on visait. */
  modeleUtilise: string;
  genereLe: string;
}

/**
 * Erreur métier : le modèle n'a rien produit d'utilisable.
 *
 * Distinguée d'une panne réseau parce que l'appelant en fait la même chose —
 * ne rien écrire — mais qu'il doit pouvoir le dire autrement dans son rapport.
 */
export class BriefIndisponible extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = "BriefIndisponible";
  }
}

// ---------------------------------------------------------------------------
// Ce qui compte comme un contenu produit par le modèle
// ---------------------------------------------------------------------------

/**
 * Les signatures des textes que les crons écrivaient AVANT ce lot.
 *
 * Ils sont toujours en base : cette PR ne supprime aucune donnée. Or ils ont
 * exactement la forme d'un résultat — une ligne, une date, un `contenu` non
 * vide — et le tableau de bord affichait n'importe quelle ligne existante sans
 * demander d'où elle venait. Corriger les crons sans reconnaître ces lignes
 * aurait laissé le défaut visible à l'écran après le merge.
 *
 * La phrase commune aux deux suffirait ; les trois autres sont là parce
 * qu'une reconnaissance qui repose sur une seule chaîne se contourne au
 * premier reformatage, et que ces textes-là ne changeront plus jamais.
 */
const SIGNATURES_HERITEES = [
  "Configurez l'intégration LLM",
  "[Pré-calcul pour ",
  "[Debrief hebdomadaire pour ",
  "Ce résumé est généré automatiquement.",
];

/**
 * Ce contenu vient-il réellement d'un modèle ?
 *
 * DEUX CRITÈRES, ET LE PREMIER EST LA TRAÇABILITÉ. Depuis ce lot, toute
 * écriture dépose `modeleUtilise` dans le `jsonb` qui l'accompagne —
 * `contexte_utilise` pour le précalcul, `stats` pour l'hebdomadaire. Une ligne
 * qui n'en porte pas n'a pas pu être écrite par le chemin actuel.
 *
 * Les crons étant les seuls à écrire dans ces deux tables, exiger la trace
 * suffirait à écarter tout l'héritage. Les signatures restent quand même
 * vérifiées : elles disent CE QU'ON REFUSE, là où l'absence de trace ne dit
 * que « écrit par un chemin qu'on ne connaît pas ». Et elles couvrent le cas
 * où un texte hérité se retrouverait recopié dans une ligne tracée.
 *
 * Aucune suppression : une ligne héritée est traitée comme absente, et le
 * prochain succès du modèle la remplace par l'`upsert` ordinaire.
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

/**
 * Pourquoi l'appel a échoué, en une ligne qu'on peut journaliser.
 *
 * LE CONTEXTE N'EN SORT PAS. Le message d'origine traverse le fournisseur —
 * `Groq 400 : {…}` reporte le corps de la réponse, qui peut reprendre tout ou
 * partie de la requête, c'est-à-dire l'entraînement d'une personne, ses zones
 * ménagées et son état de récupération. On ne le relaie donc pas : on rend une
 * catégorie et un code HTTP, ce qui suffit à distinguer un quota d'une clé
 * absente sans rien emporter d'autre.
 *
 * Le nom d'une variable d'environnement n'est pas davantage repris : `Clé
 * GROQ_API_KEY non configurée` deviendrait, recopié dans un canal partagé, une
 * indication sur l'infrastructure. « non configuré ou refusé » se diagnostique
 * aussi bien.
 */
export function raisonCourte(e: unknown): string {
  if (e instanceof BriefIndisponible) return "réponse vide du modèle";
  if (e instanceof CoachIndisponible) {
    return e.statut === undefined
      ? "modèle non configuré ou requête refusée"
      : `modèle indisponible (HTTP ${e.statut})`;
  }
  // Panne réseau, JSON illisible, imprévu : la catégorie, pas le détail.
  return "échec inattendu de l'appel au modèle";
}

/**
 * La consigne commune aux deux briefs.
 *
 * Elle interdit explicitement l'invention. Un modèle à qui l'on donne des
 * statistiques et un ton produit volontiers une progression plausible qui n'a
 * pas eu lieu — et personne, en lisant « tu progresses bien sur le développé »,
 * ne se demande d'où sort la phrase.
 */
const REGLES_COMMUNES = [
  "Tu écris pour une application d'entraînement, en français, à la deuxième personne.",
  "Tu ne disposes QUE des données JSON fournies. N'invente jamais un chiffre, un exercice, une performance, une progression ni un incident qui n'y figure pas.",
  "Si une information manque, ne la mentionne pas — n'écris pas que tu ne l'as pas.",
  "Pas de conseil médical. Une gêne se signale, elle ne se diagnostique pas.",
  "Sois bref : quelques lignes courtes, sans introduction ni formule de politesse.",
].join(" ");

/**
 * Appelle le modèle et refuse une réponse vide.
 *
 * Un texte vide serait stocké comme un contenu valide et s'afficherait comme un
 * bloc blanc. C'est exactement le défaut qu'on corrige — un placeholder qui a
 * l'air d'un résultat — donc il est traité comme un échec.
 */
async function rediger(system: string, contexte: unknown): Promise<TexteGenere> {
  const reponse = await appelerLLM({
    system: `${REGLES_COMMUNES}\n\n${system}`,
    // Le contexte voyage en JSON : il n'est pas reformulé, donc pas déformé.
    messages: [{ role: "user", content: JSON.stringify(contexte) }],
  }, "courant");

  const texte = reponse.texte.trim();
  if (!texte) throw new BriefIndisponible("Le modèle n'a renvoyé aucun texte.");

  return {
    texte,
    modeleUtilise: reponse.modeleUtilise ?? "inconnu",
    genereLe: new Date().toISOString(),
  };
}

/**
 * Le brief de la séance de demain.
 *
 * Il ne compose pas la séance : celle-ci est déterminée par la rotation, et les
 * repères viennent des services. Le modèle met en avant ce qui compte demain.
 */
export async function genererBriefPreSeance(contexte: unknown): Promise<TexteGenere> {
  return rediger(
    [
      "Rédige un briefing de moins de 90 mots pour la séance de DEMAIN.",
      "Structure attendue, une ligne chacune, en omettant celles dont tu n'as pas la donnée :",
      "« Demain : <nom de la séance> », « Priorité : … », « Attention : … », « Repère : … », « Récupération : … ».",
      "La séance annoncée est celle du contexte. Ne la choisis pas, ne la renomme pas.",
    ].join(" "),
    contexte,
  );
}

/**
 * Le débrief de la semaine écoulée.
 *
 * Les statistiques sont calculées et lui sont données. Il commente ce qu'elles
 * montrent, et se tait sur ce qu'elles ne montrent pas.
 */
export async function genererDebriefHebdo(contexte: unknown): Promise<TexteGenere> {
  return rediger(
    [
      "Rédige un débrief de la semaine écoulée, moins de 120 mots.",
      "Commente la régularité, la charge de travail et ce qui a été signalé.",
      "Ne conclus à une progression ou à une stagnation QUE si le contexte en porte une explicitement.",
      "Termine par une seule suggestion concrète pour la semaine qui vient, tirée des données.",
    ].join(" "),
    contexte,
  );
}
