"use client";
import { DeclarerContexte, useCoach } from "@/components/coach/ContexteCoach";
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
import { DetailsAccueil } from "./DetailsAccueil";
import { Button } from "@/components/ui/button";
import { FeuBiologique } from "@/components/ui/FeuBiologique";
import { Sparkline } from "@/components/ui/Sparkline";
import {
  ArrowUpRight,
  Play,
  HeartPulse,
  ChevronRight,
  Scale,
  TimerReset,
} from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { EtatDuJour } from "@/lib/engine/etat-du-jour";
import { CarteAujourdhui } from "@/components/dashboard/CarteAujourdhui";
import { MascotteCoach } from "@/components/coach/MascotteCoach";
import { mascotteDeLAccueil } from "@/lib/coach/accueil-mascotte";

interface DonneesEssentielles {
  user: { nom: string; poidsActuel: number | null };
  etat: EtatDuJour;
  feuJour: "vert" | "orange" | "rouge" | null;
  feuTendance: "vert" | "orange" | "rouge" | null;
  poids30jours: Array<{ date: string; poids: number }>;
}

/**
 * L'action essentielle arrive d'abord. Les trois emplacements serveur sont
 * streamés sans ajouter de requêtes navigateur ni de calcul métier au client.
 * Le store conserve les parcours de reprise, de clôture et d'abandon.
 */
export function ContenuTableauDeBord({
  data,
  carteProgramme,
  complement,
  recuperation,
}: {
  data: DonneesEssentielles;
  carteProgramme?: ReactNode;
  complement?: ReactNode;
  recuperation?: ReactNode;
}) {
  const router = useRouter();
  const { ouvrir } = useCoach();
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

  /** Ce que l'abandon effacerait — le brouillon le sait déjà. */
  const seriesEnregistrees = active?.sets?.length ?? 0;

  const handleAbandon = async () => {
    setAbandonEnCours(true);
    try {
      const res = await fetch("/api/sessions/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /*
         * Le consentement voyage avec la demande.
         *
         * La feuille de confirmation nomme les séries qui partiront ; c'est
         * elle qui recueille l'accord, et le serveur refuse tant qu'il ne l'a
         * pas reçu. Sans ce drapeau, abandonner devenait impossible dès la
         * première série validée — c'est-à-dire dès qu'on en avait besoin.
         */
        body: JSON.stringify({
          sessionLogId: active?.id,
          supprimerLesSeries: true,
        }),
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

  // Un seul état visuel, issu des résolveurs existants.
  const mascotteDuJour = mascotteDeLAccueil({
    etat: data.etat.etat,
    feuJour: data.feuJour,
  });

  // Weight sparkline data
  const weightData =
    data.poids30jours
      .slice()
      .reverse()
      .map((bw) => bw.poids) || [];

  const messageCoach = canResume ? "Ta séance t’attend."
    : data.feuJour === "rouge" ? "La récupération passe en premier."
    : data.etat.etat === "deja_entraine" ? "Ta séance est enregistrée."
    : data.etat.etat === "semaine_complete" ? "Ton objectif de la semaine est atteint."
    : data.feuJour === "orange" ? "Ton état du jour demande de l’attention."
    : data.etat.etat === "sans_salle" || data.etat.etat === "salle_vide" ? "Préparons ton lieu d’entraînement."
    : data.etat.etat === "calibration" ? "On construit tes premiers repères."
    : data.feuJour === "vert" ? "Tu es prêt pour ta séance."
    : "On fait le point avant de commencer.";
  const forme = data.feuJour ? { vert: "Favorable", orange: "À adapter", rouge: "Récupérer" }[data.feuJour] : "À renseigner";

  return (
    <div className="home-coach">
      <DeclarerContexte ecran="accueil" />
      <header className="home-greeting">
        <div>
          <h1>Salut{data.user.nom?.trim() ? ` ${data.user.nom.trim()}` : ""}<span>.</span></h1>
          <button className="home-coach-message" onClick={() => ouvrir()}>
            {messageCoach}<ChevronRight size={14} aria-hidden />
          </button>
        </div>
        {(canResume || mascotteDuJour) && (
          <button className="home-mascot" aria-label="Demander au coach" onClick={() => ouvrir()}>
            <MascotteCoach etat={canResume ? "training" : mascotteDuJour!} taille="normal" presence="normale" anime />
          </button>
        )}
      </header>

      {canResume && (
        <section className="home-session" aria-labelledby="session-en-cours">
          <p className="home-eyebrow">Séance en cours</p>
          <h2 id="session-en-cours">On reprend ?</h2>
          <p className="home-session-meta">{active.sets.filter((s) => s.validatedAt).length} séries enregistrées</p>
          <Button className="home-start" onClick={handleResume}>Reprendre ma séance <Play size={18} aria-hidden /></Button>
          <button className="home-session-secondary" onClick={() => setConfirmationAbandon(true)}>Abandonner</button>
        </section>
      )}
      {!canResume && (
        <CarteAujourdhui etat={data.etat} />
      )}
      {active && isSessionStale && (
        <section className="stale-session">
          <TimerReset size={21} aria-hidden />
          <div><h2>Séance à clôturer</h2><p>En pause depuis plus de 6 h.</p></div>
          <div className="stale-actions">
            <Button size="sm" variant="outline" onClick={() => {
              if (active.seanceTemplateId) router.push(`/sessions/new/${active.seanceTemplateId}/finish`);
            }}>Clôturer</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmationAbandon(true)}>Abandonner</Button>
          </div>
        </section>
      )}

      <section className="home-today" aria-labelledby="home-today-title">
        <h2 className="home-section-title" id="home-today-title">Aujourd’hui</h2>
        <div className="home-metrics">
          {recuperation}
          <DetailsAccueil titre="Ta forme et ta tendance" className="home-metric" apercu={<>
            <span className="home-metric-label"><HeartPulse size={18} aria-hidden /> Forme</span>{" "}
            <strong data-attention={data.feuJour === "orange" || data.feuJour === "rouge"}>{forme}</strong>
            <ChevronRight className="home-metric-arrow" size={14} aria-hidden />
          </>}>
            <div className="home-detail-row"><h3>Aujourd’hui</h3>{data.feuJour ? <FeuBiologique feu={data.feuJour} label={forme} /> : <p>Ton état sera renseigné pendant la préparation de séance.</p>}</div>
            <div className="home-detail-row"><h3>Tendance</h3>{data.feuTendance ? <FeuBiologique feu={data.feuTendance} /> : <p>Pas encore de tendance disponible.</p>}</div>
            <ActionsCoach />
          </DetailsAccueil>
          <DetailsAccueil titre="Ton poids" className="home-metric" apercu={<>
            <span className="home-metric-label"><Scale size={18} aria-hidden /> Poids</span>{" "}
            <strong>{data.user.poidsActuel != null ? `${data.user.poidsActuel.toLocaleString("fr-FR")} kg` : "Ajouter"}</strong>
            <ChevronRight className="home-metric-arrow" size={14} aria-hidden />
          </>}>
            <p>{data.user.poidsActuel != null ? `Dernier poids : ${data.user.poidsActuel.toLocaleString("fr-FR")} kg` : "Pas encore de poids enregistré."}</p>
            {weightData.length >= 2 && <div className="home-weight-history"><Sparkline data={weightData} width={260} height={70} /><p>Évolution sur les 30 derniers jours</p></div>}
            <Link className="context-link" href="/bodyweight" prefetch={false}>Pesées et historique <ArrowUpRight size={16} aria-hidden /></Link>
          </DetailsAccueil>
        </div>
      </section>
      {complement}
      <nav className="home-explore" aria-label="Explorer ton suivi">
        <DetailsAccueil titre="Ton programme" className="home-text-link" apercu={<>Programme <ArrowUpRight size={15} aria-hidden /></>}>
          {carteProgramme}
          <Link className="context-link" href="/programme" prefetch={false}>Ouvrir mon programme <ArrowUpRight size={16} aria-hidden /></Link>
        </DetailsAccueil>
        <Link href="/progression" prefetch={false}>Progrès <ArrowUpRight size={15} aria-hidden /></Link>
        <Link href="/historique" prefetch={false}>Historique <ArrowUpRight size={15} aria-hidden /></Link>
      </nav>
      <Dialog open={confirmationAbandon} onOpenChange={setConfirmationAbandon}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abandonner la séance en cours ?</DialogTitle>
            <DialogDescription>
              {/* Ce qui part est nommé, et compté. Un « es-tu sûr ? » qui ne dit
                  pas ce qu'il efface ne fait pas consentir, il fait cliquer. */}
              {seriesEnregistrees > 0 ? (
                <>
                  <strong>
                    {seriesEnregistrees} série
                    {seriesEnregistrees > 1 ? "s" : ""} déjà enregistrée
                    {seriesEnregistrees > 1 ? "s" : ""}
                  </strong>{" "}
                  {seriesEnregistrees > 1 ? "seront perdues" : "sera perdue"}.
                  Pour les garder, termine la séance plutôt que de l&apos;abandonner.
                  <br />
                </>
              ) : null}
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
