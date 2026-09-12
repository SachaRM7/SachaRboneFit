import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoachConversation } from "@/components/coach/CoachConversation";
import { FournisseurCoach, ActionsCoachLive } from "@/components/coach/ContexteCoach";
vi.mock("@/components/coach/MascotteCoach", () => ({ MascotteCoach: () => <div aria-label="Mascotte" /> }));
const requetes = vi.fn();
const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status }));
beforeEach(() => {
  requetes.mockReset();
  requetes.mockImplementation((url: string) => {
    if (url === "/api/coach/accueil") return json({ repere: null, suggestions: [{ libelle: "Une série ?", message: "Explique une série." }] });
    if (url.includes("propositions")) return json([]);
    return json([]);
  });
  vi.stubGlobal("fetch", requetes);
});
afterEach(() => vi.unstubAllGlobals());
function monter(contexte: Parameters<typeof CoachConversation>[0]["contexte"] = null) {
  return render(<FournisseurCoach><CoachConversation contexte={contexte} onClose={vi.fn()} /></FournisseurCoach>);
}
describe("conversation Coach", () => {
  it("accueil avec champ libre, sans appel IA automatique ; nouvelle conversation revient à l'accueil", async () => {
    monter();
    expect(screen.getByLabelText("Message au coach")).toBeVisible();
    await screen.findByRole("button", { name: "Une série ?" });
    expect(requetes.mock.calls.some(([url]) => url === "/api/coach/chat")).toBe(false);
    fireEvent.click(screen.getByLabelText("Nouvelle conversation"));
    expect(screen.getByRole("heading", { name: "On en parle." })).toBeVisible();
  });
  it("envoie le contexte réel et rend la réponse Markdown", async () => {
    const contexte = { ecran: "seance" as const, sessionLogId: "11111111-1111-4111-8111-111111111111", numeroSerie: 2 };
    const original = requetes.getMockImplementation()!;
    requetes.mockImplementation((url, options) => url === "/api/coach/chat" ? json({ conversationId: "conv", message: { id: "reponse", content: "**RPE 7 ≈ 3 répétitions en réserve.**" } }) : original(url, options));
    monter(contexte);
    fireEvent.change(screen.getByLabelText("Message au coach"), { target: { value: "RPE 7 ?" } });
    fireEvent.click(screen.getByLabelText("Envoyer le message"));
    expect(await screen.findByText("RPE 7 ≈ 3 répétitions en réserve.")).toBeVisible();
    const appel = requetes.mock.calls.find(([url]) => url === "/api/coach/chat")!;
    expect(JSON.parse(appel[1].body)).toMatchObject({ message: "RPE 7 ?", contexte });
  });
  it("reprend un ancien échange, sans lui attribuer le contexte d'un autre écran", async () => {
    const original = requetes.getMockImplementation()!;
    requetes.mockImplementation((url, options) => {
      if (url === "/api/coach/conversations") return json([{ id: "ancien", title: "Mon ancien échange", lastMessage: { preview: "Mon repère", role: "assistant" }, updatedAt: new Date().toISOString() }]);
      if (url.endsWith("/messages")) return json([{ id: "m1", role: "assistant", content: "Ton ancien repère.", createdAt: new Date().toISOString() }]);
      if (url === "/api/coach/chat") return json({ conversationId: "ancien", message: { id: "m2", content: "Réponse suivante." } });
      return original(url, options);
    });
    monter({ ecran: "programme" });
    fireEvent.click(screen.getByLabelText("Historique des conversations"));
    fireEvent.click(await screen.findByRole("button", { name: /Mon ancien échange/ }));
    expect(await screen.findByText("Ton ancien repère.")).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("Message au coach")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Message au coach"), { target: { value: "Et ensuite ?" } });
    fireEvent.click(screen.getByLabelText("Envoyer le message"));
    await screen.findByText("Réponse suivante.");
    expect(JSON.parse(requetes.mock.calls.find(([url]) => url === "/api/coach/chat")![1].body).contexte).toBeNull();
  });
  it("conserve la question après erreur et réessaie dans la conversation créée", async () => {
    const original = requetes.getMockImplementation()!;
    let appels = 0;
    requetes.mockImplementation((url, options) => url === "/api/coach/chat"
      ? ++appels === 1 ? json({ conversationId: "conv", error: "Indisponible" }, 503) : json({ conversationId: "conv", message: { id: "ok", content: "Réponse retrouvée." } })
      : original(url, options));
    monter();
    fireEvent.change(screen.getByLabelText("Message au coach"), { target: { value: "Ma question" } });
    fireEvent.click(screen.getByLabelText("Envoyer le message"));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Message au coach")).toHaveValue("Ma question");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await screen.findByText("Réponse retrouvée.");
    expect(JSON.parse(requetes.mock.calls.filter(([url]) => url === "/api/coach/chat")[1]![1].body)).toMatchObject({ conversationId: "conv", retry: true, message: "Ma question" });
    expect(screen.getAllByLabelText("Ton message")).toHaveLength(1);
  });
  it("confie douleur et machine occupée aux actions Live existantes", () => {
    const action = vi.fn();
    render(<FournisseurCoach><ActionsCoachLive onAction={action} /><CoachConversation contexte={{ ecran: "seance" }} onClose={vi.fn()} /></FournisseurCoach>);
    fireEvent.click(screen.getByRole("button", { name: "J’ai une gêne" }));
    fireEvent.click(screen.getByRole("button", { name: "Machine occupée" }));
    expect(action.mock.calls).toEqual([["douleur"], ["machine"]]);
  });
});
