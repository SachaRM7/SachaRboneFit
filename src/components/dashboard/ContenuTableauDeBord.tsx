"use client";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeuBiologique } from "@/components/ui/FeuBiologique";
import { Sparkline } from "@/components/ui/Sparkline";
import { Activity, Play } from "lucide-react";
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
  const weightData = data.poids30jours.slice().reverse().map(bw => bw.poids) || [];

  return (
    <div className="min-h-screen bg-papier text-encre">
      <DeclarerContexte ecran="accueil" />
      {/* Header */}
      <div className="px-4 pt-8 pb-4">
        <h1 className="text-2xl font-bold">Salut {data.user.nom ?? "Sacha"}</h1>
        <div className="flex items-center gap-3 mt-1">
          {data.user.poidsActuel && (
            <p className="text-encre-2 text-sm">{data.user.poidsActuel} kg</p>
          )}
          {weightData.length >= 2 && (
            <Sparkline data={weightData} width={60} height={20} />
          )}
        </div>
      </div>

      {/* Le raccourci vers le programme arrive du serveur, en différé : il
          coûte à lui seul huit requêtes, et il n'aide personne à décider de
          sa séance. Sa place, en revanche, ne bouge pas. */}
      {carteProgramme}

      {/* Le dégagement de la barre de navigation est posé une fois, par le
          layout, marge du bas comprise. Le `pb-20` qui était ici s'y ajoutait
          en pure perte : 5 rem de vide à faire défiler sous le dernier bloc. */}
      <div className="px-4 space-y-4">
        {/* Plus de squelette : les données sont rendues avec la page. Ce qui
            s'affichait pendant deux à trois secondes n'attendait plus rien. */}
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
        {data.etat && !canResume && <CarteAujourdhui etat={data.etat} />}

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
                {data.feuJour ? (
                  <FeuBiologique feu={data.feuJour} size="lg" />
                ) : (
                  <span className="text-encre-3 text-sm">À renseigner avant ta séance</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-encre-3 text-sm">Tendance</span>
                {data.feuTendance ? (
                  <FeuBiologique feu={data.feuTendance} size="lg" />
                ) : (
                  <span className="text-encre-3 text-sm">Pas de données</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alertes, séance de demain, débriefs, historique récent : une
            vingtaine de requêtes que le serveur envoie dès qu'elles sont
            prêtes, sans retenir tout ce qui précède. */}
        {complement}
      </div>
    </div>
  );
}
