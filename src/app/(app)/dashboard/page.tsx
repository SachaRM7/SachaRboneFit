"use client";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";
import { messageErreur } from "@/lib/messages";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeuBiologique } from "@/components/ui/FeuBiologique";
import { Sparkline } from "@/components/ui/Sparkline";
import { Calendar, Dumbbell, Activity, TrendingDown, Play, ChevronRight } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { Alert } from "@/lib/engine/alerts";
import type { EtatDuJour } from "@/lib/engine/etat-du-jour";
import { CarteAujourdhui } from "@/components/dashboard/CarteAujourdhui";
import { AlertList } from "@/components/alerts/AlertList";

interface DashboardData {
  user: { nom: string; poidsActuel: number | null };
  blocActif: {
    nom: string;
    libelleCycle: string;
    semaine: number;
    semainesTotal: number | null;
    enCalibration: boolean;
    seancesFaites: number;
    seancesDeLaSemaine: number;
  } | null;
  etat: EtatDuJour;
  feuJour: "vert" | "orange" | "rouge" | null;
  feuTendance: "vert" | "orange" | "rouge" | null;
  alertesPreSeance: Alert[];
  poids30jours: Array<{ date: string; poids: number }>;
  precalcSession: { contenu: string } | null;
  weeklyDebrief: { contenu: string; weekStart: string } | null;
  recentSessions: Array<{
    id: string;
    date: string;
    dureeMinutes: number | null;
    energieFin: number | null;
    templateNom: string | null;
    templateLettre: string | null;
    gymNom: string | null;
  }>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { active, clear } = useSessionStore();

  // Le chargement n'avait aucun `catch` : une API en erreur laissait `data` a
  // null, et la page rendait ses cartes vides sans rien dire — impossible de
  // distinguer « pas de donnees » de « la requete a echoue ». Pire, une reponse
  // d'erreur ({ error }) faisait planter le rendu sur `data.user.nom`.
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const reponse = await fetch("/api/dashboard");
        const corps = await reponse.json().catch(() => null);
        if (annule) return;
        if (!reponse.ok || !corps || typeof corps.etat === "undefined") {
          setErreur(messageErreur("charger ton accueil", corps?.error, reponse.status));
        } else {
          setData(corps);
        }
      } catch (cause) {
        if (!annule) setErreur(cause instanceof Error ? cause.message : "Requête impossible");
      } finally {
        if (!annule) setLoading(false);
      }
    })();
    return () => { annule = true; };
  }, []);

  // Detect stale session (>6h). Date.now() ne doit pas etre appele pendant le rendu :
  // le resultat depend de l'horloge, donc le rendu ne serait pas deterministe.
  const [isSessionStale, setIsSessionStale] = useState(false);
  useEffect(() => {
    if (!active?.startedAt) return;
    const startedAt = active.startedAt;
    const check = () => setIsSessionStale(Date.now() - startedAt > 6 * 60 * 60 * 1000);
    // Premiere evaluation differee : un setState synchrone dans l'effet declenche
    // un rendu en cascade.
    const premier = setTimeout(check, 0);
    const id = setInterval(check, 60_000);
    return () => { clearTimeout(premier); clearInterval(id); };
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
  const weightData = data?.poids30jours?.slice().reverse().map(bw => bw.poids) || [];

  return (
    <div className="min-h-screen bg-papier text-encre">
      <DeclarerContexte ecran="accueil" />
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Salut {data?.user.nom ?? "Sacha"}</h1>
        <div className="flex items-center gap-3 mt-1">
          {data?.user.poidsActuel && (
            <p className="text-encre-2 text-sm">{data.user.poidsActuel} kg</p>
          )}
          {weightData.length >= 2 && (
            <Sparkline data={weightData} width={60} height={20} />
          )}
        </div>
      </div>

      {/* Le programme n'a pas d'onglet — c'est une décision assumée : ce n'est
          pas une destination quotidienne. Mais il ne doit pas être à deux
          gestes pour autant. Toute la carte est le lien : un second gros bouton
          entrerait en concurrence avec celui de la séance du jour. */}
      {data?.blocActif && (
        <div className="px-4 pb-2">
          <Link
            href="/programme"
            className="flex items-center gap-3 rounded-xl border border-filet bg-carte px-4 py-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-encre text-sm font-medium truncate">
                {data.blocActif.libelleCycle}
              </span>
              <span className="block text-encre-3 text-xs mt-0.5">
                {data.blocActif.enCalibration ? (
                  <>
                    <span className="chiffres">{data.blocActif.seancesFaites}</span> séance
                    {data.blocActif.seancesFaites > 1 ? "s" : ""} mesurée
                    {data.blocActif.seancesFaites > 1 ? "s" : ""}
                  </>
                ) : (
                  <>
                    Semaine <span className="chiffres">{data.blocActif.semaine}</span>
                    {data.blocActif.semainesTotal !== null && (
                      <> sur <span className="chiffres">{data.blocActif.semainesTotal}</span></>
                    )}
                  </>
                )}
                {" · "}
                <span className="chiffres">{data.blocActif.seancesDeLaSemaine}</span> séance
                {data.blocActif.seancesDeLaSemaine > 1 ? "s" : ""} cette semaine
              </span>
            </span>
            <ChevronRight className="w-4 h-4 text-encre-3 shrink-0" aria-hidden />
          </Link>
        </div>
      )}

      <div className="px-4 space-y-4 pb-20">
        {/* Le squelette s'ajoutait aux cartes au lieu de les remplacer : on
            lisait deux blocs vides puis les memes cartes sans valeurs. Pendant
            le chargement, il est seul a l'ecran. */}
        {loading && !erreur ? (
          <div className="space-y-4" aria-busy="true">
            <div className="bg-carte border border-filet rounded-xl h-28 animate-pulse" />
            <div className="bg-carte border border-filet rounded-xl h-24 animate-pulse" />
            <p className="text-encre-3 text-sm text-center">Chargement de ton tableau de bord…</p>
          </div>
        ) : (
        <>
        {erreur && (
          <Card className="bg-perte-fond border-perte/30">
            <CardContent className="py-4 space-y-2">
              <p className="text-perte font-semibold">Le tableau de bord n&apos;a pas pu être chargé</p>
              <p className="chiffres text-encre-2 text-xs break-all">{erreur}</p>
              <Button
                size="sm"
                className="bg-encre text-papier hover:bg-filet"
                onClick={() => window.location.reload()}
              >
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* In-progress session banner */}
        {canResume && (
          <Card className="bg-gain-fond border-gain/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gain font-semibold flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Séance en cours
                  </p>
                  <p className="text-encre-2 text-sm">
                    {active.sets.filter(s => s.validatedAt).length} séries enregistrées
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-gain hover:bg-gain"
                    onClick={handleResume}
                  >
                    Reprendre
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-encre-2 hover:text-encre"
                    onClick={() => setConfirmationAbandon(true)}
                  >
                    Abandonner
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stale session - offer to close or abandon */}
        {active && isSessionStale && (
          <Card className="bg-feu-orange/10 border-feu-orange/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-feu-orange font-semibold">Séance interrompue</p>
                  <p className="text-encre-2 text-sm">
                    Il y a plus de 6h — terminer ou abandonner ?
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-feu-orange hover:bg-feu-orange/90"
                    onClick={() => {
                      if (active.seanceTemplateId) {
                        router.push(`/sessions/new/${active.seanceTemplateId}/finish`);
                      }
                    }}
                  >
                    Clôturer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-encre-2 hover:text-encre"
                    onClick={() => setConfirmationAbandon(true)}
                  >
                    Abandonner
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={confirmationAbandon} onOpenChange={setConfirmationAbandon}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abandonner la séance en cours ?</DialogTitle>
              <DialogDescription>
                Elle ne porte aucune série enregistrée. Ton programme, ton bloc et
                le matériel de ta salle ne changent pas.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmationAbandon(false)}
                disabled={abandonEnCours}>
                Continuer la séance
              </Button>
              <Button variant="destructive" onClick={handleAbandon} disabled={abandonEnCours}>
                {abandonEnCours ? "Abandon…" : "Abandonner"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Aujourd'hui — l'état vient du moteur, cet écran ne fait que le rendre.
            Il ne s'affiche pas pendant une séance en cours : la reprendre est
            alors la seule action qui a du sens. */}
        {data?.etat && !canResume && <CarteAujourdhui etat={data.etat} />}

        {/* Feu biologique */}
        <Card className="bg-carte border-filet">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Feu biologique
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div className="flex items-center gap-3">
                <span className="text-encre-3 text-sm">Aujourd&apos;hui</span>
                {data?.feuJour ? (
                  <FeuBiologique feu={data.feuJour} size="lg" />
                ) : (
                  <span className="text-encre-3 text-sm">À renseigner avant ta séance</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-encre-3 text-sm">Tendance</span>
                {data?.feuTendance ? (
                  <FeuBiologique feu={data.feuTendance} size="lg" />
                ) : (
                  <span className="text-encre-3 text-sm">Pas de données</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alertes — le composant existait mais n'était monté nulle part. */}
        {data?.alertesPreSeance && data.alertesPreSeance.length > 0 && (
          <Card className="bg-carte border-filet">
            <CardHeader>
              <CardTitle className="text-encre-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Alertes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AlertList alerts={data.alertesPreSeance} />
            </CardContent>
          </Card>
        )}

        {/* Precalc session preview */}
        {data?.precalcSession && (
          <Card className="bg-carte border-filet">
            <CardHeader>
              <CardTitle className="text-encre-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Séance de demain
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-encre-2 text-sm whitespace-pre-wrap">{data.precalcSession.contenu}</p>
            </CardContent>
          </Card>
        )}

        {/* Weekly debrief */}
        {data?.weeklyDebrief && (
          <Card className="bg-carte border-filet">
            <CardHeader>
              <CardTitle className="text-encre-2 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Débrief hebdomadaire
              </CardTitle>
            </CardHeader>
            <CardContent>
              <details className="cursor-pointer">
                <summary className="text-encre-2 text-sm font-medium">
                  Semaine du {data.weeklyDebrief.weekStart}
                </summary>
                <p className="text-encre-2 text-sm mt-2 whitespace-pre-wrap">
                  {data.weeklyDebrief.contenu}
                </p>
              </details>
            </CardContent>
          </Card>
        )}

        {/* Dernieres seances */}
        {data?.recentSessions && data.recentSessions.length > 0 && (
          <Card className="bg-carte border-filet">
            <CardHeader>
              <CardTitle className="text-encre-2 flex items-center gap-2">
                <Dumbbell className="w-4 h-4" />
                Séances récentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/sessions/${s.id}?templateLettre=${encodeURIComponent(s.templateLettre || "")}&sessionDate=${encodeURIComponent(s.date)}`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-papier-2 hover:bg-papier-2 transition-colors text-left"
                >
                  <div>
                    <p className="text-encre font-medium text-sm">
                      {s.templateNom || "Séance libre"}
                      {s.templateLettre && <span className="text-encre-3 ml-1">({s.templateLettre})</span>}
                    </p>
                    <p className="text-encre-3 text-xs">
                      {s.date}
                      {s.gymNom && ` — ${s.gymNom}`}
                    </p>
                  </div>
                  <div className="text-right">
                    {s.dureeMinutes && <p className="text-encre-2 text-sm">{s.dureeMinutes} min</p>}
                    {s.energieFin && <p className="text-encre-3 text-xs">Énergie {s.energieFin}/10</p>}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}
        </>
        )}
      </div>
    </div>
  );
}
