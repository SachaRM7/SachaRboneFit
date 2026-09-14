"use client";
import Link from "next/link";
import { Fragment } from "react";
import { usePathname } from "next/navigation";
import {
  House,
  Dumbbell,
  ChartNoAxesCombined,
  SlidersHorizontal,
  CalendarRange,
  BookOpen,
  MapPin,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { useCoach } from "@/components/coach/ContexteCoach";

const ONGLETS = [
  { href: "/dashboard", label: "Aujourd’hui", icon: House },
  { href: "/sessions/new", label: "Séances", icon: Dumbbell },
  { href: "/progression", label: "Progrès", icon: ChartNoAxesCombined },
  { href: "/settings", label: "Mon espace", icon: SlidersHorizontal },
];
const EXPLORER = [
  { href: "/programme", label: "Mon programme", icon: CalendarRange },
  { href: "/exercises", label: "Les exercices", icon: BookOpen },
  { href: "/gyms", label: "Mes salles", icon: MapPin },
];
const RATTACHEMENTS: Record<string, string> = {
  "/exercises": "/settings",
  "/gyms": "/settings",
  "/profil": "/settings",
  "/historique": "/settings",
  "/programme": "/settings",
  "/bodyweight": "/settings",
  "/contraintes": "/settings",
  "/session": "/sessions/new",
};
export function BottomNav() {
  const chemin = usePathname();
  const { contexte } = useCoach();
  const enSeance = contexte?.ecran === "seance";
  const rattachement = Object.entries(RATTACHEMENTS).find(([prefixe]) =>
    chemin.startsWith(prefixe),
  )?.[1];
  const actif = (href: string) =>
    rattachement ? href === rattachement : chemin.startsWith(href);
  if (chemin === "/coach") return null;
  return (
    <nav
      aria-label="Navigation principale"
      className={`app-nav ${enSeance ? "is-live" : ""}`}
      style={{ height: "var(--barre-nav)", paddingBottom: "var(--marge-bas)" }}
    >
      <Link href="/dashboard" prefetch={false} className="sidebar-brand wordmark">
        <span className="brand-symbol">
          <Activity size={20} aria-hidden />
        </span>
        sport<span className="wordmark-light">perso</span>
      </Link>
      <p className="sidebar-caption">TON ENTRAÎNEMENT</p>
      <div className="nav-items" style={{ minHeight: "var(--rangee-nav)" }}>
        {ONGLETS.map(({ href, label, icon: Icone }, i) => (
          <Fragment key={href}>
            {i === 2 && !enSeance && (
              <span className="coach-nav-space" aria-hidden />
            )}
            <Link
              href={href}
              prefetch={false}
              aria-current={actif(href) ? "page" : undefined}
              className="nav-item"
            >
              <Icone size={21} strokeWidth={1.8} aria-hidden />
              <span>{label}</span>
              <span className="nav-active-dot" />
            </Link>
          </Fragment>
        ))}
      </div>
      <div className="sidebar-explore">
        <p className="sidebar-caption">EXPLORER</p>
        {EXPLORER.map(({ href, label, icon: Icone }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className="nav-item"
            aria-current={chemin.startsWith(href) ? "page" : undefined}
          >
            <Icone size={19} aria-hidden />
            <span>{label}</span>
            <ArrowUpRight size={13} className="ml-auto" aria-hidden />
          </Link>
        ))}
      </div>
      <p className="sidebar-motto">
        Un peu plus fort.
        <br />
        <span>À ta façon.</span>
      </p>
    </nav>
  );
}
