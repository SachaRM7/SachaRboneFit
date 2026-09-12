"use client";
import { useState, type ReactNode } from "react";
import { DetailsLive } from "./DetailsLive";
import { toast } from "sonner";
import { motifSerieInvalide, LIBELLES_MOTIF_INVALIDE } from "@/lib/engine/serie-realisee";
import { chargeAEnregistrer } from "@/lib/validators/exercise-instance";
import { Check, ChevronRight, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { DemonstrationMouvement } from "./DemonstrationMouvement";
import { FicheExecution } from "./FicheExecution";
import { useContexteExecution } from "./useContexteExecution";
import { useSaisieSeries, type SerieValidee } from "./useSaisieSeries";
import { cransDeCharge } from "./crans-de-charge";
import { effortPropose, effortSaisi } from "./effort-propose";
import { classeDuMotif } from "./motif-progression";
import { CHOIX_RESERVE, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";
import { resumeDesSeries } from "@/lib/live/repere-precedent";
import {
  consigneDeSaisie,
  libelleChampCharge,
} from "@/lib/validators/exercise-instance";
import { libelleCibleEffort } from "@/components/programme/cible-effort";
import { GuidagePremiereSerie, PreparationMachine } from "./GuidagePremiereSerie";
import { phasesDuTempo, tempoAvecSecondes } from "./execution-client";
import type { ExercicePrescrit } from "./types";

/** Focus orchestre action, ressenti et aides autour du contrôleur de saisie commun. */
interface Props {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  modeReserve: boolean;
  onSerieValidee: (resultat: SerieValidee) => void;
  /** Les actions propres à l'exercice — remplacement, incidents — déjà montées. */
  actions?: ReactNode;
  /** Aller à l'exercice suivant, quand celui-ci est fini. `null` s'il est le dernier. */
  onSuivant: (() => void) | null;
  reporte?: boolean;
}

export function LecteurExercice({
  exercice,
  rpeReduction,
  modeReserve,
  onSerieValidee,
  actions,
  onSuivant,
  reporte = false,
}: Props) {
  const {
    lignes,
    serieCourante,
    exerciceTermine,
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
  } = useSaisieSeries({ exercice, rpeReduction, modeReserve, onSerieValidee });

  const { contexte, remplacer } = useContexteExecution(exercice);
  const [demonstration, setDemonstration] = useState(false);
  const [fiche, setFiche] = useState(false);

  const faites = lignes.filter(estValidee);
  const derniereFois = resumeDesSeries(exercice.historique ?? []);
  const sansRepere = (exercice.historique ?? []).length === 0;
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
    <article className="focus-carte">
      {/* ------------------------------------------------------------------
          LE HERO — l'identité de l'exercice, dessin compris.
          ------------------------------------------------------------------ */}
      <header className="lecteur-hero">
        {exercice.slug && (
          <button
            type="button"
            onClick={() => setDemonstration(true)}
            aria-label={`Voir la démonstration : ${exercice.nom}`}
            className="lecteur-illustration"
          >
            <IllustrationExercice
              slug={exercice.slug}
              nom={exercice.nom}
              anime
              className="w-full h-full"
            />
          </button>
        )}
        <div className="lecteur-titre">
          <h2>{exercice.nom}</h2>
          <p>
            {exercice.machineNom && exercice.machineNom !== exercice.nom
              ? `${exercice.machineNom} · `
              : ""}
            {exercice.seriesCibles} × {exercice.fourchetteRepsMin}–
            {exercice.fourchetteRepsMax}
            {exercice.reposSecondes ? ` · repos ${exercice.reposSecondes} s` : ""}
          </p>
          {libelleCibleEffort(exercice.rpeCible) && (
            <p>{libelleCibleEffort(exercice.rpeCible)}</p>
          )}
        </div>
        {/* L'avancement du SLOT : après substitution il compte aussi ce qui a
            été fait sur l'ancienne machine. */}
        <span className="lecteur-avancement chiffres">
          {avancement.faites}
          <span>/{avancement.cibles}</span>
        </span>
      </header>

      {(exercice.raisonSubstitution || exercice.messageProgression) && (
        <DetailsLive titre="Pourquoi cette prescription ?" action="Pourquoi cette charge / cet exercice ?">
        <p className="lecteur-mot">
          {exercice.raisonSubstitution && <span>{exercice.raisonSubstitution}</span>}
          {exercice.messageProgression && (
            <span className={classeDuMotif(exercice.motifProgression)}>
              {exercice.messageProgression}
            </span>
          )}
        </p>
        </DetailsLive>
      )}
      {reporte && (
        <p className="live-reporte-bandeau">Reporté · à reprendre avant de terminer</p>
      )}

      {/* ------------------------------------------------------------------
          LES REPÈRES — ce qu'on sait déjà, sans voler la vedette à la série.
          ------------------------------------------------------------------ */}
      <details className="live-exercise-help">
        <summary>{sansRepere ? "Première fois · préparer cet exercice" : "Mes repères et ma charge"}</summary>
      <div className="lecteur-reperes">
        {derniereFois && (
          <section>
            <p className="eyebrow">Dernière fois</p>
            {/* Jamais de faux repère : après une substitution, la nouvelle machine
                n'a pas d'historique, et emprunter la charge de l'ancienne ferait
                croire à une progression là où le même nombre ne déplace pas la
                même chose. */}
            <p className="lecteur-repere-valeur chiffres">{derniereFois}</p>
          </section>
        )}

        {contexte && (contexte.tempo || contexte.resumeReglages || contexte.note) && (
          <section>
            <p className="eyebrow">Repères</p>
            <p className="lecteur-repere-detail">
              {[
                tempoCourt ? `Tempo ${tempoCourt}` : null,
                contexte.resumeReglages,
                contexte.note,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
        )}

      </div>

      {sansRepere && faites.length === 0 && contexte && (
        <PreparationMachine contexte={contexte} onOuvrir={() => setFiche(true)} />
      )}

      {sansRepere && modeReserve && (
        <GuidagePremiereSerie
          exercice={exercice}
          rpeReduction={rpeReduction}
          valeurs={valeursDuDernierEssai}
        />
      )}

      </details>
      {contexte && <button type="button" className="live-technique-link" onClick={() => setFiche(true)}>
        Technique & réglages
      </button>}

      {/* ------------------------------------------------------------------
          CE QUI EST FAIT — compacté, jamais effacé.
          ------------------------------------------------------------------ */}
      {faites.length > 0 && (
        <ul className="lecteur-faites">
          {faites.map((numero) => {
            const v = valeurs(numero);
            return (
              <li key={numero}>
                <Check className="w-4 h-4" aria-hidden />
                <span className="lecteur-faite-nom">
                  Série {numero}
                  {numero > exercice.seriesCibles && (
                    <small className="serie-supplementaire">Supplémentaire</small>
                  )}
                </span>
                <span className="lecteur-faite-valeur chiffres">
                  {v.charge} {libelleChampCharge(exercice.natureCharge)} × {v.reps}
                  {v.rpe &&
                    (modeReserve
                      ? ` · RIR ${rpeVersReserve(effortSaisi(v.rpe)) ?? "—"}`
                      : ` · RPE ${v.rpe}`)}
                </span>
                {/* Modifiable explicitement : une série validée se fige, elle ne
                    devient pas intouchable. */}
                <button
                  type="button"
                  onClick={() => basculer(numero)}
                  aria-label={`Modifier la série ${numero}`}
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden />
                  Modifier
                </button>
                {/* Une série ajoutée reste retirable APRÈS validation : la
                    valider ne doit pas l'enfermer. Même geste, même règle —
                    seule la dernière ajoutée s'enlève. */}
                {derniereEnPlus === numero && (
                  <button
                    type="button"
                    onClick={retirerLaDerniereSerie}
                    aria-label={`Supprimer la série ${numero}`}
                    className="lecteur-faite-supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ------------------------------------------------------------------
          LA SÉRIE EN COURS — une seule représentation éditable.
          ------------------------------------------------------------------ */}
      {serieCourante !== null && (
        <SerieEnCours
          key={`${exercice.id}:${serieCourante}`}
          exercice={exercice}
          numero={serieCourante}
          total={exercice.seriesCibles}
          supplementaire={serieCourante > exercice.seriesCibles}
          /* La suppression appartient à LA SÉRIE AJOUTÉE, pas à un lien perdu
             en bas de carte. Elle n'apparaît que si CETTE série est celle qui
             peut être retirée — seule la dernière l'est. */
          onSupprimer={
            derniereEnPlus === serieCourante ? retirerLaDerniereSerie : null
          }
          modeReserve={modeReserve}
          rpeReduction={rpeReduction}
          afficherConsigne
          premierEssai={sansRepere}
          valeurs={valeurs(serieCourante)}
          ecrire={(champ, valeur) => ecrire(serieCourante, champ, valeur)}
          alerte={alerte}
          onValider={() => basculer(serieCourante)}
        />
      )}

      {/* ------------------------------------------------------------------
          LA FIN D'UNE ÉTAPE — pas un formulaire vide.
          ------------------------------------------------------------------ */}
      {(exerciceTermine || slotRempliAilleurs) && (
        <section className="lecteur-fin">
          <p className="eyebrow">Exercice terminé</p>
          <p className="lecteur-fin-titre">
            {exercice.nom}
            <span className="chiffres">
              {avancement.faites} / {avancement.cibles} séries
            </span>
          </p>
          {slotRempliAilleurs && (
            <p className="lecteur-fin-ailleurs">
              Ces séries ont été faites sur une autre machine — elles restent
              attachées à celle qui les a portées.
            </p>
          )}
          {/* La navigation reste un choix : rien ne change d'exercice tout seul.
              Préparer la machine suivante pendant qu'on récupère est un usage
              normal, et un écran qui avance sans consentement l'interdit. */}
          {onSuivant && (
            <button type="button" onClick={onSuivant} className="lecteur-suivant">
              Continuer · exercice suivant
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------
          LES ACTIONS — hiérarchisées, jamais enterrées.
          ------------------------------------------------------------------ */}
      {actions && <div className="lecteur-actions">{actions}</div>}

      {/* Le pied ne porte plus que l'ajout : « Retirer la série N » y était
          déconnecté de la série qu'il visait, et on le lisait après avoir
          scrollé au-delà des contrôles. La poubelle vit maintenant sur la
          série elle-même. */}
      <div className="lecteur-appoint">
        <button type="button" onClick={ajouterUneSerie}>
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Série en plus
        </button>
      </div>

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
    </article>
  );
}

/**
 * La série qu'on est en train de faire — un bloc DANS la carte.
 *
 * CE QUI A CHANGÉ, ET POURQUOI
 *
 * Trois mesures empilées, chacune sur sa ligne pleine largeur avec des crans de
 * 60 px, mangeaient toute la hauteur : le contexte de l'exercice était repoussé
 * hors de l'écran et le bouton Valider tombait sous la zone du home indicator.
 * L'écran disait « remplis trois compteurs » plutôt que « tu es sur le
 * Deadlift ».
 *
 * Charge et répétitions se partagent maintenant une rangée — ce sont les deux
 * nombres qu'on ajuste ensemble — et la réserve garde sa rangée de pastilles,
 * qui se lit d'un coup d'œil. Les cibles tactiles restent au-dessus des 44 px
 * d'iOS : c'est la hauteur qui a fondu, pas la surface qu'on vise.
 *
 * Les valeurs restent tapables — toucher le nombre ouvre le clavier. Le
 * parcours normal n'en a pas besoin, les cas particuliers oui.
 */
function SerieEnCours({
  exercice,
  numero,
  total,
  supplementaire,
  modeReserve,
  rpeReduction,
  afficherConsigne,
  premierEssai,
  valeurs,
  ecrire,
  alerte,
  onValider,
  onSupprimer,
}: {
  exercice: ExercicePrescrit;
  numero: number;
  total: number;
  supplementaire: boolean;
  modeReserve: boolean;
  rpeReduction: number;
  afficherConsigne: boolean;
  premierEssai: boolean;
  valeurs: { charge: string; reps: string; rpe: string };
  ecrire: (champ: "charge" | "reps" | "rpe", valeur: string) => void;
  alerte: { message: string; choix: number[] } | null;
  onValider: () => void;
  /** Retirer cette série ajoutée à la main, ou `null` si elle ne l'est pas. */
  onSupprimer: (() => void) | null;
}) {
  const [ressenti, setRessenti] = useState(false);
  const terminerSerie = () => {
    const motif = motifSerieInvalide({
      charge: chargeAEnregistrer(valeurs.charge, exercice.conventionCharge),
      repsEffectuees: Number.parseInt(valeurs.reps, 10),
      rpeEffectif: null,
    }, { conventionCharge: exercice.conventionCharge, natureCharge: exercice.natureCharge });
    if (motif) { toast.error(LIBELLES_MOTIF_INVALIDE[motif]); return; }
    setRessenti(true);
  };
  const crans = cransDeCharge(exercice, valeurs.charge, (v) => ecrire("charge", v));
  const reps = Number.parseInt(valeurs.reps, 10) || 0;
  const reserve = rpeVersReserve(effortSaisi(valeurs.rpe));
  const rpe = Number.parseFloat(valeurs.rpe.replace(",", "."));
  const reserveCible = rpeVersReserve(effortPropose(exercice.rpeCible, rpeReduction));
  const consigne = consigneDeSaisie(
    exercice.conventionCharge,
    exercice.natureCharge,
    exercice.poidsNonCompte,
  );
  const afficherCrans = crans.disponible
    && (!premierEssai || valeurs.charge.trim().length > 0);

  return (
    <section className="serie-en-cours" data-etape={ressenti ? "ressenti" : "serie"} aria-label={`Série ${numero}`}>
      <div className="serie-en-cours-tete">
        <p className="serie-en-cours-titre">
          {supplementaire ? (
            <>Série <span className="chiffres">{numero}</span> · <strong>Supplémentaire</strong></>
          ) : (
            <>Série <span className="chiffres">{numero}</span> sur <span className="chiffres">{total}</span></>
          )}
        </p>
        {/* Discrète, jamais rouge en permanence : c'est un geste rare, pas une
            alarme. Elle ne s'affiche que sur une série hors prescription — la
            prescription, elle, appartient au moteur. */}
        {onSupprimer && (
          <button
            type="button"
            onClick={onSupprimer}
            aria-label={`Supprimer la série ${numero}`}
            className="serie-supprimer"
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Charge et répétitions se partagent une rangée : ce sont les deux
          nombres qu'on ajuste ensemble, et les empiler coûtait un demi-écran. */}
      <div className="mesures-paire" hidden={ressenti}>
        {/* --- La charge, aux crans de l'appareil --- */}
        <div className="mesure">
        <p className="eyebrow">{libelleChampCharge(exercice.natureCharge)}</p>
        <div className="mesure-ligne">
          {/* Les boutons encadrent la valeur : les pouces atteignent les bords de
              l'écran, pas son centre. Ils disparaissent quand l'appareil n'a pas
              de grille connue — un pas par défaut décrirait une machine que
              personne n'a mesurée. */}
          {afficherCrans ? (
            <button
              type="button"
              onClick={crans.descendre}
              aria-label="Charge : un cran en dessous"
            >
              <Minus className="w-5 h-5" aria-hidden />
            </button>
          ) : (
            <span />
          )}
          <input
            type="text"
            inputMode="decimal"
            value={valeurs.charge}
            onChange={(e) => ecrire("charge", e.target.value)}
            aria-label={`Charge série ${numero}`}
            className="mesure-valeur chiffres"
            placeholder="—"
          />
          {afficherCrans ? (
            <button
              type="button"
              onClick={crans.monter}
              aria-label="Charge : un cran au-dessus"
            >
              <Plus className="w-5 h-5" aria-hidden />
            </button>
          ) : (
            <span />
          )}
        </div>
        {afficherConsigne && consigne && (
          <p className="mesure-aide">{consigne}</p>
        )}
      </div>

        {/* --- Les répétitions : un cran est un cran --- */}
        <div className="mesure">
          <p className="eyebrow">Reps</p>
        <div className="mesure-ligne">
          <button
            type="button"
            onClick={() => ecrire("reps", String(Math.max(0, reps - 1)))}
            aria-label="Une répétition de moins"
          >
            <Minus className="w-5 h-5" aria-hidden />
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={valeurs.reps}
            onChange={(e) => ecrire("reps", e.target.value)}
            aria-label={`Répétitions série ${numero}`}
            className="mesure-valeur chiffres"
            placeholder="—"
          />
          <button
            type="button"
            onClick={() => ecrire("reps", String(reps + 1))}
            aria-label="Une répétition de plus"
          >
            <Plus className="w-5 h-5" aria-hidden />
          </button>
        </div>
        </div>
      </div>

      {/*
        Une charge que l'appareil ne produit pas. Elle n'est PAS remplacée en
        silence : la corriger d'autorité ferait enregistrer autre chose que ce
        qui a été soulevé. L'écran dit ce qui existe autour, et laisse choisir.

        Hors de la paire : elle appartient à la série, et coincée dans une
        demi-colonne son message serait illisible.
      */}
      {!ressenti && alerte && (
        <div className="mesure-alerte">
          <p>{alerte.message}</p>
          <div>
            {alerte.choix.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => ecrire("charge", String(c))}
                className="chiffres"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {!ressenti && reserveCible !== null && <p className="live-effort-cible">≈ {reserveCible} répétitions en réserve</p>}
      {ressenti && <div className="live-ressenti-recap">
        <strong>{valeurs.charge} {libelleChampCharge(exercice.natureCharge)} · {valeurs.reps} reps</strong>
        <button type="button" onClick={() => setRessenti(false)}>Modifier charge / reps</button>
      </div>}
      {/* La cible reste une prescription ; seul le choix ci-dessous est observé. */}
      {ressenti && <div className="mesure" role="group" aria-label="Après la série : ton ressenti">
        <p className="eyebrow">
          {modeReserve ? "Ton ressenti" : "Effort perçu"}
        </p>
        {modeReserve ? (
          <>
            <p className="reserve-question">
              Combien de répétitions propres aurais-tu encore pu faire ?
            </p>
            {reserveCible !== null && (
              <p className="reserve-objectif">
                Objectif : environ {reserveCible} en réserve · choisis après la série
              </p>
            )}
            <div
              className="mesure-choix"
              role="group"
              aria-label="Ton ressenti : répétitions encore possibles"
            >
              {CHOIX_RESERVE.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reserve === r}
                  aria-label={
                    r === 0
                      ? "0, aucune répétition possible"
                      : r === 5
                        ? "5 ou plus, très facile"
                        : `${r} répétition${r > 1 ? "s" : ""} possible${r > 1 ? "s" : ""}`
                  }
                  onClick={() =>
                    // Un second appui efface : c'est le seul moyen de revenir à
                    // « rien saisi », et rien saisi doit rester possible.
                    ecrire("rpe", reserve === r ? "" : String(reserveVersRpe(r)))
                  }
                  className="chiffres"
                >
                  {r === 5 ? "5+" : r}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mesure-ligne">
            <button
              type="button"
              onClick={() =>
                ecrire("rpe", String(Math.max(0, (Number.isFinite(rpe) ? rpe : 8) - 0.5)))
              }
              aria-label="Effort perçu : un demi-point de moins"
            >
              <Minus className="w-5 h-5" aria-hidden />
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={valeurs.rpe}
              onChange={(e) => ecrire("rpe", e.target.value)}
              aria-label={`Effort perçu série ${numero}`}
              className="mesure-valeur chiffres"
              placeholder="—"
            />
            <button
              type="button"
              onClick={() =>
                ecrire("rpe", String(Math.min(10, (Number.isFinite(rpe) ? rpe : 8) + 0.5)))
              }
              aria-label="Effort perçu : un demi-point de plus"
            >
              <Plus className="w-5 h-5" aria-hidden />
            </button>
          </div>
        )}
      </div>

      }
      {/* Le geste. Gros, accentué, atteignable au pouce — et le seul de sa
          taille sur l'écran, pour qu'aucun autre ne lui ressemble. */}
      <button type="button" onClick={ressenti ? onValider : terminerSerie} className="serie-valider" disabled={ressenti && modeReserve && reserve === null}>
        <Check className="w-5 h-5" aria-hidden />
        {ressenti ? "Enregistrer la série" : "J’ai fini ma série"}
      </button>
    </section>
  );
}
