"use client";
import { useRef, useState } from "react";
import { directionDuGeste, indexApresGeste, indexValide } from "./navigation-seances";
import { libelleCycle } from "@/lib/referentiels/cycle";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IllustrationExercice } from "@/components/exercises/IllustrationExercice";
import {
  CHOIX_CIBLE_EFFORT,
  NON_PRESCRIT,
  choixDepuisCible,
  cibleDepuisChoix,
  libelleCibleEffort,
} from "./cible-effort";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";

export interface ExerciceProgramme {
  ligneId: string;
  ordre: number;
  machineNom: string;
  exerciceNom: string;
  exerciceSlug: string | null;
  seriesCibles: number;
  fourchetteRepsMin: number;
  fourchetteRepsMax: number;
  rpeCible: number | null;
  tempo: string | null;
  reposSecondes: number | null;
  /** La charge visée, en kg. `null` veut dire « rien de programmé ». */
  chargeCible: number | null;
}

export interface SeanceProgramme {
  id: string;
  lettre: string;
  nom: string;
  ordreDansSemaine: number;
  exercices: ExerciceProgramme[];
}

export interface MachineDisponible {
  id: string;
  machineNom: string;
  exerciceNom: string;
  exerciceSlug: string | null;
  salleNom: string;
  pilier: string;
}

interface Props {
  /** `semaineActuelle` n'est plus transmise : elle vaut 1 et ne bouge pas. */
  bloc: { id: string; nom: string; typeCycle: string } | null;
  seances: SeanceProgramme[];
  machines: MachineDisponible[];
}

/**
 * Les réglages d'une ligne, tenus en TEXTE.
 *
 * Ils étaient des nombres : un `<input type="number">` vidé rendait
 * `Number("")`, donc 0, et un zéro fabriqué partait en base — zéro série, zéro
 * kilo, une prescription que personne n'avait formulée. En gardant la chaîne
 * telle qu'elle a été tapée, « vide » reste vide.
 */
interface ReglagesExercice {
  series: string;
  repsMin: string;
  repsMax: string;
  /** Valeur du menu `cible-effort` — `NON_PRESCRIT` quand rien n'est visé. */
  effort: string;
  tempo: string;
  repos: string;
  /** Charge visée en kg. Vide par défaut : rien n'est deviné à sa place. */
  charge: string;
}

const REGLAGES_DEFAUT: ReglagesExercice = {
  series: "",
  repsMin: "",
  repsMax: "",
  effort: NON_PRESCRIT,
  tempo: "",
  repos: "",
  charge: "",
};

/** Un champ vidé n'est pas un zéro : il n'y a rien à envoyer. */
function nombreOuAbsent(valeur: string): number | undefined {
  const brut = valeur.trim().replace(",", ".");
  if (brut === "") return undefined;
  const nombre = Number(brut);
  return Number.isFinite(nombre) ? nombre : undefined;
}

function texteOuNull(valeur: string): string | null {
  const brut = valeur.trim();
  return brut === "" ? null : brut;
}

function reglagesDepuisExercice(exercice: ExerciceProgramme): ReglagesExercice {
  return {
    series: String(exercice.seriesCibles),
    repsMin: String(exercice.fourchetteRepsMin),
    repsMax: String(exercice.fourchetteRepsMax),
    effort: choixDepuisCible(exercice.rpeCible),
    tempo: exercice.tempo ?? "",
    repos: exercice.reposSecondes === null ? "" : String(exercice.reposSecondes),
    charge: exercice.chargeCible === null ? "" : String(exercice.chargeCible),
  };
}

function motifInvalide(reglages: ReglagesExercice): string | null {
  const min = nombreOuAbsent(reglages.repsMin);
  const max = nombreOuAbsent(reglages.repsMax);
  if (min !== undefined && max !== undefined && min > max) {
    return "La fourchette de répétitions est inversée";
  }
  const charge = nombreOuAbsent(reglages.charge);
  if (charge !== undefined && charge < 0) return "La charge ne peut pas être négative";
  const repos = nombreOuAbsent(reglages.repos);
  if (repos !== undefined && repos < 0) return "Le repos ne peut pas être négatif";
  return null;
}

/**
 * Les réglages tels qu'ils partent au serveur.
 *
 * Les colonnes obligatoires (séries, bornes de répétitions) n'envoient leur clé
 * que si une valeur a été saisie : absentes, le service reprend ses valeurs
 * historiques plutôt que d'enregistrer un zéro. Les colonnes optionnelles
 * (effort, tempo, repos, kg) reçoivent `null` quand le champ est vidé — « rien
 * de prescrit » est une décision, et c'est le seul moyen d'effacer une
 * prescription existante.
 */
function reglagesPourLeServeur(reglages: ReglagesExercice): Record<string, unknown> {
  const corps: Record<string, unknown> = {
    rpeCible: cibleDepuisChoix(reglages.effort),
    tempo: texteOuNull(reglages.tempo),
    reposSecondes: nombreOuAbsent(reglages.repos) ?? null,
    chargeCible: nombreOuAbsent(reglages.charge) ?? null,
  };
  const series = nombreOuAbsent(reglages.series);
  const repsMin = nombreOuAbsent(reglages.repsMin);
  const repsMax = nombreOuAbsent(reglages.repsMax);
  if (series !== undefined) corps.seriesCibles = series;
  if (repsMin !== undefined) corps.fourchetteRepsMin = repsMin;
  if (repsMax !== undefined) corps.fourchetteRepsMax = repsMax;
  return corps;
}

/**
 * Les sept réglages d'une ligne de programme — les MÊMES pour l'ajout et pour
 * l'édition, pour qu'un champ ne puisse pas exister d'un côté seulement.
 *
 * Tout est facultatif : la ligne du haut le dit une fois, plutôt que de
 * répéter le mot sous chaque champ.
 */
function ChampsReglages({
  valeur,
  idPrefixe,
  onChange,
}: {
  valeur: ReglagesExercice;
  idPrefixe: string;
  onChange: (valeur: ReglagesExercice) => void;
}) {
  const champ = (cle: keyof ReglagesExercice, texte: string) => (
    <div className="space-y-2">
      <Label htmlFor={`${idPrefixe}-${cle}`}>{texte}</Label>
      <Input
        id={`${idPrefixe}-${cle}`}
        inputMode={cle === "tempo" ? undefined : "decimal"}
        maxLength={cle === "tempo" ? 10 : undefined}
        value={valeur[cle]}
        onChange={(e) => onChange({ ...valeur, [cle]: e.target.value })}
        placeholder={cle === "charge" ? "—" : undefined}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-encre-3 text-xs">
        Tout est facultatif. Ce qui reste vide sera proposé au démarrage de la séance.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {champ("series", "Séries")}
        {champ("repsMin", "Reps min")}
        {champ("repsMax", "Reps max")}
      </div>

      {/* L'effort se choisit en réserve — personne ne sait dire « 7,5 », tout
          le monde sait dire « 2 reps de la fin ». Le RPE reste ce qui part en
          base. */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefixe}-effort`}>Effort cible</Label>
        <Select
          value={valeur.effort}
          onValueChange={(v) => onChange({ ...valeur, effort: v ?? NON_PRESCRIT })}
        >
          <SelectTrigger id={`${idPrefixe}-effort`}><SelectValue /></SelectTrigger>
          <SelectContent>
            {CHOIX_CIBLE_EFFORT.map((c) => (
              <SelectItem key={c.valeur} value={c.valeur}>{c.libelle}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {champ("tempo", "Tempo")}
        {champ("repos", "Repos (s)")}
      </div>

      {champ("charge", "Charge (kg)")}
    </div>
  );
}

export function GestionProgramme({ bloc, seances, machines }: Props) {
  const router = useRouter();
  /**
   * Une séance à la fois.
   *
   * L'édition avancée dépliait les quatre séances, chacune avec tous ses
   * exercices et leurs réglages : un ruban de plusieurs écrans où l'on ne
   * savait plus quelle séance on modifiait, et où corriger la séance D
   * supposait de faire défiler A, B et C. La capacité d'édition ne change pas
   * — c'est la quantité montrée d'un coup qui change.
   *
   * `indexValide` recadre quand la liste bouge : après la suppression de la
   * séance affichée, l'index désignait le vide et l'écran annonçait « aucune
   * séance » alors qu'il en restait trois.
   */
  const [indexSeance, setIndexSeance] = useState(0);
  const courante = seances[indexValide(indexSeance, seances.length)] ?? null;
  const depart = useRef<{ x: number; y: number } | null>(null);

  const [creationSeance, setCreationSeance] = useState(false);
  const [ajoutPour, setAjoutPour] = useState<SeanceProgramme | null>(null);
  const [envoi, setEnvoi] = useState(false);

  const [lettre, setLettre] = useState("");
  const [nomSeance, setNomSeance] = useState("");

  const [instanceId, setInstanceId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [reglages, setReglages] = useState<ReglagesExercice>(REGLAGES_DEFAUT);

  const [edition, setEdition] = useState<ExerciceProgramme | null>(null);
  const [reglagesEdition, setReglagesEdition] = useState<ReglagesExercice>(REGLAGES_DEFAUT);
  const [editionSeance, setEditionSeance] = useState<SeanceProgramme | null>(null);
  const [nomSeanceEdition, setNomSeanceEdition] = useState("");
  const [lettreSeanceEdition, setLettreSeanceEdition] = useState("");

  const creerSeance = async () => {
    if (!bloc) return;
    if (!lettre.trim() || !nomSeance.trim()) {
      toast.error("Renseigne une lettre et un nom");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/programme/seances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: bloc.id, lettre: lettre.trim().toUpperCase(), nom: nomSeance.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Séance créée");
      setCreationSeance(false);
      setLettre("");
      setNomSeance("");
      router.refresh();
    } catch {
      toast.error("Création impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const ajouterExercice = async () => {
    if (!ajoutPour || !instanceId) {
      toast.error("Choisis une machine");
      return;
    }
    const motif = motifInvalide(reglages);
    if (motif) {
      toast.error(motif);
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/programme/seances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seanceTemplateId: ajoutPour.id,
          exerciseInstanceId: instanceId,
          ...reglagesPourLeServeur(reglages),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Exercice ajouté");
      setAjoutPour(null);
      setInstanceId("");
      setRecherche("");
      // Sans cette remise à zéro, la cible du dernier exercice deviendrait le
      // défaut du suivant — une prescription qui se propage toute seule.
      setReglages(REGLAGES_DEFAUT);
      router.refresh();
    } catch {
      toast.error("Ajout impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const ouvrirEdition = (exercice: ExerciceProgramme) => {
    setReglagesEdition(reglagesDepuisExercice(exercice));
    setEdition(exercice);
  };

  /**
   * Enregistre la ligne entière — série, reps, effort, tempo, repos, kg.
   *
   * Corriger une cible imposait auparavant de retirer l'exercice et de le
   * recréer, au prix de son rang et du lien de l'historique vers sa ligne
   * d'origine. Chaque champ s'édite maintenant sur place, et l'effort comme le
   * kg peuvent revenir à « rien de prescrit ».
   */
  const enregistrerEdition = async () => {
    if (!edition) return;
    const motif = motifInvalide(reglagesEdition);
    if (motif) {
      toast.error(motif);
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch(`/api/programme/exercices/${edition.ligneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reglagesPourLeServeur(reglagesEdition)),
      });
      if (!res.ok) throw new Error();
      toast.success("Exercice mis à jour");
      setEdition(null);
      router.refresh();
    } catch {
      toast.error("Modification impossible");
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * Monte ou descend un exercice dans sa séance.
   *
   * Deux appuis plutôt qu'un glissement : un glissement demande de viser la
   * poignée juste, ne se découvre pas, et se déclenche par accident en faisant
   * défiler la page. Le serveur reçoit une POSITION (1 = tête) et renumérote la
   * séance entière : c'est une seule écriture, donc rien à rattraper si elle
   * échoue en chemin.
   */
  const deplacerExercice = async (ligne: ExerciceProgramme, delta: -1 | 1) => {
    if (!courante) return;
    const index = courante.exercices.findIndex((item) => item.ligneId === ligne.ligneId);
    const position = index + 1 + delta;
    if (index < 0 || position < 1 || position > courante.exercices.length) return;
    setEnvoi(true);
    try {
      const res = await fetch(`/api/programme/exercices/${ligne.ligneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordre: position }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ordre mis à jour");
      router.refresh();
    } catch {
      toast.error("Déplacement impossible");
    } finally {
      setEnvoi(false);
    }
  };

  /**
   * Le même geste pour les séances : la rotation suit l'ordre du programme.
   *
   * Le rang envoyé est la POSITION dans la rotation affichée (1 = première),
   * pas le rang brut de la base : un programme dont les rangs ne partent pas de
   * 1 déplacerait sinon la séance ailleurs que là où on vient de la voir.
   */
  const deplacerSeance = async (seance: SeanceProgramme, delta: -1 | 1) => {
    const index = seances.findIndex((item) => item.id === seance.id);
    const position = index + 1 + delta;
    if (index < 0 || position < 1 || position > seances.length) return;
    setEnvoi(true);
    try {
      const res = await fetch(`/api/programme/seances/${seance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordre: position }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ordre des séances mis à jour");
      router.refresh();
    } catch {
      toast.error("Déplacement impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const ouvrirEditionSeance = (seance: SeanceProgramme) => {
    setEditionSeance(seance);
    setNomSeanceEdition(seance.nom);
    setLettreSeanceEdition(seance.lettre);
  };

  const enregistrerSeance = async () => {
    if (!editionSeance) return;
    const nom = nomSeanceEdition.trim();
    const lettre = lettreSeanceEdition.trim().toUpperCase();
    if (!nom || !lettre) {
      toast.error("Renseigne une lettre et un nom");
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch(`/api/programme/seances/${editionSeance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, lettre }),
      });
      if (!res.ok) throw new Error();
      toast.success("Séance mise à jour");
      setEditionSeance(null);
      router.refresh();
    } catch {
      toast.error("Modification impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const supprimerSeance = async (seance: SeanceProgramme) => {
    if (!confirm(`Supprimer « ${seance.nom} » du programme ? Les séances déjà réalisées resteront dans ton historique.`)) {
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch(`/api/programme/seances/${seance.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Séance supprimée");
      if (editionSeance?.id === seance.id) setEditionSeance(null);
      router.refresh();
    } catch {
      toast.error("Suppression impossible");
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async (ligne: ExerciceProgramme) => {
    if (!confirm(`Retirer « ${ligne.exerciceNom} » de la séance ?`)) return;
    try {
      const res = await fetch(`/api/programme/exercices/${ligne.ligneId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Exercice retiré");
      router.refresh();
    } catch {
      toast.error("Suppression impossible");
    }
  };

  const machinesFiltrees = recherche.trim()
    ? machines.filter((m) =>
        `${m.exerciceNom} ${m.machineNom} ${m.pilier}`.toLowerCase().includes(recherche.trim().toLowerCase()),
      )
    : machines;

  if (!bloc) {
    return (
      <div className="bg-carte border border-filet rounded-lg p-4">
        <p className="text-encre-2 text-sm">
          Aucun bloc actif. Crée un bloc pour commencer à programmer tes séances.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-carte border border-filet rounded-lg p-4">
        <p className="text-encre font-medium">{bloc.nom}</p>
        {/* Ni `type_cycle` brut, ni `semaine_actuelle` : cette colonne est
            écrite à 1 et jamais incrémentée. La semaine réelle se déduit de la
            date de début, et se lit en haut de l'écran. */}
        <p className="text-encre-3 text-sm mt-0.5">{libelleCycle(bloc.typeCycle).libelle}</p>
      </div>

      {/* Les onglets : la séance ouverte est nommée, les autres sont à un
          appui — ou à un glissement. La rangée défile si le bloc en compte
          beaucoup, plutôt que de se comprimer jusqu'à l'illisible. */}
      {seances.length > 1 && (
        <div
          role="tablist"
          aria-label="Séances du bloc"
          className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1"
        >
          {seances.map((s, i) => {
            const actif = s.id === courante?.id;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={actif}
                onClick={() => setIndexSeance(i)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  actif ? "bg-encre text-papier border-encre" : "bg-carte text-encre-2 border-filet"
                }`}
              >
                {s.lettre}
              </button>
            );
          })}
        </div>
      )}

      {courante && (
        <section
          key={courante.id}
          className="space-y-2"
          /* Le glissement double les onglets sans les remplacer : un geste
             n'est pas découvrable, un onglet si. `directionDuGeste` refuse
             tout ce qui ressemble à un défilement vertical. */
          onTouchStart={(e) => {
            const t = e.touches[0];
            depart.current = t ? { x: t.clientX, y: t.clientY } : null;
          }}
          onTouchEnd={(e) => {
            const t = e.changedTouches[0];
            if (!t || !depart.current) return;
            const direction = directionDuGeste(
              t.clientX - depart.current.x,
              t.clientY - depart.current.y,
            );
            depart.current = null;
            if (direction) {
              setIndexSeance((i) => indexApresGeste(indexValide(i, seances.length), direction, seances.length));
            }
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-encre font-semibold min-w-0">
              <span className="text-encre-3 mr-2">{courante.lettre}</span>
              {courante.nom}
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11"
                aria-label={`Modifier la séance ${courante.nom}`}
                onClick={() => ouvrirEditionSeance(courante)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11"
                aria-label={`Supprimer la séance ${courante.nom}`}
                onClick={() => void supprimerSeance(courante)}>
                <Trash2 className="w-4 h-4 text-perte" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAjoutPour(courante)}>
                <Plus className="w-4 h-4 mr-1" />
                Exercice
              </Button>
            </div>
          </div>

          {/* L'ordre des séances se COMMANDE, il ne se devine pas : deux boutons
              nommés valent mieux qu'un glissement que personne ne découvre. */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-11 w-11 bg-carte border-filet"
              disabled={envoi || indexValide(indexSeance, seances.length) === 0}
              aria-label={`Monter la séance ${courante.lettre}`}
              onClick={() => void deplacerSeance(courante, -1)}>
              <ArrowUp className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-11 w-11 bg-carte border-filet"
              disabled={envoi || indexValide(indexSeance, seances.length) >= seances.length - 1}
              aria-label={`Descendre la séance ${courante.lettre}`}
              onClick={() => void deplacerSeance(courante, 1)}>
              <ArrowDown className="w-4 h-4" />
            </Button>
            <span className="text-encre-3 text-xs ml-1">
              Ordre <span className="chiffres">{courante.ordreDansSemaine}</span> dans la rotation
            </span>
          </div>

          {/* Le repère de position : sans lui, on ne sait pas combien de
              séances existent ni où l'on se trouve dans le bloc. */}
          {seances.length > 1 && (
            <p className="text-encre-3 text-xs">
              Séance <span className="chiffres">{indexValide(indexSeance, seances.length) + 1}</span> sur{" "}
              <span className="chiffres">{seances.length}</span> — glisse pour changer.
            </p>
          )}

          {courante.exercices.length === 0 ? (
            <p className="text-encre-3 text-sm bg-carte border border-filet rounded-lg p-3">
              Séance vide — elle ne proposera aucun exercice.
            </p>
          ) : (
            <div className="space-y-2">
              {courante.exercices.map((e, index) => (
                <div key={e.ligneId} className="bg-carte border border-filet rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-encre-3 text-xs font-mono mt-1 w-4 shrink-0">{e.ordre}</span>
                    {e.exerciceSlug && (
                      <IllustrationExercice
                        slug={e.exerciceSlug}
                        nom={e.exerciceNom}
                        className="w-9 h-9 shrink-0 text-encre-2"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-encre text-sm font-medium">{e.exerciceNom}</p>
                      <p className="text-encre-3 text-xs">{e.machineNom}</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                          {e.seriesCibles} × {e.fourchetteRepsMin}-{e.fourchetteRepsMax}
                        </Badge>
                        {/* Toujours affiché, avec ou sans cible : une ligne
                            muette se lisait comme un oubli, pas comme une
                            décision. */}
                        <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                          {libelleCibleEffort(e.rpeCible)}
                        </Badge>
                        {e.tempo && (
                          <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                            tempo {e.tempo}
                          </Badge>
                        )}
                        {e.reposSecondes !== null && (
                          <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                            {e.reposSecondes}s
                          </Badge>
                        )}
                        {/* Le kg n'apparaît que s'il a été programmé : un
                            « 0 kg » affiché se lirait comme une charge
                            choisie, alors que rien n'a été décidé. */}
                        {e.chargeCible !== null && (
                          <Badge variant="outline" className="border-filet text-encre-3 text-[10px]">
                            <span className="chiffres">{e.chargeCible}</span> kg
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="icon" className="h-10 w-10"
                        aria-label={`Modifier ${e.exerciceNom}`}
                        onClick={() => ouvrirEdition(e)}>
                        <Pencil className="w-4 h-4 text-encre-2" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-10 w-10"
                        aria-label={`Retirer ${e.exerciceNom}`}
                        onClick={() => void retirer(e)}>
                        <Trash2 className="w-4 h-4 text-perte" />
                      </Button>
                    </div>
                  </div>

                  {/* Les commandes vivent SOUS la ligne qu'elles touchent et
                      nomment l'exercice : monter, descendre, modifier, retirer.
                      Chacune vise au moins 44 px — c'est la surface qu'un pouce
                      atteint sans viser. */}
                  <div className="flex items-center gap-1 mt-2">
                    <Button variant="ghost" size="icon" className="h-11 w-11"
                      disabled={envoi || index === 0}
                      aria-label={`Monter ${e.exerciceNom}`}
                      onClick={() => void deplacerExercice(e, -1)}>
                      <ArrowUp className="w-4 h-4 text-encre-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-11 w-11"
                      disabled={envoi || index === courante.exercices.length - 1}
                      aria-label={`Descendre ${e.exerciceNom}`}
                      onClick={() => void deplacerExercice(e, 1)}>
                      <ArrowDown className="w-4 h-4 text-encre-3" />
                    </Button>
                    <span className="ml-1 text-xs text-encre-3">Position {index + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {seances.length === 0 && (
        <p className="text-encre-3 text-sm bg-carte border border-filet rounded-lg p-3">
          Ce bloc n&apos;a aucune séance. Ajoute la première ci-dessous.
        </p>
      )}

      <Button variant="outline" className="w-full bg-carte border-filet"
        onClick={() => setCreationSeance(true)}>
        <Plus className="w-4 h-4 mr-2" />
        Ajouter une séance
      </Button>

      <Drawer open={creationSeance} onOpenChange={setCreationSeance}>
        <DrawerContent className="bg-papier border-filet text-encre">
          <DrawerHeader><DrawerTitle className="text-encre">Nouvelle séance</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lettre">Lettre</Label>
              <Input id="lettre" value={lettre} maxLength={3}
                onChange={(e) => setLettre(e.target.value)} placeholder="D" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomSeance">Nom</Label>
              <Input id="nomSeance" value={nomSeance}
                onChange={(e) => setNomSeance(e.target.value)} placeholder="Séance D — Dos + Biceps" />
            </div>
            <Button className="w-full h-12" onClick={creerSeance} disabled={envoi}>
              {envoi ? "Création…" : "Créer la séance"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={ajoutPour !== null} onOpenChange={(o) => !o && setAjoutPour(null)}>
        <DrawerContent className="bg-papier border-filet text-encre max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="text-encre">Ajouter à « {ajoutPour?.nom} »</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <Label>Machine</Label>
              {instanceId ? (
                <div className="flex items-center justify-between gap-2 bg-carte border border-filet rounded-lg p-3">
                  <span className="text-sm text-encre min-w-0 truncate">
                    {machines.find((m) => m.id === instanceId)?.exerciceNom}
                    <span className="text-encre-3"> · {machines.find((m) => m.id === instanceId)?.machineNom}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setInstanceId("")}>Changer</Button>
                </div>
              ) : (
                <>
                  <Input value={recherche} onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Chercher une machine…" />
                  <div className="max-h-56 overflow-y-auto space-y-1 border border-filet rounded-lg p-1">
                    {machinesFiltrees.slice(0, 40).map((m) => (
                      <button key={m.id} type="button" onClick={() => setInstanceId(m.id)}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-papier-2 text-left">
                        {m.exerciceSlug && (
                          <IllustrationExercice slug={m.exerciceSlug} nom={m.exerciceNom}
                            className="w-8 h-8 shrink-0 text-encre-3" />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-encre text-sm truncate">{m.exerciceNom}</span>
                          <span className="block text-encre-3 text-xs truncate">{m.machineNom} · {m.salleNom}</span>
                        </span>
                      </button>
                    ))}
                    {machinesFiltrees.length === 0 && (
                      <p className="text-encre-3 text-sm p-3">
                        Aucune machine. Équipe d&apos;abord une salle.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <ChampsReglages valeur={reglages} idPrefixe="ajout" onChange={setReglages} />

            <Button className="w-full h-12" onClick={ajouterExercice} disabled={envoi}>
              {envoi ? "Ajout…" : "Ajouter l'exercice"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Corriger un réglage imposait jusqu'ici de retirer l'exercice et de le
          recréer — au prix de son rang et du lien de l'historique vers sa ligne
          d'origine. Tous les réglages s'éditent maintenant ici, et retirer
          reste à portée de main. */}
      <Drawer open={edition !== null} onOpenChange={(o) => !o && setEdition(null)}>
        <DrawerContent className="bg-papier border-filet text-encre max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle className="text-encre">
              Modifier — {edition?.exerciceNom}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            <ChampsReglages
              valeur={reglagesEdition}
              idPrefixe="edition"
              onChange={setReglagesEdition}
            />
            <div className="flex flex-col gap-2">
              <Button className="w-full h-12" onClick={enregistrerEdition} disabled={envoi}>
                {envoi ? "Enregistrement…" : "Enregistrer"}
              </Button>
              <Button variant="ghost" className="w-full h-12 text-perte"
                disabled={envoi}
                onClick={() => {
                  if (!edition) return;
                  const ligne = edition;
                  setEdition(null);
                  void retirer(ligne);
                }}>
                <Trash2 className="w-4 h-4 mr-2" />
                Retirer de la séance
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={editionSeance !== null} onOpenChange={(open) => !open && setEditionSeance(null)}>
        <DrawerContent className="bg-papier border-filet text-encre">
          <DrawerHeader><DrawerTitle className="text-encre">Modifier la séance</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lettreSeanceEdition">Lettre</Label>
              <Input id="lettreSeanceEdition" value={lettreSeanceEdition} maxLength={8}
                onChange={(e) => setLettreSeanceEdition(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomSeanceEdition">Nom</Label>
              <Input id="nomSeanceEdition" value={nomSeanceEdition}
                onChange={(e) => setNomSeanceEdition(e.target.value)} />
            </div>
            <Button className="w-full h-12" onClick={() => void enregistrerSeance()} disabled={envoi}>
              {envoi ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button variant="ghost" className="w-full h-12 text-perte" disabled={envoi}
              onClick={() => editionSeance && void supprimerSeance(editionSeance)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Supprimer la séance
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
