/** Isolated UI fixtures, using the deployed CSS and assets; never writes a session. */
import "./dom-simule";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { VueFocus } from "@/components/session/VueFocus";
import { EnteteLive } from "@/components/session/EnteteLive";
import { ListeCompacte } from "@/components/session/ListeCompacte";
import { RefreshCw, Zap } from "@/components/ui/icons";
import { avancement } from "@/lib/live/vue-live";
import { useSessionStore } from "@/stores/sessionStore";
import type { ExercicePrescrit } from "@/components/session/types";

async function rendreApresEffets(element: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(element));
  await new Promise((resolve) => setTimeout(resolve, 30));
  flushSync(() => {});
  const html = host.innerHTML;
  root.unmount();
  host.remove();
  if (!html) throw new Error("Fixture render failed.");
  return html;
}

async function main() {
  const origin = process.argv[2];
  if (!origin?.startsWith("https://")) throw new Error("Provide the preview HTTPS origin.");
  const login = process.env.VERCEL_LOGIN_HTML
    ? readFileSync(process.env.VERCEL_LOGIN_HTML, "utf8")
    : await fetch(`${origin}/login`).then((r) => {
      if (new URL(r.url).origin !== origin) throw new Error("Preview is protected: supply the HTML retrieved by vercel curl in VERCEL_LOGIN_HTML.");
      return r.text();
    });
  const styles = [...login.matchAll(/<link[^>]*href="([^"]+\.css(?:\?[^"]*)?)"[^>]*>/g)]
    .map((match) => `<link rel="stylesheet" href="${new URL(match[1]!, origin)}">`).join("\n");
  if (!styles) throw new Error("Preview styles unavailable.");
  const bodyClass = login.match(/<body[^>]*class="([^"]*)"/)?.[1] ?? "";
  const htmlClass = login.match(/<html[^>]*class="([^"]*)"/)?.[1] ?? "";
  const base: ExercicePrescrit = {
    id: "chest", nom: "Lying Machine Chest Press", machineNom: "Chest Press", slug: "machine-chest-press",
    seriesCibles: 2, fourchetteRepsMin: 8, fourchetteRepsMax: 12, rpeCible: 7,
    reposSecondes: 180, tempo: "3-0-1-0", incrementsPossibles: [5], chargeSuggeree: 60,
    musclesPrincipaux: ["pecs"], musclesSecondaires: ["epaule_ant", "triceps"],
    historique: [{ charge: 55, reps: 8 }, { charge: 55, reps: 8 }],
    historiqueSeances: [
      { sessionLogId: "s1", date: "2026-01-27", sets: [1, 2].map((numero) => ({ numero, charge: 55, reps: 8, rpe: 7 })) },
      { sessionLogId: "s2", date: "2026-01-22", sets: [1, 2].map((numero) => ({ numero, charge: 52.5, reps: 10, rpe: 8 })) },
    ],
  };
  const exercices: ExercicePrescrit[] = [
    base,
    { ...base, id: "shoulder", nom: "Standing Military Press Machine", machineNom: "Shoulder Press", slug: "machine-shoulder-press", musclesPrincipaux: ["epaule_ant"], musclesSecondaires: ["triceps", "haut_dos"], historique: [], historiqueSeances: [], premiereCharge: { charge: 40, confiance: "moyenne", origine: "charge_programmee", explication: "Charge programmée", versionModele: "cold-start-v1.0.0" } },
    { ...base, id: "pec", nom: "Pec Deck", machineNom: "Chest Fly", slug: "pec-deck", musclesSecondaires: ["epaule_ant"] },
    { ...base, id: "lateral", nom: "Lateral Raise Machine", machineNom: "Lateral Raise", slug: "machine-lateral-raise", musclesPrincipaux: ["epaules"], musclesSecondaires: [], fourchetteRepsMin: 10, fourchetteRepsMax: 15, reposSecondes: 60, tempo: "2-0-2-0" },
    { ...base, id: "triceps", nom: "Triceps Pushdown (Machine)", machineNom: "Triceps Pushdown", slug: "triceps-pushdown", musclesPrincipaux: ["triceps"], musclesSecondaires: [], seriesCibles: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 15, reposSecondes: 60, tempo: "2-0-2-0" },
    { ...base, id: "biceps", nom: "Biceps Curl Machine", machineNom: "Biceps Curl", slug: "preacher-curl", musclesPrincipaux: ["biceps"], musclesSecondaires: [], seriesCibles: 3, fourchetteRepsMin: 10, fourchetteRepsMax: 15, reposSecondes: 60, tempo: "2-0-2-0" },
  ];
  const noop = () => {};
  mkdirSync("apercus/reference", { recursive: true });
  for (const scene of ["focus", "vide", "liste"] as const) {
    useSessionStore.setState({ active: null });
    useSessionStore.getState().start({ id: "fixture", seanceTemplateId: "fixture", gymId: "fixture" });
    const courant = scene === "focus" ? 0 : 1;
    if (courant === 1) useSessionStore.setState((state) => ({ active: { ...state.active!, sets: [1, 2].map((numeroSerie) => ({ exerciseInstanceId: "chest", numeroSerie, charge: 60, repsEffectuees: 8, rpeEffectif: 7, validatedAt: Date.now() })) } }));
    const etats = avancement(exercices, useSessionStore.getState().active?.sets ?? [], []);
    const content = await rendreApresEffets(<main className="app-main" style={{ paddingTop: "var(--marge-haut)", paddingBottom: "calc(var(--barre-nav) + 5rem)" }}>
      <div className="live-session bg-papier">
        <EnteteLive nom="Push" vue={scene === "liste" ? "liste" : "focus"} courant={courant} etats={etats} etatMascotte="training" demarreeA={Date.now() - 18 * 60_000} onRetour={noop} onAides={noop} onDuree={noop} onTerminer={noop} onVue={noop} />
        <main className="live-session-body">
          {scene === "liste" ? <ListeCompacte exercices={exercices} etats={etats} courant={courant} onChoisir={noop} afficherNote note="" onNote={noop} /> : <VueFocus exercices={exercices} etats={etats} courant={courant} onNaviguer={noop} modeReserve rpeReduction={() => 0} onSerieValidee={noop} actions={() => <button><Zap aria-hidden />Douleur</button>} remplacement={() => <button className="live-replace-trigger"><RefreshCw aria-hidden /></button>} />}
        </main>
      </div>
    </main>);
    writeFileSync(`apercus/reference/${scene}.html`, `<!doctype html><html lang="fr" class="${htmlClass}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${styles}<style>:root{--marge-haut:47px;--marge-bas:34px}body{margin:0}</style></head><body class="${bodyClass}">${content}</body></html>`);
  }
  console.log("3 UI fixtures written to apercus/reference using", origin);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
