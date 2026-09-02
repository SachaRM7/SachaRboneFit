"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EchelleDiscrete } from "@/components/ui/EchelleDiscrete";
import { toast } from "sonner";
import { ProgressionSummary } from "@/components/session/ProgressionSummary";
import { ReserveManquante, rpeParExercice } from "@/components/session/ReserveManquante";
import { recapDeLaSeance } from "@/lib/engine/fin-de-seance";

/**
 * Clôturer une séance en dix secondes.
 *
 * L'écran précédent demandait deux choses, et les demandait mal. Un curseur
 * d'énergie préréglé sur 7 : la valeur partait en base inchangée dans la
 * plupart des cas, donc « énergie de fin » était surtout une constante. Et une
 * zone de texte libre pour les notes, qu'on ne remplit pas au clavier, debout,
 * après une séance.
 *
 * Ce qui compte vraiment n'était pas demandé : la réserve des séries laissées
 * vides. C'est pourtant elle qui décide de la charge de la prochaine fois.
 *
 * L'ordre suit donc ce que les données valent : d'abord ce qui manque et qui
 * sert, ensuite ce qui est simplement consigné.
 */

interface InstanceNommee {
  id: string;
  nom: string;
  machineNom: string | null;
}

export default function FinishSessionPage() {
  const { templateId } = useParams();
  const router = useRouter();
  const { active, clear } = useSessionStore();

  const [energie, setEnergie] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [notesOuvertes, setNotesOuvertes] = useState(false);
  const [reserves, setReserves] = useState<Record<string, number>>({});
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    if (!active) router.replace(`/sessions/new/${templateId}`);
  }, [active, router, templateId]);

  // Le récapitulatif ne dépend que du brouillon : il se calcule une fois.
  const recap = useMemo(
    () =>
      active
        ? recapDeLaSeance({
            demarreeA: active.startedAt,
            maintenant: Date.now(),
            series: active.sets,
          })
        : null,
    [active],
  );

  // Un seul appel pour tous les noms, au lieu de deux par exercice.
  useEffect(() => {
    if (!active) return;
    const ids = [...new Set(active.sets.map((s) => s.exerciseInstanceId))];
    if (ids.length === 0) return;
    void (async () => {
      const res = await fetch(`/api/exercise-instances?ids=${ids.join(",")}`);
      if (!res.ok) return;
      const lignes: InstanceNommee[] = await res.json().catch(() => []);
      setNoms(
        Object.fromEntries(
          lignes.map((l) => [l.id, l.machineNom ? `${l.nom} — ${l.machineNom}` : l.nom]),
        ),
      );
    })();
  }, [active]);

  const enregistrer = async () => {
    if (!active || envoi || !recap) return;

    const faites = active.sets.filter((s) => s.repsEffectuees !== null && s.charge !== null);
    if (faites.length === 0) {
      toast.error("Au moins une série est requise");
      return;
    }

    setEnvoi(true);
    try {
      // Les réserves rattrapées ne s'appliquent qu'aux séries restées vides :
      // ce qui a été noté pendant la séance fait foi.
      const rattrapage = rpeParExercice(reserves);

      const res = await fetch(`/api/session-logs/${active.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dureeMinutes: recap.duree.minutes,
          energieFin: energie,
          notesSeance: notes.trim() || null,
          series: faites.map((s) => ({
            exerciseInstanceId: s.exerciseInstanceId,
            numeroSerie: s.numeroSerie,
            repsEffectuees: s.repsEffectuees,
            charge: s.charge,
            rpeEffectif: s.rpeEffectif ?? rattrapage[s.exerciseInstanceId] ?? null,
            reposReelSecondes: s.reposReelSecondes ?? null,
            // Le signalement vit au niveau de l'exercice ; il retombe ici sur
            // chacune de ses séries, quel que soit l'ordre des gestes. Absent,
            // la valeur reste `null` — jamais `true` par défaut.
            tempoRespecte: active?.tempoParExercice?.[s.exerciseInstanceId] ?? null,
            notes: s.notes ?? null,
          })),
        }),
      });
      if (!res.ok) throw new Error("clôture impossible");

      const sessionLogId = active.id;
      clear();
      toast.success("Séance enregistrée");
      router.push(`/sessions/${sessionLogId}`);
    } catch {
      toast.error("Erreur lors de l'enregistrement");
      setEnvoi(false);
    }
  };

  if (!active || !recap) return null;

  return (
    <div className="min-h-dvh bg-papier text-encre p-4 space-y-5 pb-28">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Séance terminée</h1>
        <span className="text-xs text-encre-3">
          {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px bg-filet border border-filet rounded-lg overflow-hidden">
        <div className="bg-papier p-3">
          <p className="text-[11px] text-encre-3">Durée</p>
          <p className="chiffres text-xl font-semibold mt-0.5">
            {recap.duree.minutes}
            <span className="text-xs text-encre-3 ml-1">min</span>
          </p>
        </div>
        <div className="bg-papier p-3">
          <p className="text-[11px] text-encre-3">Exercices</p>
          <p className="chiffres text-xl font-semibold mt-0.5">{recap.exercices}</p>
        </div>
        <div className="bg-papier p-3">
          <p className="text-[11px] text-encre-3">Séries</p>
          <p className="chiffres text-xl font-semibold mt-0.5">{recap.series}</p>
        </div>
      </div>

      {/* La durée retenue s'écarte de l'horloge : on le dit plutôt que de
          laisser croire à une séance de dix heures — ou de corriger en silence. */}
      {recap.duree.reprisePlusTard && (
        <p className="text-encre-3 text-xs -mt-3">
          Durée comptée jusqu&apos;à ta dernière série validée : la séance est restée ouverte
          après.
        </p>
      )}

      <ReserveManquante
        aCompleter={recap.aCompleter}
        nomDe={(id) => noms[id] ?? "Exercice"}
        reponses={reserves}
        onRepondre={(id, r) => setReserves((etat) => ({ ...etat, [id]: r }))}
      />

      <div className="space-y-2">
        <div>
          <h2 className="text-encre font-semibold text-sm">Ton énergie en sortant</h2>
          <p className="text-encre-3 text-xs mt-0.5">Facultatif.</p>
        </div>
        <EchelleDiscrete
          valeur={energie}
          onChange={setEnergie}
          label="Énergie en fin de séance, de 1 à 10"
          legendeBasse="Vidé"
          legendeHaute="En pleine forme"
        />
      </div>

      <ProgressionSummary
        sets={
          active.sets.filter(
            (s) => s.repsEffectuees !== null && s.charge !== null,
          ) as Array<{ exerciseInstanceId: string; repsEffectuees: number; charge: number }>
        }
        templateId={active.seanceTemplateId}
      />

      {/* Les notes passent derrière un repli : elles servent quand on a
          quelque chose à dire, et n'ont pas à occuper l'écran le reste du temps. */}
      <div>
        <button
          type="button"
          onClick={() => setNotesOuvertes((o) => !o)}
          aria-expanded={notesOuvertes}
          className="w-full flex items-center justify-between py-2 text-encre-2 text-sm"
        >
          <span>Ajouter une note{notes.trim() ? " · remplie" : ""}</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${notesOuvertes ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {notesOuvertes && (
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Sensations, douleurs, remarques…"
            className="bg-carte border-filet text-encre"
            autoFocus
          />
        )}
      </div>

      <Button
        className="w-full h-13 rounded-full bg-encre text-papier hover:bg-encre/90"
        onClick={enregistrer}
        disabled={envoi}
      >
        {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer la séance"}
      </Button>
    </div>
  );
}
