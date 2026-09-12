"use client";
import { useMemo } from "react";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import type { ExercicePrescrit } from "./types";
import { effortSaisi, champEffortInitial } from "./effort-propose";
import {
  LIBELLES_MOTIF_INVALIDE,
  motifSerieInvalide,
} from "@/lib/engine/serie-realisee";
import { chargeAEnregistrer } from "@/lib/validators/exercise-instance";
import { alerteChargeIrrealisable } from "./crans-de-charge";
import { derniereLigneRetirable, lignesAAfficher } from "./lignes-de-series";
import {
  avancementDeLaLignee,
  ligneeDe,
  slotsARemplir,
  type LigneeSlot,
} from "@/lib/live/vue-live";

/**
 * Tout ce qu'une vue doit SAVOIR et POUVOIR FAIRE d'un exercice — sans rien
 * décider de son apparence.
 *
 * POURQUOI CE HOOK EXISTE
 *
 * Focus et Liste ne répondent pas au même besoin. La Liste est un carnet : on
 * voit toute la séance, on corrige n'importe quelle série, on scanne ce qui
 * reste. Le Focus est un lecteur : un exercice, une série, un geste. Les forcer
 * à partager le même DOM — ce que faisait la première version, où le Focus
 * n'était qu'un `TableauSeries` avec un exercice au lieu de six — donnait deux
 * vues quasi identiques dont l'une ne servait à rien.
 *
 * Ce qu'il ne faut PAS dupliquer, en revanche, c'est ce qui décide : quelles
 * lignes existent, ce qu'une ligne affiche, ce qu'une validation enregistre,
 * ce qu'elle refuse. Deux copies de cette logique divergent — une validation
 * plus permissive d'un côté, un brouillon qui prime de l'autre — et la
 * divergence ne se voit qu'en séance.
 *
 * D'où ce hook : UN contrôleur, DEUX compositions. La synchronisation entre les
 * vues ne vient pas d'un composant commun mais de la donnée commune — le même
 * store, le même calcul, le même geste.
 *
 * CE QU'IL NE FAIT PAS
 *
 * Il ne rend rien, ne choisit aucune charge, ne classe aucune substitution. Le
 * moteur décide déjà ; `vue-live` calcule déjà l'avancement. Il les assemble
 * pour un exercice donné, et s'arrête là.
 */

/** Ce qu'une ligne montre : des chaînes, parce qu'un champ vide n'est pas zéro. */
export interface Brouillon {
  charge: string;
  reps: string;
  rpe: string;
}

/**
 * Ce qu'une validation vient de produire.
 *
 * `exerciceTermine` est décidé ICI, au moment du geste, à partir des séries que
 * l'on vient d'écrire — jamais déduit d'un rendu React qui peut être en retard
 * d'un tour. L'écran qui enchaînerait sur un état périmé passerait à l'exercice
 * suivant une série trop tôt, ou pas du tout.
 */
export interface SerieValidee {
  /** L'entrée réellement validée, indispensable quand Liste affiche tout. */
  exerciseInstanceId: string;
  /** Le repos prescrit pour cet exercice, `null` s'il n'y en a pas. */
  reposSecondes: number | null;
  /** Cette validation vient-elle de remplir la prescription de l'exercice ? */
  exerciceTermine: boolean;
}

interface Options {
  exercice: ExercicePrescrit;
  rpeReduction: number;
  /** En calibration, la réserve de répétitions remplace le RPE. */
  modeReserve: boolean;
  /** Déclenché à chaque série validée, pour lancer le repos et enchaîner. */
  onSerieValidee: (resultat: SerieValidee) => void;
}

export function useSaisieSeries({
  exercice,
  rpeReduction,
  modeReserve,
  onSerieValidee,
}: Options) {
  const {
    upsertSet,
    removeSet,
    addAdditionalSet,
    removeAdditionalSet,
    active,
  } = useSessionStore();

  const seriesSaisies = useMemo(
    () => (active?.sets ?? []).filter((s) => s.exerciseInstanceId === exercice.id),
    [active?.sets, exercice.id],
  );

  // Des séries peuvent avoir été ajoutées au-delà de la prescription.
  const seriesEnPlus = Math.max(
    active?.additionalSetCounts?.[exercice.id] ?? 0,
    ...seriesSaisies.map((s) => Math.max(0, s.numeroSerie - exercice.seriesCibles)),
  );
  const brouillons = active?.saisiesEnCours?.[exercice.id] ?? {};
  const setBrouillons = (modifier: (actuels: Record<number, Brouillon>) => Record<number, Brouillon>) => {
    const store = useSessionStore.getState();
    store.memoriserSaisies(exercice.id, modifier(store.active?.saisiesEnCours?.[exercice.id] ?? {}));
  };
  const setRessenti = (numero: number | null) => useSessionStore.getState().memoriserEtapeRessenti(exercice.id, numero);

  /** Le slot de prescription : il survit aux substitutions, l'entrée non. */
  const lignee: LigneeSlot = ligneeDe(active?.lignees ?? [], exercice.id);
  const etatDesLignes = {
    seriesCibles: exercice.seriesCibles,
    seriesEnPlus,
    instanceCourante: exercice.id,
    lignee,
    series: active?.sets ?? [],
  };

  /*
   * Les lignes rendues — PAS les slots restants.
   *
   * La confusion entre les deux faisait disparaître une série au moment même
   * où on la validait. Voir `lignes-de-series.ts`.
   */
  const lignes = lignesAAfficher(etatDesLignes);
  const derniereEnPlus = derniereLigneRetirable(etatDesLignes);

  /** L'avancement du slot, toutes machines confondues. */
  const avancement = avancementDeLaLignee(
    lignee,
    active?.sets ?? [],
    exercice.seriesCibles,
  );

  // Vide quand aucun effort n'est prescrit : le champ pré-rempli à 8 partait
  // en base à la validation, sans que personne l'ait ressenti ni saisi.
  const rpeParDefaut = champEffortInitial(
    modeReserve,
    exercice.rpeCible,
    rpeReduction,
  );
  const sansRepereComparable = (exercice.historique ?? []).length === 0;
  const chargeParDefaut = modeReserve && sansRepereComparable
    ? exercice.premiereCharge?.charge ?? null
    : exercice.chargeSuggeree ?? exercice.historique?.[0]?.charge ?? null;

  /** Valeurs proposées pour une ligne, avant toute saisie de l'utilisateur. */
  const proposition = (numero: number): Brouillon => ({
    charge: chargeParDefaut != null ? String(chargeParDefaut) : "",
    reps: String(exercice.repsSuggerees?.[numero - 1] ?? exercice.fourchetteRepsMin),
    rpe: rpeParDefaut,
  });

  const serieEnregistree = (numero: number) =>
    seriesSaisies.find((s) => s.numeroSerie === numero);

  const estValidee = (numero: number) => serieEnregistree(numero) !== undefined;

  /**
   * Ce qu'affiche une ligne — et ce que la base en garde.
   *
   * Le brouillon primait sur la série enregistrée, même APRÈS validation :
   * valider une série puis en modifier la charge affichait la nouvelle valeur
   * pendant que le store — donc la base à la clôture — gardait l'ancienne. Une
   * ligne verte pouvait donc montrer 60 kg là où 45 seraient enregistrés.
   *
   * Une série validée lit désormais la saisie enregistrée, un point c'est
   * tout. Le brouillon ne sert qu'aux lignes pas encore validées.
   */
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
    setBrouillons((b) => ({
      ...b,
      [numero]: { ...valeurs(numero), [champ]: valeur },
    }));

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

  /**
   * Valider une série, ou rouvrir celle qui l'est déjà.
   *
   * Un seul geste pour les deux sens : c'est le même bouton en Liste, le même
   * couple « Valider » / « Modifier » en Focus.
   */
  const basculer = (numero: number) => {
    const enregistree = serieEnregistree(numero);
    if (enregistree) {
      /*
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
          reps:
            enregistree.repsEffectuees != null
              ? String(enregistree.repsEffectuees)
              : "",
          rpe:
            enregistree.rpeEffectif != null ? String(enregistree.rpeEffectif) : "",
        },
      }));
      removeSet(exercice.id, numero);
      return;
    }

    const v = valeurs(numero);
    const charge = chargeAEnregistrer(v.charge, exercice.conventionCharge);
    const reps = Number.parseInt(v.reps, 10);

    /*
     * Le refus est ici AUSSI, pas seulement au serveur.
     *
     * Valider une ligne vide cochait la case, lançait le repos et faisait
     * avancer le compteur ; la série disparaissait silencieusement à la
     * clôture. L'écran affichait donc une séance que la base n'a jamais eue.
     */
    const motif = motifSerieInvalide(
      {
        repsEffectuees: Number.isFinite(reps) ? reps : null,
        charge,
        rpeEffectif: effortSaisi(v.rpe),
      },
      {
        conventionCharge: exercice.conventionCharge,
        natureCharge: exercice.natureCharge,
      },
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

    /*
     * L'exercice est-il terminé PAR CETTE validation ?
     *
     * On recalcule les slots avec la série qu'on vient d'écrire, plutôt que de
     * relire `avancement` — celui-ci vient du rendu courant, donc d'AVANT
     * l'écriture. S'y fier ferait enchaîner l'écran avec une série de retard.
     *
     * Une série hors prescription ne termine rien : la prescription était déjà
     * remplie avant elle, et l'enchaînement a déjà eu lieu.
     */
    const apres = [
      ...(active?.sets ?? []).filter(
        (s) => !(s.exerciseInstanceId === exercice.id && s.numeroSerie === numero),
      ),
      {
        exerciseInstanceId: exercice.id,
        numeroSerie: numero,
        repsEffectuees: Number.isFinite(reps) ? reps : null,
        charge,
      },
    ];
    const exerciceTermine =
      numero <= exercice.seriesCibles &&
      slotsARemplir(lignee, apres, exercice.seriesCibles).length === 0;

    setRessenti(null);
    onSerieValidee({
      exerciseInstanceId: exercice.id,
      reposSecondes: exercice.reposSecondes ?? null,
      exerciceTermine,
    });
  };

  const ajouterUneSerie = () => {
    const numero = exercice.seriesCibles + seriesEnPlus + 1;
    addAdditionalSet(exercice.id, seriesEnPlus);
    toast.success(`SÉRIE ${numero} AJOUTÉE`);
  };

  const retirerLaDerniereSerie = () => {
    if (derniereEnPlus === null) return;
    const validee = estValidee(derniereEnPlus);
    if (validee && !confirm(`Supprimer la série ${derniereEnPlus} déjà validée ?`))
      return;

    // L'ordre compte : retirer la série enregistrée AVANT de réduire le
    // compteur, sinon le calcul des lignes la fait réapparaître aussitôt.
    if (validee) removeSet(exercice.id, derniereEnPlus);
    setBrouillons((courants) => {
      const reste = { ...courants };
      delete reste[derniereEnPlus];
      return reste;
    });
    // La prescription ne bouge pas : `seriesCibles` reste ce que le moteur a
    // décidé, on ne touche qu'au nombre de lignes ajoutées.
    removeAdditionalSet(exercice.id, seriesEnPlus);
  };

  /**
   * La série qu'on est en train de faire — la première ligne non validée.
   *
   * `null` quand tout est validé : il n'y a alors plus de « prochaine série »,
   * et l'écran doit dire que l'exercice est terminé plutôt que d'ouvrir un
   * formulaire que rien ne remplira.
   */
  const serieCourante = lignes.find((n) => !estValidee(n)) ?? null;

  /**
   * Une charge que l'appareil ne produit pas.
   *
   * Elle n'est PAS remplacée en silence : la corriger d'autorité ferait
   * enregistrer autre chose que ce qui a été soulevé.
   */
  const alerte =
    serieCourante === null
      ? null
      : alerteChargeIrrealisable(exercice, valeurs(serieCourante).charge);

  return {
    lignes,
    serieCourante,
    ressenti: serieCourante !== null && active?.ressentisEnCours?.[exercice.id] === serieCourante,
    setRessenti,
    /** Vrai quand la prescription est remplie — voir `serieCourante`. */
    exerciceTermine: serieCourante === null && lignes.length > 0,
    /** Vrai quand ce slot a été rempli ailleurs : rien à demander ici. */
    slotRempliAilleurs: lignes.length === 0,
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
    seriesSaisies,
  };
}
