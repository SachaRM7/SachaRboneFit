"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { MascotteCoach } from "./MascotteCoach";
import type { MouvementMascotte } from "@/lib/coach/mascotte-motion";

const SITUATIONS = [
  { etat: "ready", titre: "Prêt", message: "Prêt pour ta séance.", detail: "Une respiration discrète, une légère inclinaison." },
  { etat: "repos", titre: "Repos", message: "Souffle. Tu récupères.", detail: "Une respiration lente pour accompagner la récupération." },
  { etat: "encouragement", titre: "Bien joué", message: "Bien joué, Sacha.", detail: "Un petit mouvement de soutien, une seule fois." },
] as const;

const preference = () => window.matchMedia("(prefers-reduced-motion: reduce)");
function suivreReduction(notifier: () => void) {
  const media = preference();
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", notifier);
    return () => media.removeEventListener("change", notifier);
  }
  media.addListener(notifier);
  return () => media.removeListener(notifier);
}
const reductionClient = () => preference().matches;
const reductionServeur = () => false;

/** Les vrais composants de l'application, sans données ni session utilisateur. */
export function ApercuMascotte() {
  const [etat, setEtat] = useState<MouvementMascotte>("ready");
  const [vivante, setVivante] = useState(true);
  const [reprise, setReprise] = useState(0);
  const [presence, setPresence] = useState<"discrete" | "normale" | "forte">("forte");
  const reduction = useSyncExternalStore(suivreReduction, reductionClient, reductionServeur);
  const situation = SITUATIONS.find((s) => s.etat === etat)!;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-filet pb-5">
        <span className="font-semibold text-encre">SachaRbone Fit</span>
        <Link className="text-sm text-encre-2 underline underline-offset-4" href="/dashboard">Ouvrir mon accueil</Link>
      </header>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-encre">Ton coach prend vie.</h1>
      <p className="mt-3 text-sm text-encre-2">Compare la mascotte fixe aux animations de l’application, à leur taille réelle.</p>
      <div role="group" aria-label="Situation de la mascotte" className="mt-7 flex gap-2">
        {SITUATIONS.map((s) => (
          <button
            key={s.etat}
            type="button"
            aria-pressed={etat === s.etat}
            onClick={() => setEtat(s.etat)}
            className={`min-h-11 flex-1 rounded-xl border border-filet px-3 text-sm ${etat === s.etat ? "bg-encre text-papier" : "bg-carte text-encre"}`}
          >{s.titre}</button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[false, true].map((animee) => (
          <figure key={String(animee)} className="min-w-0 rounded-2xl border border-filet bg-carte p-3 sm:p-6" data-comparaison={animee ? "animee" : "fixe"}>
            <figcaption className="text-xs text-encre-2">{animee ? "Avec animation" : "Image fixe"}</figcaption>
            <div className="flex h-52 items-center justify-center">
              <MascotteCoach key={`${etat}-${reprise}`} etat={etat} taille="hero" presence={presence} vivante={animee && vivante} />
            </div>
            <p className="text-sm font-medium text-encre">{situation.message}</p>
          </figure>
        ))}
      </div>
      <p className="mt-4 text-sm text-encre-2">{situation.detail}</p>
      <div className="mt-5 flex flex-wrap items-center gap-5">
        <label className="text-sm text-encre">Taille dans l’app
          <select aria-label="Taille de la mascotte" value={presence} onChange={(e) => setPresence(e.target.value as typeof presence)} className="ml-2 min-h-11 rounded-xl border border-filet bg-carte px-2">
            <option value="discrete">40 px · séance</option>
            <option value="normale">72 px · accueil</option>
            <option value="forte">120 px · coach</option>
          </select>
        </label>
        <button type="button" onClick={() => setReprise((n) => n + 1)} disabled={!vivante || reduction} className="min-h-11 rounded-xl border border-filet bg-carte px-5 text-sm text-encre disabled:opacity-50">Rejouer</button>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-encre">
          <input type="checkbox" checked={vivante && !reduction} disabled={reduction} onChange={(e) => setVivante(e.target.checked)} className="size-4" />
          Activer les animations
        </label>
      </div>
      {reduction && <p role="status" className="mt-4 rounded-xl border border-filet bg-carte p-3 text-sm text-encre">Ton appareil demande de réduire les animations : la mascotte reste fixe. Pour voir le mouvement, désactive ce réglage dans les options d’accessibilité de ton appareil.</p>}
      <p className="mt-6 text-xs text-encre-2">Le réglage « réduire les animations » de ton appareil est toujours respecté. Les yeux et les membres conservent leur dessin d’origine.</p>
    </main>
  );
}
