"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeuBiologique } from "@/components/ui/FeuBiologique";
import { Sparkline } from "@/components/ui/Sparkline";
import { Calendar, Dumbbell, Activity, TrendingDown, Play } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";

interface DashboardData {
  user: { nom: string; poidsActuel: number | null };
  blocActif: { nom: string; typeCycle: string; semaineActuelle: number } | null;
  prochaineSeance: { lettre: string; templateId: string; templateNom: string };
  feuJour: "vert" | "orange" | "rouge" | null;
  feuTendance: "vert" | "orange" | "rouge" | null;
  alertesPreSeance: any[];
  poids30jours: Array<{ date: string; poids: number }>;
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

  // Detect stale session (>6h)
  const isSessionStale = active && active.startedAt
    ? Date.now() - active.startedAt > 6 * 60 * 60 * 1000
    : false;
  const canResume = active && !active.completedAt && !isSessionStale;

  const handleStart = () => {
    const today = new Date().toISOString().split("T")[0];
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
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Salut {data?.user.nom ?? "Sacha"}</h1>
        <div className="flex items-center gap-3 mt-1">
          {data?.user.poidsActuel && (
            <p className="text-zinc-400 text-sm">{data.user.poidsActuel} kg</p>
          )}
          {weightData.length >= 2 && (
            <Sparkline data={weightData} width={60} height={20} />
          )}
        </div>
        {data?.blocActif && (
          <p className="text-zinc-500 text-xs mt-1">
            {data.blocActif.nom} — {data.blocActif.typeCycle} — Semaine{" "}
            {data.blocActif.semaineActuelle}
          </p>
        )}
      </div>

      <div className="px-4 space-y-4 pb-20">
        {/* In-progress session banner */}
        {canResume && (
          <Card className="bg-green-900/30 border-green-800">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-400 font-semibold flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Séance en cours
                  </p>
                  <p className="text-zinc-400 text-sm">
                    {active.sets.filter(s => s.validatedAt).length} séries enregistrées
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={handleResume}
                  >
                    Reprendre
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-zinc-400 hover:text-white"
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
          <Card className="bg-orange-900/30 border-orange-800">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-orange-400 font-semibold">Séance interrompue</p>
                  <p className="text-zinc-400 text-sm">
                    Il y a plus de 6h — terminer ou abandonner ?
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700"
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
                    className="text-zinc-400 hover:text-white"
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
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Prochaine seance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xl font-bold text-white">
                  Seance {data?.prochaineSeance.lettre}
                </p>
                <p className="text-zinc-500 text-sm">
                  {data?.prochaineSeance.templateNom}
                </p>
              </div>
              <Button onClick={handleStart} className="bg-white text-black hover:bg-zinc-200">
                Demarrer
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Feu biologique */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-300 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Feu biologique
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 text-sm">Aujourd&apos;hui</span>
                {data?.feuJour ? (
                  <FeuBiologique feu={data.feuJour} size="lg" />
                ) : (
                  <span className="text-zinc-600 text-sm">Non renseigne</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 text-sm">Tendance</span>
                {data?.feuTendance ? (
                  <FeuBiologique feu={data.feuTendance} size="lg" />
                ) : (
                  <span className="text-zinc-600 text-sm">Pas de donnees</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alertes */}
        {data?.alertesPreSeance && data.alertesPreSeance.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-300 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Alertes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.alertesPreSeance.slice(0, 3).map((alert: any, i: number) => (
                <div key={i} className="text-sm text-yellow-300 border-l-2 border-yellow-600 pl-3">
                  {alert.message}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
