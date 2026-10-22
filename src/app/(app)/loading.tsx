/**
 * Limite de suspension commune aux écrans. Les quatre onglets principaux
 * préchargent le layout et ce squelette (mode partiel Next), afin de pouvoir
 * afficher une transition avant le retour des données. Les listes et les
 * liens secondaires ne lancent aucune préparation en arrière-plan.
 * Le chargement reste interruptible ; la navigation vit dans le layout.
 */
export default function Chargement() {
  return (
    <div className="p-4 space-y-4" role="status" aria-label="Chargement">
      {/* Un titre, puis des blocs : la forme d'un écran, pas son contenu. On
          ne dessine pas de faux chiffres — un squelette qui imite des données
          fait lire une valeur qui n'existe pas. */}
      <div className="h-7 w-40 rounded bg-papier-2 animate-pulse" />
      <div className="h-24 rounded-xl bg-papier-2 animate-pulse" />
      <div className="h-24 rounded-xl bg-papier-2 animate-pulse" />
      <div className="h-16 rounded-xl bg-papier-2 animate-pulse" />
      <span className="sr-only">Chargement de l&apos;écran…</span>
    </div>
  );
}
