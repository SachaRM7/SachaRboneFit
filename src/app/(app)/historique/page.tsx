import { redirect } from "next/navigation";
import { seancesRealisees } from "@/db/archivage";
import { libelleFeu } from "@/lib/referentiels/libelles";
import Link from "next/link";
import { db } from "@/db/client";
import { sessionLogs, setLogs, seanceTemplates, gyms } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { Badge } from "@/components/ui/badge";

const COULEUR_FEU: Record<string, string> = {
  vert: "bg-feu-vert",
  orange: "bg-feu-orange",
  rouge: "bg-feu-rouge",
};

function formaterDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "long",
  });
}

/**
 * Historique des séances.
 *
 * Aucune vue ne permettait de parcourir ses séances passées : le tableau de bord
 * en montrait les dernières et la page progression des courbes, mais l'historique
 * brut n'était pas navigable.
 */
export default async function HistoriquePage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const seances = await db.query.sessionLogs.findMany({
    where: seancesRealisees(userId),
    orderBy: [desc(sessionLogs.date), desc(sessionLogs.createdAt)],
    limit: 60,
  });

  if (seances.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold text-encre mb-4">Historique</h1>
        <p className="text-encre-3">Aucune séance enregistrée pour l&apos;instant.</p>
      </div>
    );
  }

  const idsSeances = seances.map((s) => s.id);
  const idsTemplates = [...new Set(seances.map((s) => s.seanceTemplateId).filter(Boolean))] as string[];
  const idsSalles = [...new Set(seances.map((s) => s.gymId).filter(Boolean))] as string[];

  const [series, templates, salles] = await Promise.all([
    db.select({ sessionLogId: setLogs.sessionLogId, charge: setLogs.charge, reps: setLogs.repsEffectuees })
      .from(setLogs).where(inArray(setLogs.sessionLogId, idsSeances)),
    idsTemplates.length
      ? db.query.seanceTemplates.findMany({ where: inArray(seanceTemplates.id, idsTemplates) })
      : Promise.resolve([]),
    idsSalles.length
      ? db.query.gyms.findMany({ where: inArray(gyms.id, idsSalles) })
      : Promise.resolve([]),
  ]);

  const nomTemplate = new Map(templates.map((t) => [t.id, t]));
  const nomSalle = new Map(salles.map((g) => [g.id, g.nom]));

  const statsParSeance = new Map<string, { nbSeries: number; volume: number }>();
  for (const s of series) {
    const actuel = statsParSeance.get(s.sessionLogId) ?? { nbSeries: 0, volume: 0 };
    actuel.nbSeries += 1;
    actuel.volume += s.charge * s.reps;
    statsParSeance.set(s.sessionLogId, actuel);
  }

  // Regroupement par mois pour rendre la liste parcourable.
  const parMois = new Map<string, typeof seances>();
  for (const s of seances) {
    const mois = s.date.slice(0, 7);
    parMois.set(mois, [...(parMois.get(mois) ?? []), s]);
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-encre">Historique</h1>
        <p className="text-encre-3 text-sm mt-1">
          {seances.length} séance{seances.length > 1 ? "s" : ""} enregistrée{seances.length > 1 ? "s" : ""}
        </p>
      </div>

      {[...parMois.entries()].map(([mois, liste]) => (
        <section key={mois} className="space-y-2">
          <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">
            {new Date(`${mois}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </h2>
          <div className="space-y-2">
            {liste.map((s) => {
              const stats = statsParSeance.get(s.id);
              const template = s.seanceTemplateId ? nomTemplate.get(s.seanceTemplateId) : null;
              return (
                <Link key={s.id} href={`/sessions/${s.id}`} className="block">
                  <div className="bg-carte border border-filet rounded-lg p-3 hover:border-filet transition-colors">
                    <div className="flex items-start gap-3">
                      {s.feuBiologiqueJour && (
                        <span
                          className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${COULEUR_FEU[s.feuBiologiqueJour] ?? "bg-filet"}`}
                          aria-label={libelleFeu(s.feuBiologiqueJour)}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-encre font-medium text-sm">
                          {template ? `${template.lettre} · ${template.nom}` : "Séance libre"}
                        </p>
                        <p className="text-encre-3 text-xs mt-0.5">
                          {formaterDate(s.date)}
                          {s.gymId && nomSalle.has(s.gymId) ? ` · ${nomSalle.get(s.gymId)}` : ""}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {stats ? (
                            <>
                              <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                                {stats.nbSeries} séries
                              </Badge>
                              <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                                {Math.round(stats.volume).toLocaleString("fr-FR")} kg de volume
                              </Badge>
                            </>
                          ) : (
                            <Badge variant="outline" className="border-feu-orange/40 text-feu-orange text-[10px]">
                              aucune série
                            </Badge>
                          )}
                          {s.dureeMinutes && (
                            <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                              {s.dureeMinutes} min
                            </Badge>
                          )}
                          {s.volumeAjustePct !== null && s.volumeAjustePct !== 0 && (
                            <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                              volume {s.volumeAjustePct} %
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
