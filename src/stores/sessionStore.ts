import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  // Completion tracking
  completedAt: number | null;
  // Last action timestamp for proactive checks
  lastActionTimestamp: number;
  // Skipped exercise instance IDs
  skippedExerciseIds: string[];
  // RPE reductions (exerciseInstanceId -> rpe reduction amount)
  rpeReductions: Record<string, number>;
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
  start: (s: Omit<ActiveSession, "startedAt" | "sets" | "currentExerciseIndex" | "notesSeance" | "restStartTimestamp" | "restDurationSeconds" | "restExerciseIndex" | "completedAt" | "lastActionTimestamp" | "skippedExerciseIds" | "rpeReductions" | "tempoParExercice" | "shownProactiveAlerts">) => void;
  upsertSet: (set: DraftSet) => void;
  removeSet: (exerciseInstanceId: string, numeroSerie: number) => void;
  setCurrentExerciseIndex: (i: number) => void;
  setNotes: (notes: string) => void;
  // Rest timer actions
  startRest: (durationSeconds: number, exerciseIndex: number) => void;
  clearRest: () => void;
  extendRest: (extraSeconds: number) => void;
  // Session completion
  complete: () => void;
  clear: () => void;
  // SOS actions
  /** Propage un signalement de tempo à toutes les séries déjà saisies d'un exercice. */
  signalerTempo: (exerciseInstanceId: string, respecte: boolean | null) => void;
  skipExercises: (ids: string[]) => void;
  allegerExercises: (ids: string[]) => void;
  updateLastAction: () => void;
  addProactiveAlertShown: (type: string) => void;
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
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
          completedAt: null,
          lastActionTimestamp: Date.now(),
          skippedExerciseIds: [],
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
        return { active: { ...state.active, sets, lastActionTimestamp: Date.now() } };
      }),
      // Decocher une serie validee par erreur n'etait pas possible : le store
      // ne savait qu'ajouter ou remplacer.
      removeSet: (exerciseInstanceId, numeroSerie) => set((state) => {
        if (!state.active) return state;
        const sets = state.active.sets.filter(
          (s) => !(s.exerciseInstanceId === exerciseInstanceId && s.numeroSerie === numeroSerie),
        );
        return { active: { ...state.active, sets, lastActionTimestamp: Date.now() } };
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
