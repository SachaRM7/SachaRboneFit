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
};

export type ActiveSession = {
  id: string;
  seanceTemplateId: string;
  gymId: string;
  startedAt: number;
  sets: DraftSet[];
  currentExerciseIndex: number;
  notesSeance: string;
};

type SessionStore = {
  active: ActiveSession | null;
  start: (s: Omit<ActiveSession, "id" | "startedAt" | "sets" | "currentExerciseIndex" | "notesSeance">) => void;
  upsertSet: (set: DraftSet) => void;
  setCurrentExerciseIndex: (i: number) => void;
  setNotes: (notes: string) => void;
  clear: () => void;
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
        return { active: { ...state.active, sets } };
      }),
      setCurrentExerciseIndex: (i) => set((state) =>
        state.active ? { active: { ...state.active, currentExerciseIndex: i } } : state
      ),
      setNotes: (notes) => set((state) =>
        state.active ? { active: { ...state.active, notesSeance: notes } } : state
      ),
      clear: () => set({ active: null }),
    }),
    { name: "active-session" }
  )
);
