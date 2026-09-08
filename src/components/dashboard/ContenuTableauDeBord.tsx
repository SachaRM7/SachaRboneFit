"use client";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionsCoach } from "./ActionsCoach";
import { Button } from "@/components/ui/button";
import { FeuBiologique } from "@/components/ui/FeuBiologique";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  ArrowUpRight,
  Activity,
  Play,
  HeartPulse,
  Scale,
  TimerReset,
} from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { EtatDuJour } from "@/lib/engine/etat-du-jour";
import { CarteAujourdhui } from "@/components/dashboard/CarteAujourdhui";

interface DonneesEssentielles {
  user: { nom: string; poidsActuel: number | null };
  etat: EtatDuJour;
  feuJour: "vert" | "orange" | "rouge" | null;
  feuTendance: "vert" | "orange" | "rouge" | null;
  poids30jours: Array<{ date: string; poids: number }>;
}

/**
 * L'accueil, avec ce qui décide de la journée.
 *
 * Cet écran attendait TOUT avant de s'afficher : les alertes, le programme,
 * les débriefs, l'historique — une trentaine de requêtes sérialisées, dont
 * aucune ne change ce que l'utilisateur va faire dans la minute qui suit.
 *
 * Il ne reçoit plus que l'essentiel, et deux emplacements. `carteProgramme` et
 * `complement` sont rendus par le serveur et passés en `props` : un composant
 * client peut recevoir des nœuds serveur, et c'est ce qui permet de streamer
 * le reste sans transformer cet écran en une grappe de requêtes navigateur.
 * Le composant reste client pour de vraies raisons — le store de séance, la
 * feuille d'abandon, la détection de séance périmée.
 */
export function ContenuTableauDeBord({
  data,
  carteProgramme,
  complement,
}: {
  data: DonneesEssentielles;
  carteProgramme?: ReactNode;
  complement?: ReactNode;
}) {
  const router = useRouter();
  const { active, clear } = useSessionStore();

  // Detect stale session (>6h). Date.now() ne doit pas etre appele pendant le rendu :
  // le resultat depend de l'horloge, donc le rendu ne serait pas deterministe.
  const [isSessionStale, setIsSessionStale] = useState(false);
  useEffect(() => {
    if (!active?.startedAt) return;
    const startedAt = active.startedAt;
    const check = () =>
      setIsSessionStale(Date.now() - startedAt > 6 * 60 * 60 * 1000);
    // Premiere evaluation differee : un setState synchrone dans l'effet declenche
    // un rendu en cascade.
    const premier = setTimeout(check, 0);
    const id = setInterval(check, 60_000);
    return () => {
      clearTimeout(premier);
      clearInterval(id);
    };
  }, [active?.startedAt]);
  const canResume = active && !active.completedAt && !isSessionStale;

  const handleResume = () => {
    if (active?.seanceTemplateId) {
      router.push(`/sessions/new/${active.seanceTemplateId}`);
    }
  };

  /**
   * Abandonner la séance en cours.
   *
   * Le geste ne faisait qu'un `clear()` du store : la ligne `session_logs`
   * restait ouverte en base, et « Séance en cours — 0 séries » revenait au
   * rechargement suivant. Chaque nouvelle tentative en créait une de plus.
   *
   * `window.confirm` est en outre ignoré dans une application installée depuis
   * l'écran d'accueil sur iOS : le bouton recevait le tap, la fenêtre
   * n'apparaissait jamais, et rien ne se produisait. La confirmation passe par
   * la même feuille que partout ailleurs.
   */
  const [abandonEnCours, setAbandonEnCours] = useState(false);
  const [confirmationAbandon, setConfirmationAbandon] = useState(false);

  const handleAbandon = async () => {
    setAbandonEnCours(true);
    try {
      const res = await fetch("/api/sessions/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionLogId: active?.id }),
      });
      const corps = await res.json().catch(() => null);
      if (!res.ok) throw new Error(corps?.error ?? "Abandon impossible");
      clear();
      setConfirmationAbandon(false);
      toast.success("Séance abandonnée");
      router.refresh();
    } catch (e) {
      // Un échec se dit. Un bouton qui semble mort est le pire des deux.
      toast.error(e instanceof Error ? e.message : "Abandon impossible");
    } finally {
      setAbandonEnCours(false);
    }
  };

  // Weight sparkline data
  const weightData =
    data.poids30jours
      .slice()
      .reverse()
      .map((bw) => bw.poids) || [];

  return (
    <div className="dashboard-v2">
      <DeclarerContexte ecran="accueil" />
      <header className="page-intro">
        <div>
          <p className="eyebrow">Ton rendez-vous avec toi</p>
          <h1>
            Salut {data.user.nom ?? "Sacha"}
            <span className="greeting-dot">.</span>
          </h1>
          <p className="page-subtitle">Chaque séance construit la suite.</p>
        </div>
        <Link href="/historique" className="intro-link">
          Mon historique <ArrowUpRight size={16} aria-hidden />
        </Link>
      </header>
      <div className="dashboard-primary">
        <div className="dashboard-action">
          {canResume && (
            <section className="resume-panel">
              <div className="resume-icon">
                <Play size={24} aria-hidden />
              </div>
              <p className="eyebrow">C’est parti</p>
              <h2>On reprend ?</h2>
              <p>
                {active.sets.filter((s) => s.validatedAt).length} séries
                enregistrées. Ta séance t’attend.
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <Button onClick={handleResume}>
                  Reprendre ma séance <Play size={16} aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmationAbandon(true)}
                >
                  Abandonner
                </Button>
              </div>
            </section>
          )}
          {data.etat && !canResume && <CarteAujourdhui etat={data.etat} />}
          {active && isSessionStale && (
            <section className="stale-session">
              <TimerReset size={21} aria-hidden />
              <div>
                <h2>Séance à clôturer</h2>
                <p>En pause depuis plus de 6 h.</p>
              </div>
              <div className="stale-actions">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (active.seanceTemplateId)
                      router.push(
                        `/sessions/new/${active.seanceTemplateId}/finish`,
                      );
                  }}
                >
                  Clôturer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmationAbandon(true)}
                >
                  Abandonner
                </Button>
              </div>
            </section>
          )}
        </div>
        <aside className="dashboard-side">
          {carteProgramme}
          <ActionsCoach />
        </aside>
      </div>
      <section className="readiness-section" aria-labelledby="readiness-title">
        <div className="section-heading">
          <h2 id="readiness-title">Tes repères</h2>
          <span>À l’écoute de ton rythme</span>
        </div>
        <div className="readiness-grid">
          <div className="metric-tile">
            <span className="metric-icon">
              <HeartPulse size={20} aria-hidden />
            </span>
            <p>Aujourd’hui</p>
            <div className="metric-value">
              {data.feuJour ? (
                <FeuBiologique feu={data.feuJour} size="lg" />
              ) : (
                <span className="metric-empty">À renseigner</span>
              )}
            </div>
            <span className="metric-caption">Ton état avant la séance</span>
          </div>
          <div className="metric-tile">
            <span className="metric-icon">
              <Activity size={20} aria-hidden />
            </span>
            <p>Tendance</p>
            <div className="metric-value">
              {data.feuTendance ? (
                <FeuBiologique feu={data.feuTendance} size="lg" />
              ) : (
                <span className="metric-empty">À découvrir</span>
              )}
            </div>
            <span className="metric-caption">Tes derniers ressentis</span>
          </div>
          <Link href="/bodyweight" className="metric-tile weight-tile">
            <span className="metric-icon">
              <Scale size={20} aria-hidden />
            </span>
            <p>
              Poids de corps <ArrowUpRight size={14} aria-hidden />
            </p>
            <div className="metric-value">
              {data.user.poidsActuel != null ? (
                <span className="metric-number">
                  {data.user.poidsActuel}
                  <small> kg</small>
                </span>
              ) : (
                <span className="metric-empty">Ajouter une mesure</span>
              )}
              {weightData.length >= 2 && (
                <Sparkline data={weightData} width={80} height={28} />
              )}
            </div>
            <span className="metric-caption">Voir l’évolution</span>
          </Link>
        </div>
      </section>
      <div className="dashboard-insights">{complement}</div>
      <Dialog open={confirmationAbandon} onOpenChange={setConfirmationAbandon}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abandonner la séance en cours ?</DialogTitle>
            <DialogDescription>
              Ton programme, ton bloc et le matériel de ta salle ne changent
              pas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmationAbandon(false)}
              disabled={abandonEnCours}
            >
              Continuer la séance
            </Button>
            <Button
              variant="destructive"
              onClick={handleAbandon}
              disabled={abandonEnCours}
            >
              {abandonEnCours ? "Abandon…" : "Abandonner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
