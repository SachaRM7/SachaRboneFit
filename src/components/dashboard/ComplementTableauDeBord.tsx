import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Dumbbell, Activity, TrendingDown } from "lucide-react";
import { AlertList } from "@/components/alerts/AlertList";
import { complementTableauDeBord } from "@/services/tableau-de-bord";
import { phase, publier } from "@/lib/mesure/trace";

/**
 * Ce que l'accueil montre après coup.
 *
 * Alertes, séance de demain, débriefs, historique récent : une vingtaine de
 * requêtes qui pesaient sur le premier affichage sans jamais changer la
 * décision du moment. Rendu par le serveur derrière une limite de suspension,
 * ce bloc arrive dès qu'il est prêt — sans retenir le reste, et sans ajouter la
 * moindre requête depuis le navigateur.
 *
 * Rien ici n'a besoin du navigateur : l'historique passe par des liens, qui
 * savent en outre se précharger, ce que le `router.push` d'un bouton ne faisait
 * pas.
 */
export async function ComplementTableauDeBord({ userId }: { userId: string }) {
  const data = await phase("calcul", "complementTableauDeBord", () =>
    complementTableauDeBord(userId),
  );

  // La seconde borne du streaming. Comparée à « essentiel », elle dit combien
  // de temps le complément a retenu la réponse après le premier contenu.
  publier("complement");

  return (
    <>
      {/* Alertes — le composant existait mais n'était monté nulle part. */}
      {data.alertesPreSeance.length > 0 && (
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
      {data.precalcSession && (
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
      {data.weeklyDebrief && (
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
      {data.recentSessions.length > 0 && (
        <Card className="bg-carte border-filet">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <Dumbbell className="w-4 h-4" />
              Séances récentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentSessions.map((s) => (
              <Link
                key={s.id}
                href={`/sessions/${s.id}?templateLettre=${encodeURIComponent(s.templateLettre || "")}&sessionDate=${encodeURIComponent(s.date)}`}
                prefetch={false}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-papier-2 transition-colors text-left"
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
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
