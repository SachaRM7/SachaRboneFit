import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReponseCoach } from "@/components/coach/ReponseCoach";

describe("réponses Coach compatibles", () => {
  it("rend titres, gras, listes, tableau, liens et sauts de ligne", () => {
    const { container } = render(<ReponseCoach texte={'## Conclusion\n**Trois répétitions**\nPuis récupère.\n\n- Un\n- Deux\n\n| Charge | Reps |\n| --- | --- |\n| 12 | 8 |\n\n[Programme](/programme)'} />);
    expect(screen.getByRole("heading", { name: "Conclusion" })).toBeVisible();
    expect(container.querySelector("strong")).toHaveTextContent("Trois répétitions");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("link", { name: "Programme" })).toHaveAttribute("href", "/programme");
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.textContent).not.toContain("##");
    expect(container.textContent).not.toContain("**");
  });
  it("conserve le texte des anciennes conversations sans troncature", () => {
    const texte = "Ancienne réponse. ".repeat(500) + "Dernière recommandation.";
    render(<ReponseCoach texte={texte} />);
    expect(screen.getByText(/Dernière recommandation/)).toHaveTextContent(texte.trim());
  });
  it("refuse HTML exécutable et liens javascript", () => {
    const { container } = render(<ReponseCoach texte={'<script>alert(1)</script>\n\n[x](javascript:alert%281%29)'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
