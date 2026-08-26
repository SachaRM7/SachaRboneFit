"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeuBiologique } from "@/components/ui/FeuBiologique";
import { Sparkline } from "@/components/ui/Sparkline";
import { Calendar, Dumbbell, Activity, TrendingDown, Play } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import type { Alert } from "@/lib/engine/alerts";

interface DashboardData {
  user: { nom: string; poidsActuel: number | null };
  blocActif: { nom: string; typeCycle: string; semaineActuelle: number } | null;
  prochaineSeance: { lettre: string; templateId: string; templateNom: string };
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

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
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

  const handleStart = () => {
    const today = new Date().toISOString().slice(0, 10);
    const gymId = "";
    router.push(`/session/daily-state?date=${today}&gymId=${gymId}`);
  };

  const handleResume = () => {
    if (active?.seanceTemplateId) {
      router.push(`/sessions/new/${active.seanceTemplateId}`);
    }
  };

  const handleAbandon = () => {
    if (confirm("Abandonner la séance en cours ? Toutes les données non enregistrées seront perdues.")) {
      clear();
    }
  };

  // Weight sparkline data
  const weightData = data?.poids30jours?.slice().reverse().map(bw => bw.poids) || [];

  return (
    <div className="min-h-screen bg-papier text-encre">
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
        {data?.blocActif && (
          <p className="text-encre-3 text-xs mt-1">
            {data.blocActif.nom} — {data.blocActif.typeCycle} — Semaine{" "}
            {data.blocActif.semaineActuelle}
          </p>
        )}
      </div>

      <div className="px-4 space-y-4 pb-20">
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
                    onClick={handleAbandon}
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
                    onClick={handleAbandon}
                  >
                    Abandonner
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prochaine seance */}
        <Card className="bg-carte border-filet">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Prochaine seance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-encre">
                  Seance {data?.prochaineSeance.lettre}
                </p>
                <p className="text-encre-3 text-sm">
                  {data?.prochaineSeance.templateNom}
                </p>
              </div>
              <Button onClick={handleStart} className="bg-encre text-papier hover:bg-filet">
                Demarrer
              </Button>
            </div>
          </CardContent>
        </Card>

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
                  <span className="text-encre-3 text-sm">Non renseigne</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-encre-3 text-sm">Tendance</span>
                {data?.feuTendance ? (
                  <FeuBiologique feu={data.feuTendance} size="lg" />
                ) : (
                  <span className="text-encre-3 text-sm">Pas de donnees</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alertes */}
        {data?.alertesPreSeance && data.alertesPreSeance.length > 0 && (
          <Card className="bg-carte border-filet">
            <CardHeader>
              <CardTitle className="text-encre-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Alertes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.alertesPreSeance.slice(0, 3).map((alert: Alert, i: number) => (
                <div key={i} className="text-sm text-feu-orange border-l-2 border-feu-orange pl-3">
                  {alert.message}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Precalc session preview */}
        {data?.precalcSession && (
          <Card className="bg-carte border-filet">
            <CardHeader>
              <CardTitle className="text-encre-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Seance de demain
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
                Debrief hebdomadaire
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
                Seances recentes
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
                      {s.templateNom || "Seance libre"}
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
      </div>
    </div>
  );
}
