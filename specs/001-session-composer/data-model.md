# Modèle de données

## Brouillon de séance (client)

```ts
type SessionDraft = {
  id: string;
  origin: "blank" | "duplicate" | "coach";
  sourceTemplateId?: string;
  name: string;
  letter: string;
  gymId: string;
  durationMinutes?: number;
  exercises: SessionDraftExercise[];
};
```

Le brouillon n'est pas écrit en base avant le choix de portée.

## Exercice prescrit

```ts
type SessionDraftExercise = {
  clientId: string;
  exerciseId: string;
  order: number;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  tempo: string;
  restSeconds: number;
};
```

Les champs correspondent aux colonnes de `exercise_in_template`. Aucune charge n'est saisie ici : elle reste calculée par le Live.

## Portée

```ts
type SessionScope =
  | { type: "today" }
  | { type: "replace_next"; rotationTemplateId: string }
  | { type: "program" };
```

## Persistance existante réutilisée

- `programme_blocs` : bloc actif permanent ou bloc inactif des séances libres.
- `seance_templates` : gabarit complet, avec UUID fourni par le brouillon.
- `exercise_in_template` : prescription ordonnée.
- `session_logs` : réalisation et progression de rotation.
- `session_plan_items` : contenu réellement exécuté après adaptation.
- `coach_propositions` : proposition complète en attente, refusée, appliquée ou expirée.

## Proposition Coach de construction

```ts
type CoachSessionBuildParams = {
  draftId: string;
  name: string;
  letter: string;
  gymId: string;
  durationMinutes?: number;
  exercises: Array<{
    exerciseId: string;
    sets: number;
    repMin: number;
    repMax: number;
    targetRir: number;
    tempo: string;
    restSeconds: number;
  }>;
};
```

La proposition est associée à la conversation. L'application transactionnelle crée un gabarit permanent dans le bloc actif après revalidation.

## Invariants

- Chaque gabarit et chaque exercice appartiennent à l'utilisateur authentifié.
- Un gabarit ponctuel n'appartient jamais au bloc actif.
- `rotationTemplateId`, s'il existe, désigne la prochaine séance du bloc actif du même utilisateur.
- L'ordre des exercices est normalisé en entiers consécutifs.
- Un brouillon vide ou avec matériel incompatible n'est jamais persisté.
- Une proposition Coach expirée ou déjà traitée ne peut pas être appliquée une seconde fois.
