import { appelerLLM } from "@/lib/coach/llm-client";

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
