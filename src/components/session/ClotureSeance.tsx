import { Button } from "@/components/ui/button";
import { MascotteCoach } from "@/components/coach/MascotteCoach";

interface Props {
  onTerminer: () => void;
}

/**
 * Surface finale : elle n'est montée que lorsque l'avancement fait foi.
 *
 * C'était un bloc de texte posé en bas de page — le moment le plus gratifiant
 * de la séance passait sans que rien ne bouge. L'anneau se referme et la coche
 * se trace : une seule fois, à l'arrivée, et rien si le système refuse le
 * mouvement.
 */
export function ClotureSeance({ onTerminer }: Props) {
  return (
    <section className="live-session-terminee" aria-live="polite">
      <div className="cloture-embleme" aria-hidden>
        <svg viewBox="0 0 64 64">
          <circle className="cloture-anneau" cx="32" cy="32" r="28" pathLength={1} />
          <path className="cloture-coche" d="M20 33 l8 8 l16 -18" pathLength={1} />
        </svg>
        <MascotteCoach etat="beast" taille="compact" presence="discrete" anime className="cloture-mascotte" />
      </div>
      <p className="eyebrow">Séance terminée</p>
      <h2>Toutes les séries prévues sont faites.</h2>
      <Button className="w-full bg-encre text-papier" onClick={onTerminer}>
        Terminer la séance
      </Button>
    </section>
  );
}
