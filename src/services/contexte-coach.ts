import { db } from "@/db/client";
import {
  exerciseInstances, exercises, programmeBlocs, seanceTemplates, sessionLogs,
} from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { libelleCycle } from "@/lib/referentiels/cycle";
import type { ContexteEcran } from "@/lib/coach/contexte-ecran";
import { vueDuProgramme } from "./cycle";
import { bilanDeProgression } from "./bilan";

/**
 * Résolution du contexte d'écran, côté serveur.
 *
 * Le client envoie une désignation — « écran programme, entité bloc, cet
 * identifiant » — et rien de plus. C'est ici, avec l'utilisateur authentifié,
 * que cette désignation devient des données.
 *
 * Deux raisons de faire ainsi. La première est la sécurité : aucun identifiant
 * d'utilisateur ne transite par le client ni par le modèle, et tout objet
 * désigné est vérifié comme appartenant à la session. La seconde est la
 * sobriété : envoyer l'état complet de l'écran au modèle reviendrait à lui
 * faire relire ce que l'application sait déjà calculer.
 */

/** Ce qui est ajouté au prompt système. Du texte, court, déjà interprété. */
export async function resoudreContexte(
  userId: string,
  contexte: ContexteEcran | null,
): Promise<string | null> {
  if (!contexte) return null;

  const lignes: string[] = [];

  switch (contexte.ecran) {
    case "programme": {
      const vue = await vueDuProgramme(userId);
      if (!vue.cycle) {
        lignes.push("L'athlète regarde son programme : aucun cycle actif.");
        break;
      }
      lignes.push(
        `L'athlète regarde son programme : « ${vue.cycle.nom} » (${vue.cycle.libelle.libelle}), ` +
          `semaine ${vue.cycle.position.semaine}` +
          (vue.cycle.position.semainesTotal ? ` sur ${vue.cycle.position.semainesTotal}` : "") +
          ".",
      );
      if (vue.lecture) {
        lignes.push(
          `Phase mesurée : ${vue.lecture.phase}, fatigue ${vue.lecture.statutFatigue}, ` +
            `performances ${vue.lecture.tendancePerformance}.` +
            (vue.lecture.motifs.length ? ` Motifs : ${vue.lecture.motifs.join(" ; ")}.` : ""),
        );
      }
      if (vue.semaine.length) {
        lignes.push(
          "Séances de la semaine : " +
            vue.semaine
              .map((s) => `${s.nom} (${s.exercices} exercices, ~${s.dureeEstimeeMinutes} min, ${s.etat})`)
              .join(" ; ") +
            ".",
        );
      }
      if (vue.dechargeRecommandee) lignes.push("Une décharge est justifiée par les signaux récents.");
      break;
    }

    case "progression": {
      const bilan = await bilanDeProgression(userId);
      if (bilan.etat === "sans_donnees") {
        lignes.push("L'athlète regarde sa progression : aucune séance enregistrée.");
        break;
      }
      lignes.push(
        `L'athlète regarde sa progression : ${bilan.seancesTotal} séances depuis le début.`,
      );
      if (bilan.enProgression.length) {
        lignes.push(
          "Progresse le plus clairement : " +
            bilan.enProgression
              .slice(0, 3)
              .map((e) => `${e.exerciceNom} (+${e.progressionPct} %, ${e.ameliorations} améliorations sur ${e.seances} séances)`)
              .join(" ; ") +
            ".",
        );
      }
      if (bilan.stagnations.length) {
        lignes.push(
          "Stagnations lisibles : " +
            bilan.stagnations
              .slice(0, 3)
              .map((s) => `${s.exerciceNom} (${s.seances} séances depuis son record)`)
              .join(" ; ") +
            ".",
        );
      }
      break;
    }

    case "seance": {
      // La séance en cours est celle enregistrée aujourd'hui, sinon la
      // dernière : c'est ce que l'écran montre au moment de l'ouverture.
      const derniere = await db.query.sessionLogs.findFirst({
        where: and(eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe)),
        orderBy: [desc(sessionLogs.date), desc(sessionLogs.createdAt)],
      });
      if (!derniere) {
        lignes.push("L'athlète est sur l'écran de séance, sans séance enregistrée.");
        break;
      }
      lignes.push(`L'athlète est en séance (séance du ${derniere.date}).`);
      break;
    }

    case "accueil":
      lignes.push("L'athlète regarde son accueil et sa séance du jour.");
      break;

    case "exercices":
      lignes.push("L'athlète regarde son catalogue d'exercices.");
      break;

    case "plus":
      // Aucun contexte sportif : on ne fabrique pas de situation.
      break;
  }

  // L'objet précisément regardé, quand il y en a un et qu'il appartient bien
  // à l'utilisateur. Un identifiant qui n'est pas à lui est simplement ignoré.
  if (contexte.typeEntite && contexte.entiteId) {
    const nomme = await nommerEntite(userId, contexte.typeEntite, contexte.entiteId);
    if (nomme) lignes.push(nomme);
  }

  if (contexte.sujet) {
    lignes.push(`Intention déclarée en ouvrant la conversation : ${contexte.sujet}.`);
  }

  return lignes.length ? lignes.join("\n") : null;
}

/** Nomme un objet désigné, après vérification qu'il appartient à l'utilisateur. */
async function nommerEntite(
  userId: string,
  type: NonNullable<ContexteEcran["typeEntite"]>,
  id: string,
): Promise<string | null> {
  switch (type) {
    case "bloc": {
      const bloc = await db.query.programmeBlocs.findFirst({
        where: and(eq(programmeBlocs.id, id), eq(programmeBlocs.userId, userId)),
      });
      return bloc ? `Bloc regardé : « ${bloc.nom} » (${libelleCycle(bloc.typeCycle).libelle}).` : null;
    }
    case "seance": {
      // Le gabarit n'appartient pas directement à l'utilisateur : il appartient
      // à un bloc, dont on vérifie le propriétaire.
      const [ligne] = await db
        .select({ nom: seanceTemplates.nom, lettre: seanceTemplates.lettre })
        .from(seanceTemplates)
        .innerJoin(programmeBlocs, eq(programmeBlocs.id, seanceTemplates.blocId))
        .where(and(eq(seanceTemplates.id, id), eq(programmeBlocs.userId, userId)))
        .limit(1);
      return ligne ? `Séance regardée : ${ligne.nom} (${ligne.lettre}).` : null;
    }
    case "instance": {
      const [ligne] = await db
        .select({ nom: exercises.nom, machineNom: exerciseInstances.machineNom })
        .from(exerciseInstances)
        .innerJoin(exercises, eq(exercises.id, exerciseInstances.exerciseId))
        .where(and(eq(exerciseInstances.id, id), eq(exerciseInstances.userId, userId)))
        .limit(1);
      return ligne
        ? `Exercice regardé : ${ligne.nom}${ligne.machineNom ? ` — ${ligne.machineNom}` : ""}.`
        : null;
    }
    case "exercice": {
      // Le catalogue est partagé : un exercice sans propriétaire est public.
      const exo = await db.query.exercises.findFirst({ where: eq(exercises.id, id) });
      if (!exo) return null;
      if (exo.userId !== null && exo.userId !== userId) return null;
      return `Exercice regardé : ${exo.nom}.`;
    }
  }
}
