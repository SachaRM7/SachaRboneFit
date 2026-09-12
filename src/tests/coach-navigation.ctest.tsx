import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BottomNav } from "@/components/layout/BottomNav";
import { FournisseurCoach } from "@/components/coach/ContexteCoach";
const navigation = vi.hoisted(() => ({ pathname: "/coach" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
beforeEach(() => { navigation.pathname = "/coach"; });
it("la destination Coach laisse le composer libre de navigation superposée", () => {
  render(<FournisseurCoach><BottomNav /></FournisseurCoach>);
  expect(screen.queryByRole("navigation", { name: "Navigation principale" })).not.toBeInTheDocument();
});
it("la navigation des autres écrans reste disponible", () => {
  navigation.pathname = "/dashboard";
  render(<FournisseurCoach><BottomNav /></FournisseurCoach>);
  expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute("aria-current", "page");
});
