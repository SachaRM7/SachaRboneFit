/**
 * Ce qui s'affiche pendant qu'un écran se prépare.
 *
 * Il n'existait AUCUN `loading.tsx` dans l'application, et c'est la cause la
 * plus directe des quatre secondes ressenties à chaque première navigation.
 *
 * Deux effets, et le second est le plus important :
 *
 * 1. Sans limite de suspension, un clic sur un onglet ne produit RIEN tant que
 *    le serveur n'a pas fini de rendre la page entière. L'écran précédent
 *    reste affiché, figé, sans le moindre signe que quelque chose se passe. Le
 *    bouton Retour, lui, paraissait rapide parce qu'il lit le cache de routes
 *    du client et n'attend aucun serveur.
 *
 * 2. Les liens de la navigation et de l'accueil optent explicitement hors du
 *    préchargement : chaque route de ce groupe est dynamique et peut déclencher
 *    plusieurs lectures SQL. La limite reste utile pour la navigation demandée
 *    par l'utilisateur : elle montre ce squelette pendant que la page arrive,
 *    sans lancer de travail serveur en arrière-plan.
 *
 * Ce fichier crée cette limite pour tout le groupe. La barre de navigation et
 * l'en-tête vivent dans le layout : ils restent affichés et cliquables pendant
 * le chargement. Seul le contenu est remplacé.
 *
 * Ce n'est pas une optimisation à soi seul — un squelette de quatre secondes
 * reste quatre secondes d'attente. Il rend la navigation immédiate ; le temps
 * serveur, lui, se traite ailleurs.
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
