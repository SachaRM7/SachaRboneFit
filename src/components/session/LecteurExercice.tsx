"use client";
import { useState, type ReactNode } from "react";
import { Check, ChevronRight, Minus, Pencil, Plus } from "lucide-react";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { DemonstrationMouvement } from "./DemonstrationMouvement";
import { FicheExecution } from "./FicheExecution";
import { useContexteExecution } from "./useContexteExecution";
import { useSaisieSeries } from "./useSaisieSeries";
import { cransDeCharge } from "./crans-de-charge";
import { effortSaisi } from "./effort-propose";
import { classeDuMotif } from "./motif-progression";
import { CHOIX_RESERVE, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";
import { resumeDesSeries } from "@/lib/live/repere-precedent";
import { libelleChampCharge } from "@/lib/validators/exercise-instance";
import { libelleCibleEffort } from "@/components/programme/cible-effort";
import type { ExercicePrescrit } from "./types";

/**
 * UN EXERCICE, UNE SÉRIE, UN GESTE — le lecteur de séance.
 *
 * POURQUOI CE COMPOSANT N'EST PAS `TableauSeries`
 *
 * La première version du Focus était le tableau de la vue Liste avec un
 * exercice au lieu de six. Les deux vues se ressemblaient donc au point qu'on
 * ne savait pas laquelle on regardait, et le Focus héritait de ce qui fait la
 * force du carnet et la faiblesse d'un écran d'effort : une grille de champs,
 * des libellés de colonne, une densité faite pour relire.
 *
 * Or on ne relit pas entre deux séries. On est essoufflé, on tient le téléphone
 * d'une main, on a trente secondes. La question n'est pas « où en suis-je dans
 * le tableau » mais « qu'est-ce que je fais maintenant ». D'où cette
 * composition : la série en cours occupe l'écran, ce qui est fait se replie en
 * résumé, et le geste de validation est un bouton qu'on ne peut pas rater.
 *
 * CE QU'IL PARTAGE AVEC LA VUE LISTE
 *
 * Tout ce qui décide : `useSaisieSeries`. Les mêmes lignes, les mêmes valeurs,
 * la même validation, les mêmes refus, le même store. Ce qui diffère est la
 * mise en page — et c'est la donnée commune, pas un composant commun, qui
 * garantit qu'une série validée ici l'est là-bas.
 */

interface Props {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  modeReserve: boolean;
  onSerieValidee: (reposSecondes: number | null) => void;
  /** Les actions propres à l'exercice — remplacement, incidents — déjà montées. */
  actions?: ReactNode;
  /** Aller à l'exercice suivant, quand celui-ci est fini. `null` s'il est le dernier. */
  onSuivant: (() => void) | null;
}

export function LecteurExercice({
  exercice,
  rpeReduction,
  modeReserve,
  onSerieValidee,
  actions,
  onSuivant,
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

  return (
    <article className="lecteur">
      {/* ------------------------------------------------------------------
          L'EXERCICE — ce qu'on va faire, en grand.
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
      </header>

      {(exercice.raisonSubstitution || exercice.messageProgression) && (
        <p className="lecteur-mot">
          {exercice.raisonSubstitution && <span>{exercice.raisonSubstitution}</span>}
          {exercice.messageProgression && (
            <span className={classeDuMotif(exercice.motifProgression)}>
              {exercice.messageProgression}
            </span>
          )}
        </p>
      )}

      {/* ------------------------------------------------------------------
          LES REPÈRES — ce qu'on sait déjà, sans voler la vedette à la série.
          ------------------------------------------------------------------ */}
      <div className="lecteur-reperes">
        <section>
          <p className="eyebrow">Dernière fois</p>
          {/* Jamais de faux repère : après une substitution, la nouvelle machine
              n'a pas d'historique, et emprunter la charge de l'ancienne ferait
              croire à une progression là où le même nombre ne déplace pas la
              même chose. */}
          <p className={derniereFois ? "lecteur-repere-valeur chiffres" : "lecteur-repere-vide"}>
            {derniereFois ?? "Pas encore de repère sur cette machine"}
          </p>
        </section>

        {contexte && (contexte.tempo || contexte.resumeReglages || contexte.note) && (
          <section>
            <p className="eyebrow">Repères</p>
            <p className="lecteur-repere-detail">
              {[
                contexte.tempo ? `Tempo ${contexte.tempo.brut}` : null,
                contexte.resumeReglages,
                contexte.note,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
        )}

        {contexte && (
          <button type="button" onClick={() => setFiche(true)}>
            {contexte.reglages.length > 0 || contexte.peutDecrire
              ? "Technique & réglages"
              : "Technique & note"}
          </button>
        )}
      </div>

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
                <span className="lecteur-faite-nom">Série {numero}</span>
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
          exercice={exercice}
          numero={serieCourante}
          total={exercice.seriesCibles}
          modeReserve={modeReserve}
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
              Exercice suivant
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------
          LES ACTIONS — hiérarchisées, jamais enterrées.
          ------------------------------------------------------------------ */}
      {actions && <div className="lecteur-actions">{actions}</div>}

      <div className="lecteur-appoint">
        <button type="button" onClick={ajouterUneSerie}>
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Série en plus
        </button>
        {derniereEnPlus !== null && (
          <button type="button" onClick={retirerLaDerniereSerie}>
            <Minus className="w-3.5 h-3.5" aria-hidden />
            Retirer la série {derniereEnPlus}
          </button>
        )}
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
 * La série qu'on est en train de faire.
 *
 * Trois mesures, chacune sur sa ligne, chacune avec ses crans. Pas de tableau,
 * pas de libellé de colonne, pas de seconde copie de la même série ailleurs sur
 * l'écran : c'est LA représentation éditable, et il n'y en a qu'une.
 *
 * Les valeurs restent tapables — toucher le nombre ouvre le clavier. Le
 * parcours normal n'en a pas besoin, les cas particuliers oui.
 */
function SerieEnCours({
  exercice,
  numero,
  total,
  modeReserve,
  valeurs,
  ecrire,
  alerte,
  onValider,
}: {
  exercice: ExercicePrescrit;
  numero: number;
  total: number;
  modeReserve: boolean;
  valeurs: { charge: string; reps: string; rpe: string };
  ecrire: (champ: "charge" | "reps" | "rpe", valeur: string) => void;
  alerte: { message: string; choix: number[] } | null;
  onValider: () => void;
}) {
  const crans = cransDeCharge(exercice, valeurs.charge, (v) => ecrire("charge", v));
  const reps = Number.parseInt(valeurs.reps, 10) || 0;
  const reserve = rpeVersReserve(effortSaisi(valeurs.rpe));
  const rpe = Number.parseFloat(valeurs.rpe.replace(",", "."));

  return (
    <section className="serie-en-cours" aria-label={`Série ${numero}`}>
      <p className="serie-en-cours-titre">
        Série <span className="chiffres">{numero}</span> sur{" "}
        <span className="chiffres">{total}</span>
      </p>

      {/* --- La charge, aux crans de l'appareil --- */}
      <div className="mesure">
        <p className="eyebrow">{libelleChampCharge(exercice.natureCharge)}</p>
        <div className="mesure-ligne">
          {/* Les boutons encadrent la valeur : les pouces atteignent les bords de
              l'écran, pas son centre. Ils disparaissent quand l'appareil n'a pas
              de grille connue — un pas par défaut décrirait une machine que
              personne n'a mesurée. */}
          {crans.disponible ? (
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
          {crans.disponible ? (
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
        {/*
          Une charge que l'appareil ne produit pas. Elle n'est PAS remplacée en
          silence : la corriger d'autorité ferait enregistrer autre chose que ce
          qui a été soulevé. L'écran dit ce qui existe autour, et laisse choisir.
        */}
        {alerte && (
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
      </div>

      {/* --- Les répétitions : un cran est un cran --- */}
      <div className="mesure">
        <p className="eyebrow">Répétitions</p>
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

      {/* --- L'effort : une réserve en calibration, un RPE sinon --- */}
      <div className="mesure">
        <p className="eyebrow">
          {modeReserve ? "Répétitions en réserve" : "Effort perçu"}
        </p>
        {modeReserve ? (
          <div className="mesure-choix" role="group" aria-label="Répétitions en réserve">
            {CHOIX_RESERVE.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reserve === r}
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

      {/* Le geste. Gros, accentué, atteignable au pouce — et le seul de sa
          taille sur l'écran, pour qu'aucun autre ne lui ressemble. */}
      <button type="button" onClick={onValider} className="serie-valider">
        <Check className="w-5 h-5" aria-hidden />
        Valider la série
      </button>
    </section>
  );
}
