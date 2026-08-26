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
}

export interface OptionsLLM {
  messages: MessageLLM[];
  system: string;
  outils?: DefinitionOutil[];
  /** Résultats d'outils à renvoyer au modèle pour qu'il conclue. */
  resultatsOutils?: Array<{ appel: AppelOutil; resultat: string }>;
}

/** Fournisseur actif et modèle par défaut associé. */
export function fournisseurActif(): FournisseurLLM {
  return (process.env.LLM_PROVIDER as FournisseurLLM) || "gemini";
}

const MODELES_PAR_DEFAUT: Record<FournisseurLLM, string> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-20250514",
};

function modele(fournisseur: FournisseurLLM): string {
  return process.env.LLM_MODEL || MODELES_PAR_DEFAUT[fournisseur];
}

export class CoachIndisponible extends Error {
  constructor(raison: string) {
    super(raison);
    this.name = "CoachIndisponible";
  }
}

function cleApi(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new CoachIndisponible(`Clé ${nom} non configurée`);
  return valeur;
}

// ---------------------------------------------------------------------------
// Gemini — offre gratuite, function calling pris en charge
// ---------------------------------------------------------------------------

async function appelerGemini(options: OptionsLLM): Promise<ReponseLLM> {
  const cle = cleApi("GEMINI_API_KEY");
  const nomModele = modele("gemini");

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
    throw new CoachIndisponible(`Gemini ${reponse.status} : ${await reponse.text()}`);
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
    throw new CoachIndisponible(`${base} ${reponse.status} : ${await reponse.text()}`);
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

async function appelerAnthropic(options: OptionsLLM): Promise<ReponseLLM> {
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
    model: modele("anthropic"),
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
    throw new CoachIndisponible(`Anthropic ${reponse.status} : ${await reponse.text()}`);
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

export async function appelerLLM(options: OptionsLLM): Promise<ReponseLLM> {
  const fournisseur = fournisseurActif();

  switch (fournisseur) {
    case "gemini":
      return appelerGemini(options);
    case "groq":
      return appelerCompatibleOpenAI(options, "https://api.groq.com/openai/v1", "GROQ_API_KEY", modele("groq"));
    case "openai":
      return appelerCompatibleOpenAI(options, "https://api.openai.com/v1", "OPENAI_API_KEY", modele("openai"));
    case "anthropic":
      return appelerAnthropic(options);
    default:
      throw new CoachIndisponible(`Fournisseur inconnu : ${fournisseur}`);
  }
}
