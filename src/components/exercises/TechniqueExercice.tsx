import { Check, TriangleAlert } from "lucide-react";
import { ficheRenseignee, type FicheTechnique } from "@/lib/engine/execution";

export function TechniqueExercice({
  fiche,
}: {
  fiche: FicheTechnique | null | undefined;
}) {
  if (!ficheRenseignee(fiche) || !fiche)
    return (
      <section className="movement-technique">
        <h2>Technique du mouvement</h2>
        <p>Les consignes de cet exercice ne sont pas encore renseignées.</p>
      </section>
    );
  const etapes = [
    ["S’installer", fiche.installation],
    ["Position de départ", fiche.positionDepart],
    ["Faire le mouvement", fiche.execution],
    ["Amplitude", fiche.amplitude],
    ["Respiration", fiche.respiration],
  ].filter(([, texte]) => Boolean(texte));
  return (
    <div className="movement-technique">
      {fiche.description && (
        <p className="movement-description">{fiche.description}</p>
      )}
      {etapes.length > 0 && (
        <section>
          <h2>Le geste, pas à pas</h2>
          <ol className="movement-steps">
            {etapes.map(([titre, texte], index) => (
              <li key={titre}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{titre}</h3>
                  <p>{texte}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="movement-practices">
        {!!fiche.pointsCles?.length && (
          <section className="movement-good">
            <h2>
              <Check size={20} aria-hidden /> Les bons repères
            </h2>
            <ul>
              {fiche.pointsCles.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        )}
        {!!fiche.erreursFrequentes?.length && (
          <section className="movement-errors">
            <h2>
              <TriangleAlert size={20} aria-hidden /> À éviter
            </h2>
            <ul>
              {fiche.erreursFrequentes.map((erreur) => (
                <li key={erreur}>{erreur}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {fiche.sensation && (
        <section className="movement-note">
          <h2>Ce que tu peux ressentir</h2>
          <p>{fiche.sensation}</p>
        </section>
      )}
      {fiche.securite && (
        <section className="movement-note">
          <h2>Pour pratiquer en sécurité</h2>
          <p>{fiche.securite}</p>
        </section>
      )}
    </div>
  );
}
