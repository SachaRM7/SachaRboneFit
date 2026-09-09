import { CircleGauge, SlidersHorizontal } from "lucide-react";
import { effortPropose, effortSaisi } from "./effort-propose";
import { configurationDeLExercice } from "./crans-de-charge";
import { rpeVersReserve } from "@/lib/engine/reserve";
import { conseilPremierEssai, premierCranConnu } from "@/lib/live/premier-essai";
import { consigneDeSaisie } from "@/lib/validators/exercise-instance";
import type { ContexteExecutionClient } from "./execution-client";
import type { Brouillon } from "./useSaisieSeries";
import type { ExercicePrescrit } from "./types";
import type { EstimationPremiereCharge } from "@/lib/engine/cold-start-strength";

type ChargeAffichable = EstimationPremiereCharge | (
  Omit<EstimationPremiereCharge, "origine"> & { origine: "estimation_personnelle" }
);

/** Le futur modèle personnel aura sa sémantique sans modifier celle des faits matériels. */
export function libellesPremiereCharge(estimation: ChargeAffichable) {
  if (estimation.origine === "minimum_materiel") {
    return {
      titre: "Point de départ",
      badge: "Repère matériel",
      explication: "Premier cran disponible sur cette machine. On ajuste après ta première série.",
    };
  }

  if (estimation.origine === "estimation_personnelle") {
    return {
      titre: "Charge d’essai",
      badge: `Estimé · confiance ${estimation.confiance}`,
      explication: estimation.explication,
    };
  }

  return {
    titre: "Charge de référence",
    badge: estimation.origine === "serie_courante" ? "Série en cours" : "Historique réel",
    explication: estimation.explication,
  };
}

export function GuidagePremiereSerie({
  exercice,
  rpeReduction,
  valeurs,
}: {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  valeurs: Brouillon | null;
}) {
  const config = configurationDeLExercice(exercice);
  const reserveCible = rpeVersReserve(effortPropose(exercice.rpeCible, rpeReduction));
  const reserve = rpeVersReserve(effortSaisi(valeurs?.rpe ?? ""));
  const chargeLue = Number.parseFloat((valeurs?.charge ?? "").replace(",", "."));
  const conseil = conseilPremierEssai({
    charge: Number.isFinite(chargeLue) ? chargeLue : null,
    reserve,
    reserveCible,
    config,
  });
  const premierCran = premierCranConnu(config);
  const consigne = consigneDeSaisie(
    exercice.conventionCharge,
    exercice.natureCharge,
    exercice.poidsNonCompte,
  );

  return (
    <section className="premier-repere" aria-label="Premier repère de charge">
      <div className="premier-repere-titre">
        <CircleGauge aria-hidden />
        <div>
          <p className="eyebrow">Premier repère</p>
          <strong>Commence volontairement léger.</strong>
        </div>
      </div>

      {exercice.premiereCharge?.charge != null && (() => {
        const libelles = libellesPremiereCharge(exercice.premiereCharge);
        return <div className="premier-repere-estimation" data-testid="charge-essai">
          <div>
            <span>{libelles.titre}</span>
            <strong>{exercice.premiereCharge.charge} kg</strong>
          </div>
          <small>{libelles.badge}</small>
          <p>{libelles.explication}</p>
        </div>;
      })()}

      {consigne && <p className="premier-repere-convention">{consigne}</p>}
      <p>
        Fais {exercice.fourchetteRepsMin}–{exercice.fourchetteRepsMax} répétitions
        propres, puis indique combien tu aurais encore pu en faire.
      </p>
      {reserveCible !== null && (
        <p className="premier-repere-cible">
          <span>Objectif</span>
          Environ {reserveCible} répétition{reserveCible > 1 ? "s" : ""} en réserve
        </p>
      )}

      {conseil && (
        <p className="premier-repere-conseil" data-etat={conseil.etat} role="status">
          {conseil.message}
        </p>
      )}

      <details>
        <summary>Comprendre comment choisir ma charge</summary>
        <ol>
          <li>Choisis une charge qui te paraît clairement légère.</li>
          <li>Fais la fourchette demandée sans dégrader le mouvement.</li>
          <li>Choisis ta réserve seulement après la série.</li>
          <li>L’app te guidera ensuite vers le cran matériel suivant.</li>
        </ol>
        {premierCran !== null && exercice.premiereCharge?.charge == null && (
          <p>
            Premier cran déclaré sur cette machine : {premierCran} kg. C’est un
            repère matériel, pas une charge recommandée.
          </p>
        )}
      </details>
    </section>
  );
}

export function PreparationMachine({
  contexte,
  onOuvrir,
}: {
  contexte: ContexteExecutionClient;
  onOuvrir: () => void;
}) {
  const aUneInstallation = Boolean(contexte.fiche?.installation);
  if (!contexte.exerciseInstanceId && !aUneInstallation) return null;

  return (
    <section className="preparation-machine" aria-label="Installation et réglages">
      <div className="preparation-machine-titre">
        <SlidersHorizontal aria-hidden />
        <p className="eyebrow">Avant de commencer</p>
      </div>

      {aUneInstallation && (
        <div>
          <strong>Installation</strong>
          <p>{contexte.fiche!.installation}</p>
        </div>
      )}

      {contexte.exerciseInstanceId && (
        <div>
          <strong>Réglages machine</strong>
          {contexte.reglages.length > 0 ? (
            <ul>
              {contexte.reglages.map((reglage) => (
                <li key={reglage.cle}>
                  <span>{reglage.libelle}</span>
                  <b>
                    {reglage.valeur === null
                      ? "À régler"
                      : `${reglage.valeur}${reglage.unite ?? ""}`}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Aucun réglage spécifique n’est encore documenté pour cette machine.
              {aUneInstallation
                ? " Utilise les consignes d’installation ci-dessus."
                : " La fiche reste accessible pour vérifier le mouvement."}
            </p>
          )}
        </div>
      )}

      <button type="button" onClick={onOuvrir}>
        {contexte.reglages.length > 0 ? "Voir ou noter mes réglages" : "Ouvrir la fiche"}
      </button>
    </section>
  );
}
