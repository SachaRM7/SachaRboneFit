import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({ live: false, pending: false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/coach/ContexteCoach", () => ({
  useCoach: () => ({ contexte: etat.live ? { ecran: "seance" } : null }),
}));
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean | null }) =>
    <a {...props} data-prefetch={prefetch === false ? "non" : prefetch === true ? "complet" : "partiel"} />,
  useLinkStatus: () => ({ pending: etat.pending }),
}));
import { BottomNav } from "@/components/layout/BottomNav";

beforeEach(() => { etat.live = false; etat.pending = false; });

it("ne prépare que les autres onglets, sans préchargement complet ni liens secondaires", () => {
  const { container } = render(<BottomNav />);
  const precharges = [...container.querySelectorAll('a[data-prefetch="partiel"]')];
  expect(precharges.map((a) => a.getAttribute("href")))
    .toEqual(["/sessions/new", "/progression", "/settings"]);
  expect(container.querySelector('[data-prefetch="complet"]')).toBeNull();
  expect(screen.getByRole("link", { name: "Mon programme" })).toHaveAttribute("data-prefetch", "non");
});

it("ne précharge aucun onglet pendant une séance", () => {
  etat.live = true;
  const { container } = render(<BottomNav />);
  expect(container.querySelector('[data-prefetch="partiel"]')).toBeNull();
});

it("annonce l'attente sans déplacer l'indicateur de la page active", () => {
  etat.pending = true;
  const { rerender } = render(<BottomNav />);
  expect(screen.getByText("Ouverture de Séances…")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Aujourd’hui/ })).toHaveAttribute("aria-current", "page");
  etat.pending = false;
  rerender(<BottomNav />);
  expect(screen.queryByText("Ouverture de Séances…")).toBeNull();
});
