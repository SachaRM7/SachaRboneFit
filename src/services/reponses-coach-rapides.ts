import type { ContexteEcran } from "@/lib/coach/contexte-ecran";
import { createCoachTools } from "@/lib/coach/tools";
import { resoudreContexte } from "./contexte-coach";

interface ReponseActionRapideOptions {
  actionId: string;
  userId: string;
  contexte: ContexteEcran | null;
}

function json<T = Record<string, unknown>>(texte: string): T | null {
  try {
    return JSON.parse(texte) as T;
  } catch {
    return null;
  }
}

function phraseContexte(texte: string | null): string | null {
  if (!texte) return null;
  return texte
    .split("\n")
    .map((l) => l
      .replace(/^L'athlète regarde son programme\s*:\s*/i, "")
      .replace(/^L'athlète regarde sa progression\s*:\s*/i, "")
      .replace(/^L'athlète regarde son accueil et sa séance du jour\.?$/i, "")
      .replace(/^L'athlète est en séance\s*/i, "Séance ")
      .replace(/^Intention déclarée.*$/i, "")
      .trim())
    .filter(Boolean)
    .join("\n");
}

async function outil(
  nom: string,
  userId: string,
  contexte: Awaited<ReturnType<typeof resoudreContexte>>,
  params: Record<string, unknown> = {},
): Promise<string> {
  const outils = createCoachTools();
  const executeur = outils.executors[nom];
  if (!executeur) return "";
  const resultat = await executeur(params, userId, contexte.refs ?? undefined);
  return resultat.success ? resultat.output : "";
}

function readinessTexte(brut: string): string {
  const d = json<{
    renseigne?: boolean;
    feu?: string;
    sommeilHeures?: number | null;
    energieDepart?: number | null;
    jeune?: boolean;
    courbatures?: Array<{ muscle: string; intensite: number }>;
    conduiteSymptomes?: string;
    message?: string;
  }>(brut);
  if (!d) return brut;
  if (!d.renseigne) return d.message ?? "Ton état du jour n'est pas renseigné.";

  const lignes = [`Ton feu du jour est ${d.feu ?? "non déterminé"}.`];
  const facteurs: string[] = [];
  if (d.sommeilHeures != null) facteurs.push(`${d.sommeilHeures} h de sommeil`);
  if (d.energieDepart != null) facteurs.push(`énergie ${d.energieDepart}/10`);
  if (d.jeune) facteurs.push("à jeun");
  if (facteurs.length) lignes.push(`Repères : ${facteurs.join(", ")}.`);
  if (d.courbatures?.length) {
    lignes.push(`Courbatures : ${d.courbatures.map((c) => `${c.muscle} ${c.intensite}/10`).join(", ")}.`);
  }
  if (d.conduiteSymptomes && d.conduiteSymptomes !== "aucune") {
    lignes.push(`Conduite prévue par l'app : ${d.conduiteSymptomes}.`);
  }
  return lignes.join("\n");
}

function seanceTexte(brut: string): string {
  const d = json<{
    programmee?: boolean;
    message?: string;
    bloc?: { nom?: string; semaine?: number };
    seance?: { lettre?: string; nom?: string };
    rotation?: string[];
  }>(brut);
  if (!d) return brut;
  if (!d.programmee) return d.message ?? "Aucune séance n'est programmée.";
  const nom = [d.seance?.lettre, d.seance?.nom].filter(Boolean).join(" — ");
  const lignes = [`Prochaine séance : ${nom || "séance prévue"}.`];
  if (d.bloc?.nom) lignes.push(`Bloc : ${d.bloc.nom}${d.bloc.semaine ? `, semaine ${d.bloc.semaine}` : ""}.`);
  if (d.rotation?.length) lignes.push(`Rotation : ${d.rotation.join(" → ")}.`);
  return lignes.join("\n");
}

function progressionTexte(brut: string): string {
  const d = json<{
    plateaux?: Array<{ exercice?: string; semainesSansProgression?: number; contexteNormal?: boolean }>;
    fourchettesCompletees?: unknown[];
    semainesSansDeload?: number;
  }>(brut);
  if (!d) return brut;
  const lignes: string[] = [];
  if (d.plateaux?.length) {
    lignes.push(
      `Plateaux mesurés : ${d.plateaux.slice(0, 3).map((p) => `${p.exercice ?? "exercice"} (${p.semainesSansProgression ?? "?"} sem.)`).join(", ")}.`,
    );
  } else {
    lignes.push("Aucun plateau mesuré actuellement.");
  }
  if (typeof d.semainesSansDeload === "number") lignes.push(`${d.semainesSansDeload} semaine(s) depuis la dernière décharge.`);
  return lignes.join("\n");
}

/**
 * Réponses des boutons prédéfinis du Coach.
 *
 * Aucun LLM ici. Le bouton reste présenté comme une conversation avec le Coach,
 * mais les faits viennent uniquement des moteurs/services déjà présents dans
 * l'application. Une vraie question saisie dans le champ continue, elle, vers
 * `/api/coach/chat` et le LLM.
 */
export async function repondreActionRapide({
  actionId,
  userId,
  contexte,
}: ReponseActionRapideOptions): Promise<string> {
  const resolu = await resoudreContexte(userId, contexte);
  const contexteLisible = phraseContexte(resolu.texte);

  if (actionId === "accueil:0") {
    const [etat, seance] = await Promise.all([
      outil("get_today_readiness", userId, resolu),
      outil("get_current_session", userId, resolu),
    ]);
    return `${readinessTexte(etat)}\n\n${seanceTexte(seance)}\n\nSi tu es nettement plus fatigué que prévu, suis le feu et les ajustements calculés par l'app plutôt que de forcer la séance normale.`;
  }

  if (actionId === "accueil:1") {
    const seance = await outil("get_current_session", userId, resolu);
    return `${seanceTexte(seance)}${contexteLisible ? `\n\n${contexteLisible}` : ""}`;
  }

  if (actionId === "accueil:2") {
    const seance = await outil("get_current_session", userId, resolu);
    return `${seanceTexte(seance)}\n\nAvec seulement 30 minutes, garde d'abord les mouvements principaux de la séance et coupe les exercices d'isolation en dernier. Les charges et fourchettes de répétitions restent celles calculées par l'app.`;
  }

  if (actionId.startsWith("programme:") || actionId.startsWith("sujet:modifier_programme:")) {
    if (actionId.endsWith(":1")) {
      return "D'accord. Indique-moi les jours ou le nombre de séances que tu veux changer. Ta prochaine réponse sera traitée comme une vraie question pour comprendre précisément la nouvelle contrainte.";
    }
    if (actionId.endsWith(":2")) {
      return "D'accord. Dis-moi quelle séance tu veux remplacer et pourquoi. Je ne modifie rien tant que tu n'as pas précisé ce que tu souhaites changer.";
    }
    const base = contexteLisible ?? "Ton programme actuel est chargé depuis les données de l'app.";
    if (actionId.endsWith(":3")) {
      const equipement = await outil("get_gym_equipment", userId, resolu);
      const d = json<{ salle?: { nom?: string }; machines?: unknown[] }>(equipement);
      return `${base}\n\n${d?.salle?.nom ? `Salle : ${d.salle.nom}. ` : ""}${d?.machines ? `${d.machines.length} appareil(s) utilisable(s) sont enregistrés.` : ""}`.trim();
    }
    return base;
  }

  if (actionId.startsWith("progression:") || actionId.startsWith("sujet:stagnation:")) {
    const progression = progressionTexte(await outil("get_progression_status", userId, resolu));
    if (actionId.endsWith(":1")) {
      const records = await outil("get_personal_records", userId, resolu, { limite: 5 });
      const d = json<Array<{ exercice?: string; exerciseName?: string; estimated1RM?: number; e1rm?: number }>>(records);
      const lignes = Array.isArray(d)
        ? d.slice(0, 5).map((r) => `${r.exercice ?? r.exerciseName ?? "Exercice"}${r.estimated1RM ?? r.e1rm ? ` : ${r.estimated1RM ?? r.e1rm} kg estimés` : ""}`)
        : [];
      return `${progression}${lignes.length ? `\n\nRepères récents :\n${lignes.join("\n")}` : ""}`;
    }
    return `${progression}${contexteLisible ? `\n\n${contexteLisible}` : ""}`;
  }

  if (actionId.startsWith("sujet:decharge:")) {
    const progression = progressionTexte(await outil("get_progression_status", userId, resolu));
    if (actionId.endsWith(":1")) {
      return `${progression}\n\nUne semaine de décharge signifie réduire temporairement la charge de travail prévue par le moteur, puis reprendre le cycle. Rien n'est appliqué automatiquement depuis ce bouton.`;
    }
    if (actionId.endsWith(":2")) {
      return `${progression}\n\nContinuer sans décharge ne change rien automatiquement. Si tu veux contester la recommandation, écris-moi ce qui te fait préférer continuer : ce sera traité comme une vraie question.`;
    }
    return `${progression}${contexteLisible ? `\n\n${contexteLisible}` : ""}`;
  }

  if (actionId.startsWith("seance:")) {
    if (actionId.endsWith(":0")) {
      return "Si la charge proposée est trop lourde, ne force pas une répétition qui sort de la technique prévue. Utilise l'incrément inférieur disponible et reste dans la fourchette de répétitions de la séance. La progression sera recalculée à partir de ce que tu fais réellement.";
    }
    if (actionId.endsWith(":1")) {
      return "Avec une gêne, ne cherche pas à la traverser pour finir la série. Arrête le mouvement douloureux et utilise une variante déjà autorisée par l'app si elle existe. Si la douleur est importante, inhabituelle ou persiste, ne poursuis pas cet exercice et fais-la évaluer.";
    }
    return contexteLisible ?? "Je peux expliquer l'exercice affiché à partir de sa fiche et de la séance en cours.";
  }

  if (actionId.startsWith("exercices:")) {
    if (actionId.endsWith(":0")) return "Quel muscle veux-tu cibler ? Écris simplement son nom : ta réponse libre permettra de chercher dans la bibliothèque d'exercices disponible.";
    if (actionId.endsWith(":1")) return contexteLisible ?? "Ouvre l'exercice concerné ou écris son nom pour que je t'explique son exécution.";
    return contexteLisible ?? "Indique l'exercice que tu veux remplacer. Je chercherai ensuite parmi les variantes compatibles avec ton matériel et tes contraintes.";
  }

  if (actionId === "plus:0") return contexteLisible ?? "Ton programme est chargé depuis le bloc actif de l'application.";
  if (actionId === "plus:1") return progressionTexte(await outil("get_progression_status", userId, resolu));
  if (actionId === "plus:2") return readinessTexte(await outil("get_today_readiness", userId, resolu));
  if (actionId === "plus:3") {
    const equipement = await outil("get_gym_equipment", userId, resolu);
    const d = json<{ salle?: { nom?: string }; machines?: Array<{ exercice?: string; machine?: string }> }>(equipement);
    if (!d) return "Tes exercices restent consultables dans le catalogue de l'app.";
    const exemples = d.machines?.slice(0, 5).map((m) => m.exercice ?? m.machine).filter(Boolean) ?? [];
    return `${d.salle?.nom ? `Dans ${d.salle.nom}, ` : ""}${d.machines?.length ?? 0} appareil(s) utilisable(s) sont enregistrés.${exemples.length ? `\nExemples : ${exemples.join(", ")}.` : ""}`;
  }

  if (actionId.startsWith("sujet:materiel:")) {
    const equipement = await outil("get_gym_equipment", userId, resolu);
    const d = json<{ salle?: { nom?: string }; autresSalles?: Array<{ nom?: string }>; machines?: unknown[] }>(equipement);
    if (actionId.endsWith(":1")) {
      const autres = d?.autresSalles?.map((s) => s.nom).filter(Boolean) ?? [];
      return autres.length
        ? `Autres salles enregistrées : ${autres.join(", ")}. Ouvre celle où tu vas t'entraîner pour que l'app recalcule avec son matériel.`
        : "Aucune autre salle n'est enregistrée. Ajoute d'abord le lieu et son matériel pour adapter proprement la séance.";
    }
    return `${d?.salle?.nom ? `Salle actuelle : ${d.salle.nom}. ` : ""}${d?.machines ? `${d.machines.length} appareil(s) utilisable(s) sont enregistrés.` : "Matériel non renseigné."}`;
  }

  if (actionId.startsWith("sujet:observation_seance:") || actionId.startsWith("sujet:expliquer_seance:")) {
    return contexteLisible ?? "Le constat affiché vient des données de la séance. Si tu veux aller plus loin, écris ta question précisément.";
  }

  return contexteLisible ?? "Cette réponse vient directement des données et règles de l'application, sans appel IA.";
}
