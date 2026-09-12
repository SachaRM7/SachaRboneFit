import { Activity, ChevronRight } from "lucide-react";
import { complementTableauDeBordMemoise } from "@/services/tableau-de-bord";
import type { RecuperationMusculaire } from "@/services/recuperation";
import { CarteRecuperation } from "./CarteRecuperation";
import { DetailsAccueil } from "./DetailsAccueil";

export async function RecuperationAccueil({ userId }: { userId: string }) {
  let etat: RecuperationMusculaire | null = null;
  try {
    ({ recuperation: etat } = await complementTableauDeBordMemoise(userId));
  } catch { /* La séance reste accessible si le complément échoue. */ }
  return <ResumeRecuperation etat={etat} />;
}

export function ResumeRecuperation({ etat }: { etat: RecuperationMusculaire | null }) {
  // Compter les verdicts existants, sans créer de score ou assimiler l'absence
  // d'historique à une mesure de récupération.
  const proteges = etat?.muscles.filter((m) => m.etat === "a_menager").length ?? 0;
  const recuperent = etat?.muscles.filter((m) => m.etat === "en_cours").length ?? 0;
  const disponibles = etat?.muscles.filter((m) => m.etat === "pret").length ?? 0;
  const resume = !etat ? "Indisponible" : proteges > 0 ? `${proteges} à protéger`
    : recuperent > 0 ? `${recuperent} en récupération`
    : disponibles > 0 ? `${disponibles} disponibles` : "À découvrir";
  return (
    <DetailsAccueil titre="Ton état musculaire" className="home-metric" apercu={<>
      <span className="home-metric-label"><Activity size={18} aria-hidden /> Muscles</span>{" "}
      <strong data-attention={proteges > 0 || recuperent > 0}>{resume}</strong>
      <ChevronRight className="home-metric-arrow" size={14} aria-hidden />
    </>}>
      {etat && etat.muscles.length > 0 ? <CarteRecuperation etat={etat} /> : (
        <p>{etat ? "Pas encore d’activité musculaire récente à détailler. Tes séances et tes ressentis alimenteront ce suivi." : "L’état musculaire est momentanément indisponible. Réessaie dans un instant."}</p>
      )}
    </DetailsAccueil>
  );
}
