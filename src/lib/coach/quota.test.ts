import { afterEach, describe, expect, it, vi } from "vitest";
import { setTimeout as attendre } from "node:timers/promises";
import { appelerLLM } from "./llm-client";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const ok = () => Response.json({ choices: [{ message: { content: "Ta prochaine séance est C." } }] });
const quota = (delai = "2") => new Response("Quota atteint", { status: 429, headers: { "retry-after": delai } });
const options = {
  messages: [{ role: "user" as const, content: "Mon programme ?" }],
  sessionId: "2f1c9d54-6f3a-4f0b-9c1e-7a5d2b8e4c31",
  system: "Coach",
};
function config() {
  vi.stubEnv("OPENCODE_API_KEY", "test");
  vi.stubEnv("LLM_CHAINE_COURANTE", "opencode:principal,opencode:secours");
}

describe("quota du coach", () => {
  it("essaie le secours avant d'attendre", async () => {
    config(); const fetch = vi.fn().mockResolvedValueOnce(quota()).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    expect((await appelerLLM(options)).modeleUtilise).toBe("opencode:secours");
    expect(fetch.mock.calls[0]?.[0]).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        authorization: "Bearer test",
        "user-agent": "sportperso-coach/1.0",
        "x-opencode-session": options.sessionId,
      },
    });
    const corps = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(corps).toMatchObject({ thinking: { type: "disabled" }, max_tokens: 4096 });
    expect(attendre).not.toHaveBeenCalled();
  });
  it("retire les espaces accidentels autour de la clé", async () => {
    config();
    vi.stubEnv("OPENCODE_API_KEY", "  test\r\n");
    const fetch = vi.fn().mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    await appelerLLM(options);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer test" },
    });
  });
  it("peut synthétiser des résultats existants sans réexposer les outils", async () => {
    config();
    const fetch = vi.fn().mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    await appelerLLM({
      ...options,
      resultatsOutils: [{
        appel: { id: "appel-1", nom: "get_today_readiness", arguments: {} },
        resultat: "Feu vert",
      }],
    });
    const corps = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(corps).not.toHaveProperty("tools");
    expect(corps.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "assistant", tool_calls: expect.any(Array) }),
      { role: "tool", tool_call_id: "appel-1", content: "Feu vert" },
    ]));
  });
  it("normalise les appels DSML natifs de DeepSeek sans afficher leur balisage", async () => {
    config();
    const contenu = [
      "<｜｜DSML｜｜tool_calls>",
      "<｜｜DSML｜｜invoke name=\"validate_session\">",
      "<｜｜DSML｜｜parameter name=\"duration\" string=\"false\">35</｜｜DSML｜｜parameter>",
      "<｜｜DSML｜｜parameter name=\"label\" string=\"true\"><![CDATA[Courte]]></｜｜DSML｜｜parameter>",
      "<｜｜DSML｜｜parameter name=\"interdit\" string=\"true\">ignoré</｜｜DSML｜｜parameter>",
      "</｜｜DSML｜｜invoke>",
      "</｜｜DSML｜｜tool_calls>",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({
      choices: [{ message: { content: contenu } }],
    })));

    const reponse = await appelerLLM({
      ...options,
      outils: [{
        name: "validate_session",
        description: "Valide une séance",
        input_schema: {
          type: "object",
          properties: { duration: { type: "number" }, label: { type: "string" } },
        },
      }],
    });

    expect(reponse.texte).toBe("");
    expect(reponse.appelsOutils).toEqual([expect.objectContaining({
      nom: "validate_session",
      arguments: { duration: 35, label: "Courte" },
    })]);
  });
  it("respecte le délai après épuisement des secours et reprend une seule fois", async () => {
    config(); const fetch = vi.fn().mockResolvedValueOnce(quota()).mockResolvedValueOnce(quota("4")).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    expect((await appelerLLM(options)).texte).toContain("séance est C");
    expect(attendre).toHaveBeenCalledTimes(1);
    expect(Number(vi.mocked(attendre).mock.calls[0]?.[0])).toBeGreaterThan(1500);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("ne boucle pas si le quota reste épuisé", async () => {
    config(); vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => quota()));
    await expect(appelerLLM(options)).rejects.toMatchObject({ statut: 429 });
    expect(attendre).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("ne garde pas la requête ouverte pour un quota de longue durée", async () => {
    config(); vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => quota("3600")));
    await expect(appelerLLM(options)).rejects.toMatchObject({ statut: 429 });
    expect(attendre).not.toHaveBeenCalled();
  });
});
