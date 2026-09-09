import { Button } from "@/components/ui/button";

interface Props {
  onTerminer: () => void;
}

/** Surface finale : elle n'est montée que lorsque l'avancement fait foi. */
export function ClotureSeance({ onTerminer }: Props) {
  return (
    <section className="live-session-terminee" aria-live="polite">
      <p className="eyebrow">Séance terminée</p>
      <h2>Toutes les séries prévues sont faites.</h2>
      <Button className="w-full bg-encre text-papier" onClick={onTerminer}>
        Terminer la séance
      </Button>
    </section>
  );
}
