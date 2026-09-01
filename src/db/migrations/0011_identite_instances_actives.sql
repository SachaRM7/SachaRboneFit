-- Une même possibilité physique ne doit avoir qu'une ligne active par salle.
--
-- L'index est partiel : archiver une ancienne description permet d'en créer
-- une nouvelle sans réutiliser ni réinterpréter son historique. Avant de poser
-- la contrainte, on refuse explicitement une base déjà ambiguë; choisir et
-- archiver automatiquement l'une des lignes détruirait une décision terrain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM exercise_instances
    WHERE archive_le IS NULL
    GROUP BY gym_id, exercise_id, machine_nom
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'exercise_instances contient des identités actives dupliquées; les archiver manuellement avant cette migration';
  END IF;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "exercise_instances_active_identity_unique"
  ON "exercise_instances" ("gym_id", "exercise_id", "machine_nom")
  WHERE "archive_le" IS NULL;
