import { afterEach, describe, expect, it, vi } from "vitest";
import { setTimeout as attendre } from "node:timers/promises";
import { appelerLLM } from "./llm-client";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const ok = () => Response.json({ choices: [{ message: { content: "Ta prochaine séance est C." } }] });
const quota = (delai = "2") => new Response("Quota atteint", { status: 429, headers: { "retry-after": delai } });
const options = { messages: [{ role: "user" as const, content: "Mon programme ?" }], system: "Coach" };
function config() {
  vi.stubEnv("GROQ_API_KEY", "test");
  vi.stubEnv("LLM_CHAINE_COURANTE", "groq:principal,groq:secours");
}

describe("quota du coach", () => {
  it("essaie le secours avant d'attendre", async () => {
    config(); const fetch = vi.fn().mockResolvedValueOnce(quota()).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetch);
    expect((await appelerLLM(options)).modeleUtilise).toBe("groq:secours");
    expect(attendre).not.toHaveBeenCalled();
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
