import { create } from "zustand";
import { persist } from "zustand/middleware";
import { pousserSerie, retirerSerieEnVol, revisionSuivante } from "@/components/session/serie-en-vol";
import {
  noterSubstitution as noterSubstitutionDansLignees, type LigneeSlot,
} from "@/lib/live/vue-live";

/**
 * La persistance serveur est branchée ICI, et pas dans les écrans.
 *
 * Le store est le seul endroit que Focus, Liste et les SOS traversent tous.
 * Brancher l'envoi dans `TableauSeries` aurait marché tant qu'une seule vue
 * existait ; avec deux, il aurait fallu l'écrire deux fois, et la première
 * divergence aurait été silencieuse — une série validée en Focus persistée,
 * la même corrigée en Liste non.
 *
 * L'envoi ne bloque rien : `pousserSerie` ne rend même pas de promesse. Le
 * store écrit d'abord en local, l'écran se met à jour, et la requête part
 * derrière avec `keepalive`. Voir `components/session/serie-en-vol.ts`.
 */
const envoiDesactive = { actif: true };

/** Permet aux tests de couper le réseau sans mocker tout le module. */
export function suspendrePersistanceSerie(suspendu: boolean) {
  envoiDesactive.actif = !suspendu;
}

export type DraftSet = {
  exerciseInstanceId: string;
  numeroSerie: number;
  repsEffectuees: number | null;
  charge: number | null;
  rpeEffectif: number | null;
  notes?: string;
  validatedAt?: number;
  reposReelSecondes?: number | null;
  /**
   * `false` seulement si l'athlète a signalé que le tempo prescrit n'a pas été
   * tenu. Jamais `true` par défaut : un tempo non commenté reste inconnu.
   */
  tempoRespecte?: boolean | null;
  /**
   * Le repos qui précède cette série a-t-il été écourté volontairement ?
   *
   * L'intervalle réel (`reposReelSecondes`) dit déjà COMBIEN de temps s'est
   * écoulé, et c'est lui la trace durable — cette intention-là n'a pas de
   * colonne et n'en demande pas. Mais un « Passer » suivi de trois minutes
   * d'attente ne se lit pas dans l'intervalle : l'intention et la durée sont
   * deux faits distincts, et le Coach a besoin des deux pendant la séance.
   */
  reposIgnore?: boolean;
};

export type ActiveSession = {
  id: string;
  seanceTemplateId: string;
  gymId: string;
  startedAt: number;
  sets: DraftSet[];
  currentExerciseIndex: number;
  notesSeance: string;
  // Rest timer state
  restStartTimestamp: number | null;
  restDurationSeconds: number | null;
  restExerciseIndex: number | null;
  /** « Passer » a été touché depuis le début de ce repos. */
  restSkipped: boolean;
  // Completion tracking
  completedAt: number | null;
  // Last action timestamp for proactive checks
  lastActionTimestamp: number;
  // Skipped exercise instance IDs
  skippedExerciseIds: string[];
  /** Exercices temporairement remis à plus tard, sans toucher à leurs séries. */
  deferredExerciseIds?: string[];
  /** Lignes supplémentaires demandées dans le Live, partagées par Focus/Liste. */
  additionalSetCounts?: Record<string, number>;
  // RPE reductions (exerciseInstanceId -> rpe reduction amount)
  rpeReductions: Record<string, number>;
  /**
   * Les lignées de slots de prescription — voir `lib/live/vue-live.ts`.
   *
   * Persistées avec le reste du brouillon : sans elles, un rafraîchissement
   * après substitution perdrait la mémoire du slot, et la nouvelle machine
   * redemanderait les séries déjà faites sur l'ancienne.
   *
   * Facultatif à la lecture : un brouillon écrit avant ce lot n'en a pas, et
   * doit continuer de s'ouvrir.
   */
  lignees?: LigneeSlot[];
  /**
   * Tempo signalé par exercice. Absent = rien n'a été dit, et c'est le cas
   * courant : on ne demande pas confirmation, on offre de signaler un écart.
   */
  tempoParExercice: Record<string, boolean>;
  // Already shown proactive alerts
  shownProactiveAlerts: string[];
};

type SessionStore = {
  active: ActiveSession | null;
  /**
   * `id` doit etre l'identifiant reel de la ligne session_logs creee en base.
   * Le store generait auparavant un UUID local, decorrele de la base : tout
   * appel utilisant cet id (enregistrement d'incident, cloture) echouait en 403.
   */
  start: (s: Omit<ActiveSession, "startedAt" | "sets" | "currentExerciseIndex" | "notesSeance" | "restStartTimestamp" | "restDurationSeconds" | "restExerciseIndex" | "restSkipped" | "completedAt" | "lastActionTimestamp" | "skippedExerciseIds" | "deferredExerciseIds" | "additionalSetCounts" | "rpeReductions" | "lignees" | "tempoParExercice" | "shownProactiveAlerts">) => void;
  upsertSet: (set: DraftSet) => void;
  /** Remplace le brouillon par ce que la base porte — voir `hydraterDepuisServeur`. */
  hydraterSets: (sets: DraftSet[]) => void;
  /** Repose les lignées de substitution telles que le SERVEUR les connaît. */
  hydraterLignees: (lignees: string[][]) => void;
  removeSet: (exerciseInstanceId: string, numeroSerie: number) => void;
  setCurrentExerciseIndex: (i: number) => void;
  setNotes: (notes: string) => void;
  // Rest timer actions
  startRest: (durationSeconds: number, exerciseIndex: number) => void;
  clearRest: () => void;
  skipRest: () => void;
  extendRest: (extraSeconds: number) => void;
  // Session completion
  complete: () => void;
  clear: () => void;
  // SOS actions
  /** Propage un signalement de tempo à toutes les séries déjà saisies d'un exercice. */
  signalerTempo: (exerciseInstanceId: string, respecte: boolean | null) => void;
  skipExercises: (ids: string[]) => void;
  deferExercise: (id: string) => void;
  hydraterDeferredExercises: (ids: string[]) => void;
  addAdditionalSet: (id: string, currentCount: number) => void;
  removeAdditionalSet: (id: string, currentCount: number) => void;
  /** Enregistre une substitution : l'ancienne entrée garde ses séries. */
  noterSubstitution: (ancienId: string, nouveauId: string) => void;
  allegerExercises: (ids: string[]) => void;
  updateLastAction: () => void;
  addProactiveAlertShown: (type: string) => void;
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      active: null,
      start: (data) => set({
        active: {
          ...data,
          startedAt: Date.now(),
          sets: [],
          currentExerciseIndex: 0,
          notesSeance: "",
          restStartTimestamp: null,
          restDurationSeconds: null,
          restExerciseIndex: null,
          restSkipped: false,
          completedAt: null,
          lastActionTimestamp: Date.now(),
          skippedExerciseIds: [],
          deferredExerciseIds: [],
          additionalSetCounts: {},
          rpeReductions: {},
          tempoParExercice: {},
          shownProactiveAlerts: [],
        },
      }),
      upsertSet: (newSet) => set((state) => {
        if (!state.active) return state;
        const existing = state.active.sets.findIndex(
          s => s.exerciseInstanceId === newSet.exerciseInstanceId && s.numeroSerie === newSet.numeroSerie
        );
        const sets = [...state.active.sets];
        if (existing >= 0) sets[existing] = newSet;
        else sets.push(newSet);

        /*
         * La base apprend la série tout de suite.
         *
         * Avant, rien n'atteignait Postgres avant l'écran de fin : une heure
         * d'entraînement tenait dans le `localStorage`, et un crash de Safari
         * l'effaçait entièrement. Seules les séries qui MESURENT quelque chose
         * partent — une ligne à moitié saisie n'a rien à persister, et le
         * serveur la refuserait.
         */
        if (envoiDesactive.actif
          && newSet.repsEffectuees !== null && newSet.charge !== null) {
          pousserSerie(state.active.id, {
            /*
             * La révision est prise ICI, au moment du geste — pas à l'envoi.
             *
             * C'est ce qui rend inoffensive une reprise réseau qui aboutirait
             * après une correction : elle porte la révision de son intention
             * d'origine, et le serveur la refuse.
             */
            revision: revisionSuivante(),
            exerciseInstanceId: newSet.exerciseInstanceId,
            numeroSerie: newSet.numeroSerie,
            repsEffectuees: newSet.repsEffectuees,
            charge: newSet.charge,
            rpeEffectif: newSet.rpeEffectif,
            tempoRespecte: newSet.tempoRespecte,
            reposReelSecondes: newSet.reposReelSecondes,
            notes: newSet.notes ?? null,
          });
        }

        return { active: { ...state.active, sets, lastActionTimestamp: Date.now() } };
      }),
      // Decocher une serie validee par erreur n'etait pas possible : le store
      // ne savait qu'ajouter ou remplacer.
      removeSet: (exerciseInstanceId, numeroSerie) => set((state) => {
        if (!state.active) return state;
        const sets = state.active.sets.filter(
          (s) => !(s.exerciseInstanceId === exerciseInstanceId && s.numeroSerie === numeroSerie),
        );
        // Décocher retire aussi la ligne en base : sans cela, elle
        // ressusciterait à la reprise après un crash.
        if (envoiDesactive.actif) {
          // Une suppression est une intention comme une autre : elle porte sa
          // révision, et elle empêche un vieux POST de ressusciter la série.
          retirerSerieEnVol(state.active.id, {
            revision: revisionSuivante(), exerciseInstanceId, numeroSerie,
          });
        }
        return { active: { ...state.active, sets, lastActionTimestamp: Date.now() } };
      }),
      /*
       * La reprise : ce que la BASE porte fait autorité.
       *
       * Une série absente du brouillon mais présente en base — l'onglet est
       * tombé après l'envoi — est restaurée. Une série présente des deux côtés
       * garde la version LOCALE : c'est la plus récente, l'envoi part après
       * l'écriture locale. Rien n'est supprimé : une série locale que le
       * serveur n'a pas encore reçue survit à la fusion.
       */
      hydraterSets: (duServeur) => set((state) => {
        if (!state.active) return state;
        const cle = (s: DraftSet) => `${s.exerciseInstanceId}#${s.numeroSerie}`;
        const connues = new Set(state.active.sets.map(cle));
        const manquantes = duServeur.filter((s) => !connues.has(cle(s)));
        if (manquantes.length === 0) return state;
        return { active: { ...state.active, sets: [...state.active.sets, ...manquantes] } };
      }),
      /*
       * Les lignées viennent du PLAN SERVEUR, pas seulement du brouillon.
       *
       * Le store persisté suffisait à un rafraîchissement, pas à un
       * `localStorage` purgé par Safari ni à une reprise depuis un autre
       * contexte. Or les séries, elles, sont relues depuis Postgres : sans
       * lignée serveur, la machine substituée repartait à 0/3 alors qu'une
       * série avait bien été soulevée.
       *
       * Le serveur fait autorité ici — c'est lui qui a enregistré la
       * substitution. Une lignée locale que le plan ne connaît pas est
       * conservée : elle vient d'un remplacement dont l'écriture n'a pas
       * encore abouti.
       */
      hydraterLignees: (duServeur) => set((state) => {
        if (!state.active) return state;
        const utiles = duServeur.filter((l) => l.length > 1);
        const connues = new Set(utiles.map((l) => l[0]!));
        const locales = (state.active.lignees ?? []).filter((l) => !connues.has(l.origine));
        const reconstruites = utiles.map((instances) => ({
          origine: instances[0]!, instances,
        }));
        return { active: { ...state.active, lignees: [...reconstruites, ...locales] } };
      }),
      setCurrentExerciseIndex: (i) => set((state) =>
        state.active ? { active: { ...state.active, currentExerciseIndex: i } } : state
      ),
      setNotes: (notes) => set((state) =>
        state.active ? { active: { ...state.active, notesSeance: notes } } : state
      ),
      startRest: (durationSeconds, exerciseIndex) => set((state) =>
        state.active ? {
          active: {
            ...state.active,
            restStartTimestamp: Date.now(),
            restDurationSeconds: durationSeconds,
            restExerciseIndex: exerciseIndex,
            // Un nouveau repos commence : l'intention précédente ne le concerne pas.
            restSkipped: false,
          }
        } : state
      ),
      // Masquer le compte à rebours n'est pas cesser de mesurer.
      //
      // Cette action effaçait `restStartTimestamp`, et la série suivante
      // enregistrait donc `null` alors que le repos avait bien eu lieu : fermer
      // le minuteur détruisait la mesure. Seule la durée cible s'efface — c'est
      // elle qui pilote l'affichage. L'instant de départ, lui, sert à mesurer
      // et survit à la fermeture.
      clearRest: () => set((state) =>
        state.active ? {
          active: { ...state.active, restDurationSeconds: null },
        } : state
      ),
      /**
       * « Passer » : masquer le minuteur ET retenir que ça a été voulu.
       *
       * Le geste passait par `clearRest`, indistinguable d'une simple
       * fermeture : le repos écourté ne laissait aucune trace exploitable
       * pendant la séance. La mesure, elle, continue — `restStartTimestamp`
       * n'est pas touché.
       */
      skipRest: () => set((state) =>
        state.active ? {
          active: { ...state.active, restDurationSeconds: null, restSkipped: true },
        } : state
      ),
      extendRest: (extraSeconds) => set((state) => {
        if (!state.active?.restStartTimestamp || !state.active?.restDurationSeconds) return state;
        return {
          active: {
            ...state.active,
            restDurationSeconds: state.active.restDurationSeconds + extraSeconds,
          }
        };
      }),
      complete: () => set((state) =>
        state.active ? { active: { ...state.active, completedAt: Date.now() } } : state
      ),
      clear: () => set({ active: null }),
      // Le signalement porte sur l'EXERCICE, pas sur la série : personne ne juge
      // un tempo série par série. Il est donc rangé à part et appliqué à la
      // clôture — muter les séries déjà saisies laisserait sans valeur celles
      // validées APRÈS le signalement, et l'ordre des gestes déciderait du
      // résultat.
      signalerTempo: (exerciseInstanceId, respecte) => set((state) => {
        if (!state.active) return state;
        const carte = { ...(state.active.tempoParExercice ?? {}) };
        if (respecte === null) delete carte[exerciseInstanceId];
        else carte[exerciseInstanceId] = respecte;
        return { active: { ...state.active, tempoParExercice: carte, lastActionTimestamp: Date.now() } };
      }),
      /*
       * Une substitution ne remplace pas l'exercice : elle ALLONGE sa lignée.
       *
       * L'ancienne entrée porte les séries déjà faites et continue d'occuper
       * les slots qu'elle a consommés. C'est ce qui empêche la nouvelle machine
       * de redemander S1 quand S1 a déjà été soulevée sur l'ancienne.
       */
      noterSubstitution: (ancienId, nouveauId) => set((state) =>
        state.active ? {
          active: {
            ...state.active,
            lignees: noterSubstitutionDansLignees(
              state.active.lignees ?? [], ancienId, nouveauId,
            ),
            deferredExerciseIds: (state.active.deferredExerciseIds ?? []).map((id) =>
              id === ancienId ? nouveauId : id,
            ),
            additionalSetCounts: Object.fromEntries(
              Object.entries(state.active.additionalSetCounts ?? {}).map(([id, n]) => [
                id === ancienId ? nouveauId : id,
                n,
              ]),
            ),
            lastActionTimestamp: Date.now(),
          },
        } : state
      ),
      // SOS actions
      skipExercises: (ids) => set((state) =>
        state.active ? {
          active: {
            ...state.active,
            skippedExerciseIds: [...(state.active.skippedExerciseIds ?? []), ...ids],
            lastActionTimestamp: Date.now(),
          }
        } : state
      ),
      deferExercise: (id) => set((state) => {
        if (!state.active) return state;
        const ids = new Set(state.active.deferredExerciseIds ?? []);
        ids.add(id);
        return {
          active: {
            ...state.active,
            deferredExerciseIds: [...ids],
            lastActionTimestamp: Date.now(),
          },
        };
      }),
      hydraterDeferredExercises: (ids) => set((state) => {
        if (!state.active) return state;
        return {
          active: {
            ...state.active,
            deferredExerciseIds: [...new Set([...(state.active.deferredExerciseIds ?? []), ...ids])],
          },
        };
      }),
      addAdditionalSet: (id, currentCount) => set((state) => {
        if (!state.active) return state;
        const compteurs = { ...(state.active.additionalSetCounts ?? {}) };
        compteurs[id] = Math.max(compteurs[id] ?? 0, currentCount) + 1;
        return { active: { ...state.active, additionalSetCounts: compteurs } };
      }),
      removeAdditionalSet: (id, currentCount) => set((state) => {
        if (!state.active) return state;
        const compteurs = { ...(state.active.additionalSetCounts ?? {}) };
        compteurs[id] = Math.max(0, currentCount - 1);
        return { active: { ...state.active, additionalSetCounts: compteurs } };
      }),
      allegerExercises: (ids) => set((state) => {
        if (!state.active) return state;
        const newReductions = { ...(state.active.rpeReductions ?? {}) };
        for (const id of ids) {
          newReductions[id] = (newReductions[id] || 0) + 2;
        }
        return { active: { ...state.active, rpeReductions: newReductions, lastActionTimestamp: Date.now() } };
      }),
      updateLastAction: () => set((state) =>
        state.active ? { active: { ...state.active, lastActionTimestamp: Date.now() } } : state
      ),
      addProactiveAlertShown: (type) => set((state) =>
        state.active ? {
          active: {
            ...state.active,
            shownProactiveAlerts: [...(state.active.shownProactiveAlerts ?? []), type],
          }
        } : state
      ),
    }),
    { name: "active-session" }
  )
);
