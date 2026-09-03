"use client";
import { useMemo, useState } from "react";
import { useSessionStore } from "@/stores/sessionStore";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import { Check, Plus } from "lucide-react";
import { DemonstrationMouvement } from "./DemonstrationMouvement";
import { FicheExecution } from "./FicheExecution";
import { useContexteExecution } from "./useContexteExecution";
import type { ExercicePrescrit } from "./types";
import { CHOIX_RESERVE, reserveVersRpe, rpeVersReserve } from "@/lib/engine/reserve";
import { classeDuMotif } from "./motif-progression";
import { champEffortPropose, effortSaisi } from "./effort-propose";
import { LIBELLES_MOTIF_INVALIDE, motifSerieInvalide } from "@/lib/engine/serie-realisee";
import { toast } from "sonner";
import { libelleCibleEffort } from "@/components/programme/cible-effort";
import { chargeAEnregistrer, consigneDeSaisie } from "@/lib/validators/exercise-instance";

interface Props {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  /** Déclenché à chaque série validée, pour lancer le repos. */
  onSerieValidee: (reposSecondes: number | null) => void;
  /**
   * En calibration, on demande la réserve de répétitions plutôt qu'un RPE.
   * « Combien aurais-tu pu en faire de plus ? » se répond sans avoir appris
   * d'échelle — et c'est cette réponse qui fixera les charges.
   */
  modeReserve?: boolean;
}

type Brouillon = { charge: string; reps: string; rpe: string };

/**
 * Saisie d'un exercice sous forme de tableau de séries.
 *
 * L'écran précédent affichait une série à la fois, pilotée par des
 * incrémenteurs : atteindre 60 kg depuis 0 demandait douze appuis, et on ne
 * voyait jamais où on en était sans compter. Les applications de référence ont
 * toutes convergé vers la même grammaire — une ligne par série, la valeur
 * pré-remplie, une saisie clavier directe, une coche qui valide et lance le
 * repos. C'est ce que fait ce composant.
 *
 * La colonne « Dernière » met l'historique en face de la décision, au lieu de
 * le reléguer dans un encadré séparé au-dessus.
 */
export function TableauSeries({ exercice, rpeReduction, onSerieValidee, modeReserve = false }: Props) {
  const { upsertSet, removeSet, active } = useSessionStore();

  const seriesSaisies = useMemo(
    () => (active?.sets ?? []).filter((s) => s.exerciseInstanceId === exercice.id),
    [active?.sets, exercice.id],
  );

  // Des séries peuvent avoir été ajoutées au-delà de la prescription.
  const [seriesEnPlus, setSeriesEnPlus] = useState(0);
  const consigne = consigneDeSaisie(exercice.conventionCharge, exercice.natureCharge);
  const nbLignes = Math.max(
    exercice.seriesCibles + seriesEnPlus,
    ...seriesSaisies.map((s) => s.numeroSerie),
    1,
  );

  // Vide quand aucun effort n'est prescrit : le champ pré-rempli à 8 partait
  // en base à la validation, sans que personne l'ait ressenti ni saisi.
  const rpeParDefaut = champEffortPropose(exercice.rpeCible, rpeReduction);
  const chargeParDefaut = exercice.chargeSuggeree ?? exercice.historique?.[0]?.charge ?? null;

  /** Valeurs proposées pour une ligne, avant toute saisie de l'utilisateur. */
  const proposition = (numero: number): Brouillon => ({
    charge: chargeParDefaut != null ? String(chargeParDefaut) : "",
    reps: String(exercice.repsSuggerees?.[numero - 1] ?? exercice.fourchetteRepsMin),
    rpe: rpeParDefaut,
  });

  const [brouillons, setBrouillons] = useState<Record<number, Brouillon>>({});

  /**
   * Ce qu'il faut savoir devant la machine : tempo, réglages retenus, note.
   *
   * Chargé après le rendu, jamais avant : l'objectif « application ouverte →
   * première série » ne doit pas attendre une requête de plus. Tant qu'il n'est
   * pas là, la carte s'affiche sans ces lignes plutôt qu'avec des trous.
   */
  const { contexte, remplacer } = useContexteExecution(exercice);
  const [demonstration, setDemonstration] = useState(false);
  const [fiche, setFiche] = useState(false);

  /**
   * Ce qu'affiche une ligne — et ce que la base en garde.
   *
   * Le brouillon primait sur la série enregistrée, même APRÈS validation :
   * valider une série puis en modifier la charge affichait la nouvelle valeur
   * pendant que le store — donc la base à la clôture — gardait l'ancienne. Une
   * ligne verte pouvait donc montrer 60 kg là où 45 seraient enregistrés.
   * L'écran mentait, et rien ne le signalait.
   *
   * Une série validée lit désormais la saisie enregistrée, un point c'est
   * tout. Le brouillon ne sert qu'aux lignes pas encore validées.
   */
  const serieEnregistree = (numero: number) =>
    seriesSaisies.find((s) => s.numeroSerie === numero);

  const valeurs = (numero: number): Brouillon => {
    const saisie = serieEnregistree(numero);
    if (saisie) {
      return {
        charge: saisie.charge != null ? String(saisie.charge) : "",
        reps: saisie.repsEffectuees != null ? String(saisie.repsEffectuees) : "",
        rpe: saisie.rpeEffectif != null ? String(saisie.rpeEffectif) : "",
      };
    }
    if (brouillons[numero]) return brouillons[numero]!;
    return proposition(numero);
  };

  const ecrire = (numero: number, champ: keyof Brouillon, valeur: string) =>
    setBrouillons((b) => ({ ...b, [numero]: { ...valeurs(numero), [champ]: valeur } }));

  /**
   * Le temps écoulé depuis la validation de la série précédente.
   *
   * C'est un INTERVALLE ENTRE SÉRIES : il contient le repos et l'exécution de
   * la série. La colonne s'appelle `repos_reel_secondes` pour des raisons
   * historiques ; ce qu'elle mesure est décrit ici et dans
   * `engine/execution-reelle.ts`, plutôt que supposé.
   *
   * Deux cas rendent `null`, et aucun ne doit devenir zéro :
   *
   *   première série       rien ne la précède, il n'y a pas d'intervalle ;
   *   exercice différent   le chronomètre a démarré ailleurs. Attribuer cette
   *                        durée à l'exercice courant fabriquerait une mesure
   *                        fausse — mieux vaut ne rien savoir.
   */
  const intervalleDepuisLaSeriePrecedente = (): number | null => {
    const depart = active?.restStartTimestamp;
    if (!depart) return null;
    if (active?.restExerciseIndex !== active?.currentExerciseIndex) return null;
    // L'heure est lue au clic sur la coche — `basculer` est le seul appelant —,
    // jamais pendant le rendu. Le compilateur ne peut pas le prouver depuis
    // ici, et l'instant d'une validation est justement ce qu'on ne mémoïse pas.
    // eslint-disable-next-line react-hooks/purity
    return Math.floor((Date.now() - depart) / 1000);
  };

  const basculer = (numero: number) => {
    const enregistree = serieEnregistree(numero);
    if (enregistree) {
      /**
       * Rouvrir une série validée.
       *
       * Le brouillon repart des valeurs RÉELLEMENT enregistrées, pas de la
       * proposition : rouvrir une série ne doit pas effacer ce qu'on vient d'y
       * saisir. C'est le geste « Modifier » — la série cesse d'être validée, se
       * corrige, puis se revalide.
       */
      setBrouillons((b) => ({
        ...b,
        [numero]: {
          charge: enregistree.charge != null ? String(enregistree.charge) : "",
          reps: enregistree.repsEffectuees != null ? String(enregistree.repsEffectuees) : "",
          rpe: enregistree.rpeEffectif != null ? String(enregistree.rpeEffectif) : "",
        },
      }));
      removeSet(exercice.id, numero);
      return;
    }

    const v = valeurs(numero);
    const charge = chargeAEnregistrer(v.charge, exercice.conventionCharge);
    const reps = Number.parseInt(v.reps, 10);

    /**
     * Le refus est ici AUSSI, pas seulement au serveur.
     *
     * Valider une ligne vide cochait la case, lançait le repos et faisait
     * avancer le compteur ; la série disparaissait silencieusement à la
     * clôture. L'écran affichait donc une séance que la base n'a jamais eue.
     */
    const convention = {
      conventionCharge: exercice.conventionCharge,
      natureCharge: exercice.natureCharge,
    };
    const motif = motifSerieInvalide(
      {
        repsEffectuees: Number.isFinite(reps) ? reps : null,
        charge,
        rpeEffectif: effortSaisi(v.rpe),
      },
      convention,
      // En calibration, la réserve est LA mesure : c'est elle qui fixera les
      // charges des blocs suivants. `modeReserve` porte déjà cette phase.
      { effortRequis: modeReserve },
    );
    if (motif) {
      toast.error(LIBELLES_MOTIF_INVALIDE[motif]);
      return;
    }

    upsertSet({
      exerciseInstanceId: exercice.id,
      numeroSerie: numero,
      charge,
      repsEffectuees: Number.isFinite(reps) ? reps : null,
      rpeEffectif: effortSaisi(v.rpe),
      // Même raison : `basculer` est le gestionnaire du clic de validation.
      // eslint-disable-next-line react-hooks/purity
      validatedAt: Date.now(),
      reposReelSecondes: intervalleDepuisLaSeriePrecedente(),
      // L'intervalle dit combien de temps s'est écoulé ; ceci dit si le repos
      // a été écourté volontairement. Un « Passer » suivi de trois minutes
      // d'attente ne se lit pas dans la durée seule.
      reposIgnore: active?.restSkipped ? true : undefined,
    });

    // Le brouillon n'a plus lieu d'être : la série enregistrée devient la
    // seule source de ce que la ligne affiche.
    setBrouillons((b) => {
      const suite = { ...b };
      delete suite[numero];
      return suite;
    });

    onSerieValidee(exercice.reposSecondes ?? null);
  };

  const lignes = Array.from({ length: nbLignes }, (_, i) => i + 1);
  const validees = seriesSaisies.length;

  const champ =
    "w-full min-w-0 rounded-md border border-filet bg-papier-2 px-1.5 py-2 text-center " +
    "chiffres text-base font-semibold text-encre focus:border-encre focus:outline-none " +
    "focus:ring-2 focus:ring-encre/20";

  /** Une série validée se lit, elle ne se corrige qu'après l'avoir rouverte. */
  const champVerrouille =
    "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-2 " +
    "text-center chiffres text-base font-semibold text-encre-2 cursor-default";

  return (
    <section className="border border-filet rounded-xl bg-carte overflow-hidden">
      <header className="flex items-start gap-3 p-3.5 border-b border-filet-doux">
        {exercice.slug && (
          /* L'illustration devient la porte d'entrée de la démonstration : la
             cible est déjà là, elle mesure 56 px, et personne n'a besoin d'un
             bouton « voir le mouvement » à côté d'une image du mouvement. */
          <button
            type="button"
            onClick={() => setDemonstration(true)}
            aria-label={`Voir la démonstration : ${exercice.nom}`}
            className="shrink-0 rounded-lg -m-1 p-1 active:bg-papier-2"
          >
            <IllustrationExercice
              slug={exercice.slug}
              nom={exercice.nom}
              anime
              className="w-14 h-14 text-encre-3"
            />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-encre leading-tight">{exercice.nom}</h2>
          {/* La machine porte souvent le nom de l'exercice : le répéter sous le
              titre n'apprend rien et allonge la ligne pour rien. */}
          <p className="text-encre-3 text-xs mt-0.5">
            {exercice.machineNom && exercice.machineNom !== exercice.nom
              ? `${exercice.machineNom} · `
              : ""}
            {exercice.seriesCibles} × {exercice.fourchetteRepsMin}-{exercice.fourchetteRepsMax}
            {exercice.reposSecondes ? ` · repos ${exercice.reposSecondes} s` : ""}
          </p>
          {/* Dit dans la même ligne discrète que le reste : la colonne RPE
              pouvait être vide sans qu'on sache si c'était un oubli de
              l'application ou l'absence de consigne. */}
          <p className="text-encre-3 text-xs">{libelleCibleEffort(exercice.rpeCible)}</p>
        </div>
        <span className="chiffres text-xs text-encre-3 shrink-0 tabular-nums">
          {validees}/{exercice.seriesCibles}
        </span>
      </header>

      {/* Le strict nécessaire pour agir, sur une ligne. Le détail — technique,
          erreurs, respiration, réglages complets — s'ouvre d'un geste. Rien ne
          s'affiche pour dire qu'une information manque : ce qui est absent est
          absent, et se renseigne dans la fiche. */}
      {contexte && (contexte.tempo || contexte.resumeReglages || contexte.note) && (
        <button
          type="button"
          onClick={() => setFiche(true)}
          className="w-full text-left px-3.5 py-2 border-b border-filet-doux active:bg-papier-2"
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {contexte.tempo && (
              <span className="text-encre-2">
                Tempo <span className="chiffres tabular-nums">{contexte.tempo.brut}</span>
              </span>
            )}
            {contexte.resumeReglages && (
              <span className="text-encre-2">{contexte.resumeReglages}</span>
            )}
            {contexte.note && (
              <span className="text-encre-3 italic truncate max-w-full">{contexte.note}</span>
            )}
          </span>
        </button>
      )}

      {modeReserve && (
        <p className="px-3.5 py-2 text-xs text-encre-2 border-b border-filet-doux">
          Après chaque série : combien de répétitions aurais-tu encore pu faire ?
          C&apos;est cette réponse qui fixera tes charges.
        </p>
      )}

      {(exercice.raisonSubstitution || exercice.messageProgression) && (
        <p className="px-3.5 py-2 text-xs border-b border-filet-doux">
          {exercice.raisonSubstitution && (
            <span className="text-encre-2">{exercice.raisonSubstitution}</span>
          )}
          {exercice.messageProgression && (
            // La couleur suit la NATURE de la décision. Elle était « gain »
            // pour toutes : « 1 série sur 3, on refait la séance entière »
            // s'affichait donc en vert, comme un progrès.
            <span className={classeDuMotif(exercice.motifProgression)}>
              {exercice.messageProgression}
            </span>
          )}
        </p>
      )}

      <div className="p-3.5">
        <table className="w-full">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-encre-3">
              <th scope="col" className="w-6 pb-1.5 text-left font-medium">#</th>
              <th scope="col" className="pb-1.5 text-left font-medium">Dernière</th>
              <th scope="col" className="w-[4.5rem] pb-1.5 font-medium">kg</th>
              <th scope="col" className="w-[3.5rem] pb-1.5 font-medium">Reps</th>
              <th scope="col" className={`pb-1.5 font-medium ${modeReserve ? "w-[7.5rem]" : "w-[3.5rem]"}`}>
                {modeReserve ? "Encore ?" : "RPE"}
              </th>
              <th scope="col" className="w-10 pb-1.5">
                <span className="sr-only">Valider</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((numero) => {
              const v = valeurs(numero);
              const validee = seriesSaisies.some((s) => s.numeroSerie === numero);
              const passe = exercice.historique?.[numero - 1];
              /**
               * Au-delà de ce qui a été prescrit.
               *
               * Rien n'interdit d'en faire plus — mais ça ne réécrit pas la
               * prescription. `seriesCibles` reste ce que le moteur a décidé ;
               * ces lignes sont de la réalisation en plus, et elles le disent.
               */
              const horsPrescription = numero > exercice.seriesCibles;

              return (
                <tr key={numero} className="border-t border-filet-doux">
                  <td className="chiffres text-xs text-encre-3 py-1.5">
                    {numero}
                    {horsPrescription && (
                      <span className="block text-[9px] leading-tight text-encre-3" title="Au-delà de la prescription">
                        +
                      </span>
                    )}
                  </td>
                  <td className="chiffres text-xs text-encre-3 py-1.5 whitespace-nowrap">
                    {passe ? `${passe.charge}×${passe.reps}` : "—"}
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="text" inputMode="decimal" value={v.charge}
                      onChange={(e) => ecrire(numero, "charge", e.target.value)}
                      aria-label={`Charge série ${numero}`}
                      /* Verrouillée tant que la série est validée : une valeur
                         modifiée après le Check ne partait pas en base. */
                      readOnly={validee}
                      className={validee ? champVerrouille : champ}
                    />
                  </td>
                  <td className="py-1.5 px-1">
                    <input
                      type="text" inputMode="numeric" value={v.reps}
                      onChange={(e) => ecrire(numero, "reps", e.target.value)}
                      aria-label={`Répétitions série ${numero}`}
                      readOnly={validee}
                      className={validee ? champVerrouille : champ}
                    />
                  </td>
                  <td className="py-1.5 px-1">
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
                            e.target.value === "" ? "" : String(reserveVersRpe(Number(e.target.value))),
                          )
                        }
                        aria-label={`Répétitions encore possibles, série ${numero}`}
                        disabled={validee}
                        className={validee ? champVerrouille : champ}
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
                        type="text" inputMode="decimal" value={v.rpe}
                        onChange={(e) => ecrire(numero, "rpe", e.target.value)}
                        aria-label={`Effort perçu série ${numero}`}
                        readOnly={validee}
                        className={validee ? champVerrouille : champ}
                      />
                    )}
                  </td>
                  <td className="py-1.5 pl-1">
                    <button
                      type="button"
                      onClick={() => basculer(numero)}
                      aria-pressed={validee}
                      aria-label={validee ? `Modifier la série ${numero}` : `Valider la série ${numero}`}
                      className={`w-9 h-9 rounded-md border grid place-items-center transition-colors ${
                        validee
                          ? "bg-gain border-gain text-papier"
                          : "border-filet bg-papier-2 text-encre-3 hover:text-encre"
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() => setSeriesEnPlus((n) => n + 1)}
          className="mt-2.5 flex items-center gap-1.5 text-xs text-encre-2 hover:text-encre"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter une série hors prescription
        </button>
        {seriesEnPlus > 0 && (
          <p className="text-xs text-encre-3 mt-1">
            {exercice.seriesCibles} série{exercice.seriesCibles > 1 ? "s" : ""} prescrite
            {exercice.seriesCibles > 1 ? "s" : ""} — les suivantes sont enregistrées comme
            réalisation, la prescription ne change pas.
          </p>
        )}

        {/*
          Ce qu'il faut saisir, là où on le saisit.
          La convention vivait en base sans jamais atteindre la séance : devant
          un hack squat, rien ne disait s'il fallait noter les disques ou le
          total, et deux séances saisies autrement font une courbe qui bouge
          sans effort supplémentaire.
        */}
        {consigne ? <p className="text-xs text-encre-3 mt-2">{consigne}</p> : null}

        {exercice.poidsNonCompte ? (
          <p className="text-xs text-encre-3 mt-1">
            {/*
              La résistance annoncée par le constructeur se lit, elle ne
              s'ajoute pas : inclinaison, bras de levier et cames font qu'elle
              n'est pas une masse qu'on additionne à la charge saisie.
            */}
            Résistance de l&apos;appareil à vide : {exercice.poidsNonCompte} kg, non comptée dans la saisie
          </p>
        ) : null}

        {exercice.seriesPrevuesAvantAjustement != null &&
          exercice.seriesPrevuesAvantAjustement !== exercice.seriesCibles && (
            <p className="text-xs text-encre-3 mt-2">
              {exercice.seriesCibles} séries au lieu de {exercice.seriesPrevuesAvantAjustement} — volume réduit aujourd&apos;hui
            </p>
          )}
      </div>

      {/* Ouvrir le détail reste possible même sans aucune donnée : c'est là
          qu'on renseigne un réglage pour la première fois. */}
      {contexte && (
        <button
          type="button"
          onClick={() => setFiche(true)}
          className="w-full px-3.5 pb-3 text-left text-xs text-encre-3 underline underline-offset-4"
        >
          {contexte.reglages.length > 0 ? "Réglages et technique" : "Technique et note"}
        </button>
      )}

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
