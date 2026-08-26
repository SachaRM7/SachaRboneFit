-- Unification du vocabulaire musculaire.
--
-- Trois vocabulaires incompatibles coexistaient :
--   exercises.muscles_principaux  : "pecs", "dos", "quads", "epaule_ant"...
--   daily_states.courbatures      : "Pectoraux", "Dorsaux", "Quadriceps"...
--   lib/sos/douleur.ts            : "deltoide anterieur", "vaste medial"...
--
-- Aucun ne correspondait aux autres, ce qui rendait inoperante toute la chaine
-- courbatures / douleurs -> adaptation de seance. Cette migration ramene les
-- donnees existantes au referentiel unique de src/lib/referentiels/muscles.ts.
--
-- Idempotente : rejouable sans effet sur des donnees deja converties.

-- 1. exercises.muscles_principaux (tableau JSONB de chaines)
UPDATE exercises
SET muscles_principaux = (
  SELECT jsonb_agg(DISTINCT canonique ORDER BY canonique)
  FROM (
    SELECT CASE valeur
      WHEN 'pecs'        THEN 'pectoraux'
      WHEN 'dos'         THEN 'dorsaux'
      WHEN 'quads'       THEN 'quadriceps'
      WHEN 'epaule'      THEN 'epaules'
      WHEN 'epaule_ant'  THEN 'epaules'
      WHEN 'epaule_lat'  THEN 'epaules'
      WHEN 'epaule_post' THEN 'deltoide_posterieur'
      WHEN 'rotateurs'   THEN 'deltoide_posterieur'
      ELSE valeur
    END AS canonique
    FROM jsonb_array_elements_text(exercises.muscles_principaux) AS valeur
  ) AS converti
)
WHERE muscles_principaux IS NOT NULL
  AND jsonb_typeof(muscles_principaux) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(exercises.muscles_principaux) AS v
    WHERE v IN ('pecs','dos','quads','epaule','epaule_ant','epaule_lat','epaule_post','rotateurs')
  );
--> statement-breakpoint

-- 2. daily_states.courbatures (tableau JSONB d'objets {muscle, intensite})
UPDATE daily_states
SET courbatures = (
  SELECT jsonb_agg(
    jsonb_set(
      element,
      '{muscle}',
      to_jsonb(CASE lower(element ->> 'muscle')
        WHEN 'pectoraux'       THEN 'pectoraux'
        WHEN 'dorsaux'         THEN 'dorsaux'
        WHEN 'trapèzes'        THEN 'haut_dos'
        WHEN 'trapezes'        THEN 'haut_dos'
        WHEN 'épaules'         THEN 'epaules'
        WHEN 'epaules'         THEN 'epaules'
        WHEN 'biceps'          THEN 'biceps'
        WHEN 'triceps'         THEN 'triceps'
        WHEN 'avant-bras'      THEN 'avant_bras'
        WHEN 'quadriceps'      THEN 'quadriceps'
        WHEN 'ischio-jambiers' THEN 'ischios'
        WHEN 'fessiers'        THEN 'fessiers'
        WHEN 'adducteurs'      THEN 'adducteurs'
        WHEN 'mollets'         THEN 'mollets'
        WHEN 'abdominaux'      THEN 'core'
        WHEN 'lombaires'       THEN 'lombaires'
        ELSE element ->> 'muscle'
      END)
    )
  )
  FROM jsonb_array_elements(daily_states.courbatures) AS element
)
WHERE courbatures IS NOT NULL
  AND jsonb_typeof(courbatures) = 'array'
  AND jsonb_array_length(courbatures) > 0;
--> statement-breakpoint

-- 3. session_logs.energie_fin : ramener l'echelle 0-100 sur 1-10.
--
-- L'energie de depart (daily_states.energie_depart) est saisie de 1 a 10, mais
-- l'ecran de fin de seance utilisait un curseur de 0 a 100. Les deux colonnes
-- decrivaient la meme grandeur sur deux echelles, rendant impossible toute
-- comparaison debut/fin de seance.
--
-- Seules les valeurs > 10 sont converties : elles ne peuvent provenir que de
-- l'ancienne echelle. Les valeurs <= 10 sont laissees telles quelles.
UPDATE session_logs
SET energie_fin = GREATEST(1, LEAST(10, ROUND(energie_fin / 10.0)))
WHERE energie_fin IS NOT NULL
  AND energie_fin > 10;
