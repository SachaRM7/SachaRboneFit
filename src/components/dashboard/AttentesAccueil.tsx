import { Activity, Sparkles, ChevronRight } from "lucide-react";

/** Même géométrie que les résumés streamés, sans afficher de fausse valeur. */
export function AttenteMuscles() {
  return <div className="home-metric" role="status" aria-label="Chargement de l’état musculaire">
    <span className="home-metric-label"><Activity size={18} aria-hidden /> Muscles</span>
    <span className="home-skeleton-value" aria-hidden><span className="home-skeleton" /></span>
  </div>;
}

export function AttenteObservations() {
  return <section className="home-noticed" role="status" aria-label="Chargement des observations du coach">
    <h2 className="home-section-title">Coach a remarqué</h2>
    <div className="home-noticed-trigger" aria-hidden>
      <span className="home-noticed-icon"><Sparkles size={22} /></span>
      <span><span className="home-skeleton" /></span><ChevronRight size={20} />
    </div>
  </section>;
}

export function AttenteProgramme() {
  return <div className="home-programme-skeleton" role="status" aria-label="Chargement du programme">
    <span className="home-skeleton" aria-hidden /><span className="home-skeleton" aria-hidden /><span className="home-skeleton" aria-hidden />
  </div>;
}
