import { CircleGauge, SlidersHorizontal } from "lucide-react";
import { effortPropose, effortSaisi } from "./effort-propose";
import { configurationDeLExercice } from "./crans-de-charge";
import { rpeVersReserve } from "@/lib/engine/reserve";
import { conseilPremierEssai, premierCranConnu } from "@/lib/live/premier-essai";
import { consigneDeSaisie } from "@/lib/validators/exercise-instance";
import type { ContexteExecutionClient } from "./execution-client";
import type { Brouillon } from "./useSaisieSeries";
import type { ExercicePrescrit } from "./types";

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
        {premierCran !== null && (
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
