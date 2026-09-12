import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
/** Même format texte en base, rendu sûr pour les échanges anciens et nouveaux. */
export function ReponseCoach({ texte }: { texte: string }) {
  return <div className="coach-markdown"><Markdown remarkPlugins={[remarkGfm, remarkBreaks]} skipHtml components={{
    table: ({ children }) => <div className="coach-table" role="region" aria-label="Tableau du coach" tabIndex={0}><table>{children}</table></div>,
    a: ({ href, children }) => <a href={href} rel="noopener noreferrer">{children}</a>,
  }}>{texte}</Markdown></div>;
}
