import { db } from "@/db/client";
import {
  exerciseInstances, exercises, programmeBlocs, seanceTemplates, sessionLogs, sessionPlanItems, setLogs,
} from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { libelleCycle } from "@/lib/referentiels/cycle";
import type { ContexteEcran } from "@/lib/coach/contexte-ecran";
import { vueDuProgramme } from "./cycle";
import { bilanDeProgression } from "./bilan";
import { seanceCourante } from "./seances";
import { prochaineSeance } from "./programmes";

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

/**
 * Références de l'objet regardé, résolues et vérifiées.
 *
 * Les identifiants ne sont ici QUE parce que leur propriétaire a été contrôlé.
 * Ils sont remis aux outils sans passer par le modèle : sans cela, savoir quel
 * exercice l'utilisateur regarde dépendrait de la capacité du modèle à le
 * recopier correctement dans les arguments — et un identifiant recopié de
 * travers est un identifiant faux, pas une erreur visible.
 */
export interface ReferencesContexte {
  ecran: ContexteEcran["ecran"];
  blocId: string | null;
  seanceTemplateId: string | null;
  exerciseInstanceId: string | null;
  /**
   * La séance du jour en cours, quand l'écran en montre une.
   *
   * Elle est ici pour la même raison que les autres : ce que l'application
   * connaît déjà n'a pas à transiter par le modèle. Un incident consigné sur
   * une séance devinée n'échoue pas — il se range au mauvais endroit.
   */
  sessionLogId: string | null;
}

export interface ContexteResolu {
  /** Ce qui est ajouté au prompt système. Du texte, court, déjà interprété. */
  texte: string | null;
  /** Ce qui est remis aux outils. Des identifiants, déjà vérifiés. */
  refs: ReferencesContexte | null;
}

export async function resoudreContexte(
  userId: string,
  contexte: ContexteEcran | null,
): Promise<ContexteResolu> {
  if (!contexte) return { texte: null, refs: null };

  const lignes: string[] = [];
  const refs: ReferencesContexte = {
    ecran: contexte.ecran,
    blocId: null,
    seanceTemplateId: null,
    exerciseInstanceId: null,
    sessionLogId: null,
  };

  switch (contexte.ecran) {
    case "programme": {
      const vue = await vueDuProgramme(userId);
      if (!vue.cycle) {
        lignes.push("L'athlète regarde son programme : aucun cycle actif.");
        break;
      }
      refs.blocId = vue.cycle.id;
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
      const courante = contexte.sessionLogId
        ? await db.query.sessionLogs.findFirst({ where: and(eq(sessionLogs.id, contexte.sessionLogId), eq(sessionLogs.userId, userId), isNull(sessionLogs.archiveLe), isNull(sessionLogs.dureeMinutes)) })
        : await seanceCourante(userId);
      if (!courante) { lignes.push("Aucune séance en cours vérifiée pour ce compte."); break; }
      lignes.push(`Séance regardée : ${courante.date}.`);
      refs.seanceTemplateId = courante.seanceTemplateId;
      refs.sessionLogId = courante.id;
      break;
    }

    case "accueil": {
      lignes.push("L'athlète regarde son accueil et sa séance du jour.");
      // La séance que la carte d'accueil propose : c'est celle dont on parle si
      // l'athlète demande d'y changer quelque chose depuis cet écran.
      const suite = await prochaineSeance(userId);
      refs.seanceTemplateId = suite?.template.id ?? null;
      refs.sessionLogId = (await seanceCourante(userId))?.id ?? null;
      break;
    }

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
    if (nomme) {
      lignes.push(nomme);
      // La référence n'est retenue que si l'objet a bien été trouvé pour CET
      // utilisateur : `nommerEntite` renvoie null sinon.
      if (contexte.typeEntite === "bloc") refs.blocId = contexte.entiteId;
      if (contexte.typeEntite === "seance") refs.seanceTemplateId = contexte.entiteId;
      if (contexte.typeEntite === "instance") refs.exerciseInstanceId = contexte.entiteId;
    }
  }

  if (contexte.sujet) {
    lignes.push(`Intention déclarée en ouvrant la conversation : ${contexte.sujet}.`);
  }

  /*
   * `signal` EST UN INDICE DE CONTEXTE NON AUTORITAIRE. Rien de plus.
   *
   * CE QUI LE REND SANS DANGER — et ce n'est PAS la phrase ci-dessous.
   *
   * Une consigne adressée à un modèle n'est jamais une garantie : elle
   * influence une réponse, elle ne contraint pas un système. Ce qui protège
   * ici est structurel, et tient en trois points vérifiables :
   *
   *   1. AUCUN POUVOIR MÉTIER. `signal` ne touche ni une charge, ni une
   *      substitution, ni une protection, ni un arrêt. Aucune décision
   *      déterministe du dépôt ne le lit — il n'apparaît que dans ce texte.
   *   2. LISTE FERMÉE. `contexteValide` n'accepte que les valeurs de
   *      `SIGNAUX_OBSERVATION`, qui recopient les types d'événements du
   *      moteur. Un texte libre est jeté, pas transmis : ce n'est donc pas un
   *      canal par lequel on ferait passer des instructions.
   *   3. AUCUNE IDENTITÉ CHOISIE PAR LE CLIENT. Le compte vient de la session
   *      authentifiée ; `entiteId` est vérifié par `nommerEntite`, qui rend
   *      `null` pour ce qui n'appartient pas à l'utilisateur.
   *
   * CE QUE ÇA LAISSE OUVERT, ET QU'IL FAUT DIRE.
   *
   * Un client modifié peut désigner « effort au-delà de la cible » sur une
   * séance calme. Les nombres, eux, viennent des outils que le Coach appelle
   * sur la séance authentifiée — le sujet serait donc vide plutôt que faux —
   * mais RIEN N'EMPÊCHE le modèle de reprendre la désignation à son compte
   * dans sa phrase d'ouverture. La conséquence maximale est une phrase
   * inexacte adressée à celui-là même qui l'a provoquée, sans effet sur les
   * données ni sur la programmation. C'est le niveau de risque qu'on accepte
   * ici, en connaissance de cause, et pas une faille qu'on couvrirait d'une
   * formulation.
   *
   * LE CONFIRMER COÛTERAIT UN SECOND MOTEUR. Recalculer l'événement côté
   * serveur demanderait de relire les `set_logs` de la séance et d'y
   * réappliquer les règles de `engine/evenements-seance` — c'est-à-dire une
   * deuxième implémentation de la même règle, qui divergerait de la première.
   * Le dépôt s'y refuse ailleurs (`lectures-set-logs`), et il s'y refuse ici.
   */
  if (refs.sessionLogId && refs.exerciseInstanceId) {
    const plan = await db.query.sessionPlanItems.findFirst({ where: and(
      eq(sessionPlanItems.sessionLogId, refs.sessionLogId), eq(sessionPlanItems.exerciseInstanceId, refs.exerciseInstanceId),
    ) });
    if (plan) {
      lignes.push(`Prescription enregistrée : ${plan.seriesCibles} séries, ${plan.fourchetteRepsMin}–${plan.fourchetteRepsMax} reps, RPE cible ${plan.rpeCible ?? "non renseigné"}, charge suggérée ${plan.chargeSuggeree ?? "non renseignée"}.`);
      if (plan.messageProgression) lignes.push(`Recommandation du moteur : ${plan.messageProgression}`);
      if (plan.raisonSubstitution) lignes.push(`Adaptation : ${plan.raisonSubstitution}`);
    }
    const mesures = await db.query.setLogs.findMany({ where: and(eq(setLogs.sessionLogId, refs.sessionLogId), eq(setLogs.exerciseInstanceId, refs.exerciseInstanceId)) });
    if (contexte.numeroSerie) lignes.push(`Série désignée par l'écran : ${contexte.numeroSerie}. Ce numéro désigne une question, pas une mesure.`);
    lignes.push(mesures.length ? `Séries réellement enregistrées : ${mesures.map((m) => `série ${m.numeroSerie} : ${m.charge} kg × ${m.repsEffectuees}, RPE ${m.rpeEffectif ?? "non saisi"}`).join(" ; ")}.` : "Aucune série enregistrée pour cet exercice. Le brouillon local ne constitue pas une mesure serveur.");
  }

  if (contexte.signal) {
    lignes.push(
      `Constat signalé par l'écran au moment de l'ouverture : ${contexte.signal}. `
        + "C'est une désignation du sujet, pas une mesure : vérifie les données "
        + "de la séance avant d'affirmer quoi que ce soit.",
    );
  }

  return { texte: lignes.length ? lignes.join("\n") : null, refs };
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
