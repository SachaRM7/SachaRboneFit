/**
 * Chaque écran arrive en fondu.
 *
 * Passer de la liste des séances à l'aperçu, puis au Live, remplaçait le
 * contenu d'un coup. Un `template` est remonté à chaque navigation — un
 * `layout` ne l'est pas —, ce qui suffit à rejouer une animation CSS.
 *
 * Opacité seulement : une translation ferait de ce bloc le repère des
 * éléments `position: fixed` qu'il contient (barres d'action, feuilles) le
 * temps de l'animation, et ils sauteraient.
 */
export default function Gabarit({ children }: { children: React.ReactNode }) {
  return <div className="page-entree">{children}</div>;
}
