/**
 * Client LLM du coach.
 *
 * Réécrit pour trois raisons cumulées :
 *
 * 1. Le flux SSE du fournisseur était ré-emballé tel quel et renvoyé au client,
 *    sans jamais être décodé. Les réponses affichées — et archivées en base —
 *    étaient du protocole brut. Ce chemin n'avait manifestement jamais tourné.
 * 2. Les outils (`lib/coach/tools.ts`) n'étaient jamais transmis au modèle :
 *    470 lignes correctes, appelées nulle part. Le coach n'avait donc aucun
 *    accès aux données.
 * 3. Le compte du fournisseur d'origine n'est plus actif.
 *
 * Le client ne diffuse plus : il renvoie une réponse structurée. C'est ce qui
 * permet d'exécuter la boucle d'outils simplement et supprime toute la classe de
 * bugs liée au parsing incrémental.
 */

export type FournisseurLLM = "gemini" | "groq" | "openai" | "anthropic";

export interface MessageLLM {
  role: "user" | "assistant";
  content: string;
}

export interface DefinitionOutil {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface AppelOutil {
  id: string;
  nom: string;
  arguments: Record<string, unknown>;
}

export interface ReponseLLM {
  texte: string;
  appelsOutils: AppelOutil[];
  /**
   * Le modèle qui a effectivement répondu, `fournisseur:modele`.
   *
   * La chaîne de repli fait qu'on ne le sait pas d'avance : le premier modèle
   * peut être indisponible et un autre répondre à sa place. Ce qu'on conserve
   * d'un texte généré doit dire par quoi il a été produit, sinon deux débriefs
   * écrits par deux modèles différents se ressemblent.
   */
  modeleUtilise?: string;
}

export interface OptionsLLM {
  messages: MessageLLM[];
  system: string;
  outils?: DefinitionOutil[];
  /** Résultats d'outils à renvoyer au modèle pour qu'il conclue. */
  resultatsOutils?: Array<{ appel: AppelOutil; resultat: string }>;
}

/** Un modèle précis chez un fournisseur précis. */
export interface CibleLLM {
  fournisseur: FournisseurLLM;
  modele: string;
}

/**
 * Nature de l'appel, qui décide de la chaîne de modèles employée.
 *
 * `courant` couvre l'écrasante majorité des échanges : question en séance,
 * explication d'un exercice, lecture de l'historique. `lourd` est réservé aux
 * arbitrages coûteux — refonte d'un bloc sur plusieurs semaines — où l'on
 * accepte de consommer un quota plus rare.
 */
export type ProfilAppel = "courant" | "lourd";

/**
 * Chaînes de repli, par ordre de préférence.
 *
 * Le modèle principal est un Qwen encore marqué « Preview » chez Groq : son
 * nom, son quota, voire son existence peuvent changer sans préavis. Rien dans
 * l'application ne doit donc dépendre de ce nom. Il se règle par variable
 * d'environnement, au format `fournisseur:modele`, séparé par des virgules :
 *
 *     LLM_CHAINE_COURANTE="groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-120b"
 *
 * Les modèles suivants ne servent qu'en cas de quota atteint, de modèle retiré
 * ou de panne — jamais pour masquer une requête invalide.
 */
const CHAINES_PAR_DEFAUT: Record<ProfilAppel, string> = {
  // Qwen offre dix fois le quota quotidien de GPT-OSS ; GPT-OSS, en Production,
  // prend le relais quand ce Preview défaille.
  courant: "groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-120b",
  // L'ordre s'inverse : on paie la stabilité sur les décisions structurantes.
  lourd: "groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b",
};

const FOURNISSEURS: readonly FournisseurLLM[] = ["gemini", "groq", "openai", "anthropic"];

function analyserChaine(brut: string): CibleLLM[] {
  return brut
    .split(",")
    .map((entree) => entree.trim())
    .filter(Boolean)
    .map((entree) => {
      const separateur = entree.indexOf(":");
      if (separateur === -1) return null;
      const fournisseur = entree.slice(0, separateur).trim() as FournisseurLLM;
      const modele = entree.slice(separateur + 1).trim();
      if (!FOURNISSEURS.includes(fournisseur) || !modele) return null;
      return { fournisseur, modele };
    })
    .filter((c): c is CibleLLM => c !== null);
}

export function chaineDeModeles(profil: ProfilAppel = "courant"): CibleLLM[] {
  const variable = profil === "lourd" ? "LLM_CHAINE_LOURDE" : "LLM_CHAINE_COURANTE";
  const chaine = analyserChaine(process.env[variable] || CHAINES_PAR_DEFAUT[profil]);
  if (chaine.length > 0) return chaine;
  // Une variable mal écrite ne doit pas rendre le coach muet.
  return analyserChaine(CHAINES_PAR_DEFAUT[profil]);
}

/** Premier fournisseur de la chaîne courante — utile pour l'affichage. */
export function fournisseurActif(): FournisseurLLM {
  return chaineDeModeles("courant")[0]?.fournisseur ?? "groq";
}

export class CoachIndisponible extends Error {
  /** Code HTTP du fournisseur, quand l'échec en vient. */
  readonly statut?: number;

  constructor(raison: string, statut?: number) {
    super(raison);
    this.name = "CoachIndisponible";
    this.statut = statut;
  }
}

/**
 * Un échec justifie-t-il d'essayer le modèle suivant ?
 *
 * Quota atteint, modèle retiré, panne du fournisseur : le repli a une chance
 * d'aboutir. Une requête invalide ou une clé absente échoueraient à l'identique
 * sur toute la chaîne — insister ne ferait que retarder l'erreur.
 */
function justifieUnRepli(erreur: unknown): boolean {
  if (!(erreur instanceof CoachIndisponible)) return true; // panne réseau
  if (erreur.statut === undefined) return false; // clé absente, fournisseur inconnu
  return erreur.statut === 404 || erreur.statut === 408 || erreur.statut === 429 || erreur.statut >= 500;
}

function cleApi(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new CoachIndisponible(`Clé ${nom} non configurée`);
  return valeur;
}

// ---------------------------------------------------------------------------
// Gemini — offre gratuite, function calling pris en charge
// ---------------------------------------------------------------------------

async function appelerGemini(options: OptionsLLM, nomModele: string): Promise<ReponseLLM> {
  const cle = cleApi("GEMINI_API_KEY");

  const contents: Array<Record<string, unknown>> = options.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Second tour : on rejoue les appels d'outils et leurs résultats.
  for (const { appel, resultat } of options.resultatsOutils ?? []) {
    contents.push({ role: "model", parts: [{ functionCall: { name: appel.nom, args: appel.arguments } }] });
    contents.push({
      role: "user",
      parts: [{ functionResponse: { name: appel.nom, response: { resultat } } }],
    });
  }

  const corps: Record<string, unknown> = {
    contents,
    systemInstruction: { parts: [{ text: options.system }] },
  };

  if (options.outils?.length) {
    corps.tools = [{
      functionDeclarations: options.outils.map((o) => ({
        name: o.name,
        description: o.description,
        parameters: o.input_schema,
      })),
    }];
  }

  const reponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${nomModele}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cle },
      body: JSON.stringify(corps),
    },
  );

  if (!reponse.ok) {
    throw new CoachIndisponible(`Gemini ${reponse.status} : ${await reponse.text()}`, reponse.status);
  }

  const data = await reponse.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];

  const texte = parts
    .filter((p: Record<string, unknown>) => typeof p.text === "string")
    .map((p: { text: string }) => p.text)
    .join("");

  const appelsOutils: AppelOutil[] = parts
    .filter((p: Record<string, unknown>) => p.functionCall)
    .map((p: { functionCall: { name: string; args?: Record<string, unknown> } }, i: number) => ({
      id: `${p.functionCall.name}-${i}`,
      nom: p.functionCall.name,
      arguments: p.functionCall.args ?? {},
    }));

  return { texte, appelsOutils };
}

// ---------------------------------------------------------------------------
// Groq et OpenAI — même protocole
// ---------------------------------------------------------------------------

async function appelerCompatibleOpenAI(
  options: OptionsLLM,
  base: string,
  nomCle: string,
  nomModele: string,
): Promise<ReponseLLM> {
  const cle = cleApi(nomCle);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: options.system },
    ...options.messages,
  ];

  for (const { appel, resultat } of options.resultatsOutils ?? []) {
    messages.push({
      role: "assistant",
      tool_calls: [{
        id: appel.id,
        type: "function",
        function: { name: appel.nom, arguments: JSON.stringify(appel.arguments) },
      }],
    });
    messages.push({ role: "tool", tool_call_id: appel.id, content: resultat });
  }

  const corps: Record<string, unknown> = { model: nomModele, messages };

  if (options.outils?.length) {
    corps.tools = options.outils.map((o) => ({
      type: "function",
      function: { name: o.name, description: o.description, parameters: o.input_schema },
    }));
  }

  const reponse = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cle}` },
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    throw new CoachIndisponible(`${nomModele} ${reponse.status} : ${await reponse.text()}`, reponse.status);
  }

  const data = await reponse.json();
  const message = data?.choices?.[0]?.message ?? {};

  const appelsOutils: AppelOutil[] = (message.tool_calls ?? []).map(
    (t: { id: string; function: { name: string; arguments: string } }) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(t.function.arguments || "{}");
      } catch {
        // arguments malformés : on laisse l'outil décider quoi faire d'un objet vide
      }
      return { id: t.id, nom: t.function.name, arguments: args };
    },
  );

  return { texte: message.content ?? "", appelsOutils };
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

async function appelerAnthropic(options: OptionsLLM, nomModele: string): Promise<ReponseLLM> {
  const cle = cleApi("ANTHROPIC_API_KEY");

  const messages: Array<Record<string, unknown>> = options.messages.map((m) => ({ ...m }));

  for (const { appel, resultat } of options.resultatsOutils ?? []) {
    messages.push({
      role: "assistant",
      content: [{ type: "tool_use", id: appel.id, name: appel.nom, input: appel.arguments }],
    });
    messages.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: appel.id, content: resultat }],
    });
  }

  const corps: Record<string, unknown> = {
    model: nomModele,
    max_tokens: 2048,
    system: options.system,
    messages,
  };

  if (options.outils?.length) corps.tools = options.outils;

  const reponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cle,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    throw new CoachIndisponible(`Anthropic ${reponse.status} : ${await reponse.text()}`, reponse.status);
  }

  const data = await reponse.json();
  const blocs: Array<Record<string, unknown>> = data?.content ?? [];

  return {
    texte: blocs.filter((b) => b.type === "text").map((b) => b.text as string).join(""),
    appelsOutils: blocs
      .filter((b) => b.type === "tool_use")
      .map((b) => ({
        id: b.id as string,
        nom: b.name as string,
        arguments: (b.input as Record<string, unknown>) ?? {},
      })),
  };
}

async function appelerCible(cible: CibleLLM, options: OptionsLLM): Promise<ReponseLLM> {
  switch (cible.fournisseur) {
    case "gemini":
      return appelerGemini(options, cible.modele);
    case "groq":
      return appelerCompatibleOpenAI(options, "https://api.groq.com/openai/v1", "GROQ_API_KEY", cible.modele);
    case "openai":
      return appelerCompatibleOpenAI(options, "https://api.openai.com/v1", "OPENAI_API_KEY", cible.modele);
    case "anthropic":
      return appelerAnthropic(options, cible.modele);
    default:
      throw new CoachIndisponible(`Fournisseur inconnu : ${cible.fournisseur}`);
  }
}

/**
 * Appelle le coach en parcourant la chaîne de modèles du profil demandé.
 *
 * Le client ne connaissait qu'un fournisseur et un modèle : si celui-ci
 * atteignait son quota ou disparaissait, le coach devenait muet. Il essaie
 * maintenant les cibles dans l'ordre, et ne bascule que sur les échecs qu'un
 * autre modèle a une chance de surmonter.
 */
export async function appelerLLM(
  options: OptionsLLM,
  profil: ProfilAppel = "courant",
): Promise<ReponseLLM> {
  const chaine = chaineDeModeles(profil);
  let dernierEchec: unknown = new CoachIndisponible("Aucun modèle configuré");

  for (const [rang, cible] of chaine.entries()) {
    try {
      // Le nom du modèle est ajouté ICI, une fois pour toutes : c'est le seul
      // endroit qui sait lequel de la chaîne a fini par répondre.
      return { ...(await appelerCible(cible, options)), modeleUtilise: `${cible.fournisseur}:${cible.modele}` };
    } catch (erreur) {
      dernierEchec = erreur;
      const reste = rang < chaine.length - 1;
      if (!reste || !justifieUnRepli(erreur)) break;
      console.warn(
        `[coach] ${cible.fournisseur}:${cible.modele} indisponible, repli — ${
          erreur instanceof Error ? erreur.message : String(erreur)
        }`,
      );
    }
  }

  throw dernierEchec;
}
