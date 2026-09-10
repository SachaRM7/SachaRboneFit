"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, UserRound, Activity } from "lucide-react";

export function AppTopbar() {
  const chemin = usePathname();
  const live =
    /^\/sessions\/new\/[^/]+$/.test(chemin) ||
    chemin === "/session/calibration";
  if (live) return null;
  return (
    <header className="app-topbar">
      <Link
        href="/dashboard"
        prefetch={false}
        className="wordmark"
        aria-label="Sport Perso — accueil"
      >
        <span className="brand-symbol">
          <Activity size={19} aria-hidden />
        </span>
        sport<span className="wordmark-light">perso</span>
        <span className="version-tag">02</span>
      </Link>
      <span className="topbar-note">
        L’entraînement qui te ressemble <ArrowUpRight size={14} aria-hidden />
      </span>
      <Link className="profile-shortcut" href="/profil" prefetch={false} aria-label="Mon profil">
        <UserRound size={19} aria-hidden />
      </Link>
    </header>
  );
}
