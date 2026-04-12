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
  // Already shown proactive alerts
  shownProactiveAlerts: string[];
};

type SessionStore = {
  active: ActiveSession | null;
  start: (s: Omit<ActiveSession, "id" | "startedAt" | "sets" | "currentExerciseIndex" | "notesSeance" | "restStartTimestamp" | "restDurationSeconds" | "restExerciseIndex" | "completedAt" | "lastActionTimestamp" | "skippedExerciseIds" | "rpeReductions" | "shownProactiveAlerts">) => void;
  upsertSet: (set: DraftSet) => void;
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
          id: crypto.randomUUID(),
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
      clearRest: () => set((state) =>
        state.active ? {
          active: {
            ...state.active,
            restStartTimestamp: null,
            restDurationSeconds: null,
            restExerciseIndex: null,
          }
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
