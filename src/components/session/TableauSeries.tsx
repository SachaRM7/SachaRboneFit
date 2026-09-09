"use client";
import { useState, type ReactNode } from "react";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { DemonstrationMouvement } from "./DemonstrationMouvement";
import { FicheExecution } from "./FicheExecution";
import { useContexteExecution } from "./useContexteExecution";
import type { ExercicePrescrit } from "./types";
import { CHOIX_RESERVE, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";
import { classeDuMotif } from "./motif-progression";
import { effortSaisi } from "./effort-propose";
import { libelleCibleEffort } from "@/components/programme/cible-effort";
import {
  consigneDeSaisie,
  libelleChampCharge,
} from "@/lib/validators/exercise-instance";
import { useSaisieSeries, type SerieValidee } from "./useSaisieSeries";
import { GuidagePremiereSerie, PreparationMachine } from "./GuidagePremiereSerie";
import { phasesDuTempo, tempoAvecSecondes } from "./execution-client";

interface Props {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  /** Déclenché à chaque série validée : lance le repos et enchaîne. */
  onSerieValidee: (resultat: SerieValidee) => void;
  /**
   * En calibration, on demande la réserve de répétitions plutôt qu'un RPE.
   * « Combien aurais-tu pu en faire de plus ? » se répond sans avoir appris
   * d'échelle — et c'est cette réponse qui fixera les charges.
   */
  modeReserve?: boolean;
  /**
   * Ce qu'on peut faire À cet exercice, rendu par l'écran de séance.
   *
   * Le remplacement a besoin du parc de la salle et de la séance en cours,
   * que ce composant n'a pas — et n'a pas à connaître. Il reçoit donc le
   * bouton déjà monté et se contente de lui donner sa place.
   */
  actions?: ReactNode;
  reporte?: boolean;
}

/**
 * UN EXERCICE DANS LE CARNET DE SÉANCE — la vue Liste.
 *
 * CE QUE CETTE VUE EST, ET CE QU'ELLE N'EST PAS
 *
 * C'est le carnet : toute la séance d'un coup, chaque série relisible, chaque
 * valeur corrigible sans naviguer. On y vient pour vérifier, reprendre une
 * série d'il y a vingt minutes, voir ce qui reste. Ce n'est PAS la vue d'effort
 * — celle-là est le Focus, qui ne montre qu'une série à la fois et occupe
 * l'écran entier.
 *
 * Les deux lisent le même store par `useSaisieSeries`. Une série validée ici
 * l'est là-bas dans le même rendu : ce n'est pas une synchronisation, c'est la
 * même donnée. Ce qui diffère est la mise en page, et elle seule.
 *
 * TROIS ÉTATS DE LIGNE, LISIBLES SANS LES LIRE
 *
 *   validée   fond positif, coche, valeurs figées, « Modifier » discret ;
 *   en cours  fond accentué, champs actifs, la coche est le geste ;
 *   à venir   neutre.
 *
 * Une série validée ne disparaît jamais — c'est le défaut que ce lot ferme. Elle
 * se fige, elle ne s'efface pas.
 */
export function TableauSeries({
  exercice,
  rpeReduction,
  onSerieValidee,
  modeReserve = false,
  actions,
  reporte = false,
}: Props) {
  const {
    lignes,
    serieCourante,
    slotRempliAilleurs,
    valeurs,
    ecrire,
    basculer,
    estValidee,
    avancement,
    alerte,
    derniereEnPlus,
    ajouterUneSerie,
    retirerLaDerniereSerie,
    seriesEnPlus,
  } = useSaisieSeries({ exercice, rpeReduction, modeReserve, onSerieValidee });

  const consigne = consigneDeSaisie(
    exercice.conventionCharge,
    exercice.natureCharge,
    exercice.poidsNonCompte,
  );

  /**
   * Ce qu'il faut savoir devant la machine : tempo, réglages retenus, note.
   *
   * Chargé après le rendu, jamais avant : l'objectif « application ouverte →
   * première série » ne doit pas attendre une requête de plus.
   */
  const { contexte, remplacer } = useContexteExecution(exercice);
  const [demonstration, setDemonstration] = useState(false);
  const [fiche, setFiche] = useState(false);

  const champ = "serie-champ";
  const complet = avancement.faites >= avancement.cibles;
  const faites = lignes.filter(estValidee);
  const sansRepere = (exercice.historique ?? []).length === 0;
  const afficheGuidagePremierRepere = sansRepere && modeReserve;
  const numeroDuDernierEssai = faites.at(-1) ?? serieCourante;
  const valeursDuDernierEssai = numeroDuDernierEssai === null
    ? null
    : valeurs(numeroDuDernierEssai);
  const tempoCourt = contexte?.tempo
    ? tempoAvecSecondes(
        phasesDuTempo(contexte.tempo.tempo, contexte.fiche?.libellesPhasesTempo),
      )
    : null;

  return (
    <section
      className="live-carte"
      data-termine={complet ? "" : undefined}
      data-reporte={reporte ? "" : undefined}
    >
      <header className="live-carte-tete">
        {exercice.slug && (
          /* L'illustration est la porte d'entrée de la démonstration : la cible
             est déjà là, et personne n'a besoin d'un bouton « voir le
             mouvement » à côté d'une image du mouvement. */
          <button
            type="button"
            onClick={() => setDemonstration(true)}
            aria-label={`Voir la démonstration : ${exercice.nom}`}
            className="live-carte-vignette"
          >
            <IllustrationExercice
              slug={exercice.slug}
              nom={exercice.nom}
              anime
              className="w-full h-full text-encre-3"
            />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2>{exercice.nom}</h2>
          {/* La machine porte souvent le nom de l'exercice : le répéter sous le
              titre n'apprend rien et allonge la ligne pour rien. */}
          <p className="live-carte-prescription">
            {reporte && <strong className="live-reporte">Reporté · </strong>}
            {exercice.machineNom && exercice.machineNom !== exercice.nom
              ? `${exercice.machineNom} · `
              : ""}
            {exercice.seriesCibles} × {exercice.fourchetteRepsMin}–
            {exercice.fourchetteRepsMax}
            {exercice.reposSecondes ? ` · repos ${exercice.reposSecondes} s` : ""}
            {/* Dit dans la même ligne discrète que le reste : la colonne RPE
                pouvait être vide sans qu'on sache si c'était un oubli de
                l'application ou l'absence de consigne. */}
            {libelleCibleEffort(exercice.rpeCible)
              ? ` · ${libelleCibleEffort(exercice.rpeCible)}`
              : ""}
          </p>
        </div>
        {/* L'avancement du SLOT : après substitution, il compte aussi ce qui a
            été fait sur l'ancienne machine — sinon la séance semble repartir de
            zéro alors qu'une série a bien été soulevée. */}
        <span className="live-carte-compteur chiffres">
          {avancement.faites}
          <span>/{avancement.cibles}</span>
        </span>
      </header>

      {/* Le strict nécessaire pour agir. Le détail — technique, erreurs,
          respiration, réglages complets — s'ouvre d'un geste. Rien ne s'affiche
          pour dire qu'une information manque : ce qui est absent est absent. */}
      {contexte && (contexte.tempo || contexte.resumeReglages || contexte.note) && (
        <button
          type="button"
          onClick={() => setFiche(true)}
          className="live-reperes"
        >
          {contexte.tempo && (
            <span>
              Tempo <b className="chiffres">{tempoCourt}</b>
            </span>
          )}
          {contexte.resumeReglages && <span>{contexte.resumeReglages}</span>}
          {contexte.note && <span className="italic truncate">{contexte.note}</span>}
        </button>
      )}

      {(exercice.raisonSubstitution || exercice.messageProgression) && (
        <p className="live-carte-mot">
          {exercice.raisonSubstitution && <span>{exercice.raisonSubstitution}</span>}
          {exercice.messageProgression && (
            // La couleur suit la NATURE de la décision. Elle était « gain » pour
            // toutes : « 1 série sur 3, on refait la séance entière » s'affichait
            // donc en vert, comme un progrès.
            <span className={classeDuMotif(exercice.motifProgression)}>
              {exercice.messageProgression}
            </span>
          )}
        </p>
      )}

      {sansRepere && faites.length === 0 && contexte && (
        <PreparationMachine contexte={contexte} onOuvrir={() => setFiche(true)} />
      )}

      {afficheGuidagePremierRepere && (
        <GuidagePremiereSerie
          exercice={exercice}
          rpeReduction={rpeReduction}
          valeurs={valeursDuDernierEssai}
        />
      )}

      {/*
        Une charge que l'appareil ne produit pas.

        Elle n'est PAS remplacée en silence : la corriger d'autorité ferait
        enregistrer autre chose que ce qui a été soulevé.
      */}
      {alerte && serieCourante !== null && (
        <div className="live-alerte-charge">
          <p>{alerte.message}</p>
          <div>
            {alerte.choix.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => ecrire(serieCourante, "charge", String(c))}
                className="chiffres"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="live-carte-corps">
        {/*
          Le slot est plein, mais rempli AILLEURS.

          Après une substitution qui suit la dernière série, la nouvelle machine
          n'a rien à demander. Un tableau vide se lirait comme une erreur ; on
          dit ce qui s'est passé.
        */}
        {slotRempliAilleurs ? (
          <p className="live-serie-vide">
            Les {avancement.cibles} séries de cet exercice ont été faites sur une
            autre machine.
          </p>
        ) : (
          <ul className="live-series">
            {lignes.map((numero) => {
              const v = valeurs(numero);
              const validee = estValidee(numero);
              const courante = numero === serieCourante;
              const passe = exercice.historique?.[numero - 1];
              /*
               * Au-delà de ce qui a été prescrit.
               *
               * Rien n'interdit d'en faire plus — mais ça ne réécrit pas la
               * prescription. `seriesCibles` reste ce que le moteur a décidé.
               */
              const horsPrescription = numero > exercice.seriesCibles;

              return (
                <li
                  key={numero}
                  className="live-serie"
                  data-etat={validee ? "validee" : courante ? "courante" : "a_venir"}
                >
                  <span className="live-serie-numero chiffres">
                    S{numero}
                    {horsPrescription && (
                      <small className="serie-supplementaire">Supplémentaire</small>
                    )}
                  </span>

                  {validee ? (
                    /*
                      La série est faite : elle se LIT.

                      Des champs en lecture seule gardaient l'encombrement d'un
                      formulaire pour n'offrir aucun geste. Une phrase compacte
                      dit la même chose en une ligne, et « Modifier » rouvre
                      réellement la saisie.
                    */
                    <p className="live-serie-resume chiffres">
                      {v.charge || "—"}
                      <small>{libelleChampCharge(exercice.natureCharge)}</small>
                      <i>×</i>
                      {v.reps || "—"}
                      <small>reps</small>
                      {v.rpe && (
                        <>
                          <i>·</i>
                          {modeReserve
                            ? `RIR ${rpeVersReserve(effortSaisi(v.rpe)) ?? "—"}`
                            : `RPE ${v.rpe}`}
                        </>
                      )}
                    </p>
                  ) : (
                    <div className="live-serie-champs">
                      <label>
                        <span>{libelleChampCharge(exercice.natureCharge)}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={v.charge}
                          onChange={(e) => ecrire(numero, "charge", e.target.value)}
                          aria-label={`Charge série ${numero}`}
                          className={champ}
                        />
                      </label>
                      <label>
                        <span>Reps</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={v.reps}
                          onChange={(e) => ecrire(numero, "reps", e.target.value)}
                          aria-label={`Répétitions série ${numero}`}
                          className={champ}
                        />
                      </label>
                      <label>
                        <span>{modeReserve ? "Ressenti" : "RPE"}</span>
                        {modeReserve ? (
                          <select
                            /* Rien de sélectionné quand rien n'est saisi : le
                               menu se posait sur « 2 » et cette réserve, que
                               personne n'avait choisie, devenait un RPE 8. */
                            value={String(rpeVersReserve(effortSaisi(v.rpe)) ?? "")}
                            onChange={(e) =>
                              ecrire(
                                numero,
                                "rpe",
                                e.target.value === ""
                                  ? ""
                                  : String(reserveVersRpe(Number(e.target.value))),
                              )
                            }
                            aria-label={`Répétitions encore possibles, série ${numero}`}
                            className={champ}
                          >
                            <option value="">—</option>
                            {CHOIX_RESERVE.map((r) => (
                              <option key={r} value={r}>
                                {r === 5 ? "5+" : r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={v.rpe}
                            onChange={(e) => ecrire(numero, "rpe", e.target.value)}
                            aria-label={`Effort perçu série ${numero}`}
                            className={champ}
                          />
                        )}
                      </label>
                    </div>
                  )}

                  {/* L'historique en face de la décision, pas dans un encadré
                      séparé — et seulement quand il existe. */}
                  {passe && !validee && (
                    <span className="live-serie-repere chiffres">
                      Dernière {passe.charge} × {passe.reps}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => basculer(numero)}
                    aria-pressed={validee}
                    aria-label={
                      validee
                        ? `Modifier la série ${numero}`
                        : `Valider la série ${numero}`
                    }
                    className="live-serie-geste"
                  >
                    {validee ? (
                      <Pencil className="w-4 h-4" aria-hidden />
                    ) : (
                      <Check className="w-5 h-5" aria-hidden />
                    )}
                  </button>

                  {/* La suppression vit AVEC la série qu'elle retire. Elle était
                      un lien en pied de carte, à distance de la ligne visée —
                      sur une carte à six lignes, rien ne disait laquelle. */}
                  {derniereEnPlus === numero && (
                    <button
                      type="button"
                      onClick={retirerLaDerniereSerie}
                      aria-label={`Supprimer la série ${numero}`}
                      className="live-serie-supprimer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="live-carte-pied">
          <button type="button" onClick={ajouterUneSerie}>
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Série en plus
          </button>

          {/* Ouvrir le détail reste possible même sans aucune donnée : c'est là
              qu'on renseigne un réglage pour la première fois. Le mot
              « Réglages » apparaît aussi quand il n'y en a AUCUN mais qu'on peut
              en décrire — il disparaît pour qui ne tient pas la salle. */}
          {contexte && (
            <button type="button" onClick={() => setFiche(true)} className="ml-auto">
              {contexte.reglages.length > 0 || contexte.peutDecrire
                ? "Réglages et technique"
                : "Technique et note"}
            </button>
          )}
        </div>

        {/*
          Les précisions qui ne se lisent qu'une fois, groupées plutôt
          qu'empilées en bandes séparées.
        */}
        {(seriesEnPlus > 0 ||
          (!afficheGuidagePremierRepere && consigne) ||
          exercice.poidsNonCompte ||
          (exercice.seriesPrevuesAvantAjustement != null &&
            exercice.seriesPrevuesAvantAjustement !== exercice.seriesCibles) ||
          (sansRepere && !afficheGuidagePremierRepere)) && (
          <div className="live-carte-notes">
            {/*
              L'aveu, quand il n'y a rien à comparer. Après une substitution, la
              nouvelle machine n'a pas d'historique. Le dire évite surtout la
              tentation inverse : emprunter la charge de l'ancienne machine, où
              le même nombre ne déplace pas la même chose.
            */}
            {sansRepere && !afficheGuidagePremierRepere && (
              <p>Pas encore de repère sur cette machine.</p>
            )}
            {seriesEnPlus > 0 && (
              <p>
                {exercice.seriesCibles} série
                {exercice.seriesCibles > 1 ? "s" : ""} prescrite
                {exercice.seriesCibles > 1 ? "s" : ""} — les suivantes sont
                enregistrées comme réalisation, la prescription ne change pas.
              </p>
            )}
            {/*
              Ce qu'il faut saisir, là où on le saisit.
              La convention vivait en base sans jamais atteindre la séance :
              devant un hack squat, rien ne disait s'il fallait noter les disques
              ou le total, et deux séances saisies autrement font une courbe qui
              bouge sans effort supplémentaire.
            */}
            {!afficheGuidagePremierRepere && consigne && <p>{consigne}</p>}
            {exercice.poidsNonCompte ? (
              <p>
                {/* La résistance annoncée par le constructeur se lit, elle ne
                    s'ajoute pas : inclinaison, bras de levier et cames font
                    qu'elle n'est pas une masse qu'on additionne. */}
                Résistance de l&apos;appareil à vide : {exercice.poidsNonCompte} kg,
                non comptée dans la saisie
              </p>
            ) : null}
            {exercice.seriesPrevuesAvantAjustement != null &&
              exercice.seriesPrevuesAvantAjustement !== exercice.seriesCibles && (
                <p>
                  {exercice.seriesCibles} séries au lieu de{" "}
                  {exercice.seriesPrevuesAvantAjustement} — volume réduit
                  aujourd&apos;hui
                </p>
              )}
          </div>
        )}
      </div>

      {actions && <div className="live-carte-actions">{actions}</div>}

      {demonstration && exercice.slug && (
        <DemonstrationMouvement
          slug={exercice.slug}
          nom={exercice.nom}
          onFermer={() => setDemonstration(false)}
        />
      )}
      {fiche && contexte && (
        <FicheExecution
          contexte={contexte}
          nom={exercice.nom}
          onFermer={() => setFiche(false)}
          onEnregistre={remplacer}
        />
      )}
    </section>
  );
}
