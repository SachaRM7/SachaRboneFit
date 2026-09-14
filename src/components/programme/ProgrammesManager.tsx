"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, FolderInput, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { CreationBlocForm } from "./CreationBlocForm";

export interface ProgrammeResume {
  id: string;
  nom: string;
  actif: boolean;
  typeCycle: string;
}

export interface SeanceDeplacable {
  id: string;
  nom: string;
  lettre: string;
}

export function ProgrammesManager({
  programmes,
  selectedId,
  seances,
}: {
  programmes: ProgrammeResume[];
  selectedId: string | null;
  seances: SeanceDeplacable[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<Record<string, string>>({});

  const selected = useMemo(
    () => programmes.find((programme) => programme.id === selectedId) ?? null,
    [programmes, selectedId],
  );

  async function activate(programmeId: string) {
    setPending(`activate:${programmeId}`);
    try {
      const response = await fetch(`/api/programme/blocs/${programmeId}`, { method: "PATCH" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Activation impossible");
      toast.success("Programme actif mis à jour");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Activation impossible");
    } finally {
      setPending(null);
    }
  }

  async function createSession() {
    if (!selected) return;
    const nom = sessionName.trim();
    if (!nom) {
      toast.error("Donne un nom à la séance");
      return;
    }

    const index = seances.length;
    const lettre = index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

    setPending("create-session");
    try {
      const response = await fetch("/api/programme/seances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocId: selected.id, lettre, nom }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Création impossible");
      toast.success("Séance créée");
      setSessionName("");
      setCreatingSession(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Création impossible");
    } finally {
      setPending(null);
    }
  }

  async function moveSession(sessionId: string) {
    const destinationBlocId = destinations[sessionId];
    if (!destinationBlocId) {
      toast.error("Choisis un programme de destination");
      return;
    }

    setPending(`move:${sessionId}`);
    try {
      const response = await fetch(`/api/programme/seances/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationBlocId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Déplacement impossible");
      toast.success("Séance déplacée");
      setDestinations((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Déplacement impossible");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-filet bg-carte p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-encre-3">Mes programmes</p>
            <p className="mt-1 text-sm text-encre-2">Un seul pilote la rotation. Les autres restent modifiables.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setCreating((value) => !value)}>
            <Plus className="size-4" aria-hidden /> Nouveau
          </Button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {programmes.map((programme) => {
            const selectedProgramme = programme.id === selectedId;
            return (
              <Link
                key={programme.id}
                href={`/programme?bloc=${programme.id}`}
                className={`min-w-[12rem] rounded-2xl border p-3 transition-colors ${selectedProgramme ? "border-encre bg-papier-2" : "border-filet bg-carte"}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-encre">
                  {programme.nom}
                  {programme.actif && <Check className="size-4" aria-label="Programme actif" />}
                </span>
                <span className="mt-1 block text-xs text-encre-3">{programme.actif ? "Actif dans la rotation" : "Programme enregistré"}</span>
              </Link>
            );
          })}
          {programmes.length === 0 && <p className="text-sm text-encre-3">Aucun programme enregistré.</p>}
        </div>

        {selected && (
          <div className="mt-4 space-y-2">
            {!selected.actif && (
              <Button
                type="button"
                className="w-full rounded-full"
                onClick={() => void activate(selected.id)}
                disabled={pending !== null}
              >
                {pending === `activate:${selected.id}` ? "Activation…" : "Définir comme programme actif"}
              </Button>
            )}

            <Button
              type="button"
              variant={seances.length === 0 ? "default" : "outline"}
              className="w-full rounded-full"
              onClick={() => setCreatingSession(true)}
              disabled={pending !== null}
            >
              <Plus className="size-4" aria-hidden /> Ajouter une séance
            </Button>
          </div>
        )}
      </div>

      {creating && (
        <CreationBlocForm actifParDefaut={programmes.length === 0} onCreated={() => setCreating(false)} />
      )}

      {selected && seances.length > 0 && programmes.length > 1 && (
        <div className="rounded-[1.5rem] border border-filet bg-carte p-4">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-encre-3">Déplacer une séance</p>
            <p className="mt-1 text-sm text-encre-2">La séance garde son identité et son historique.</p>
          </div>
          <div className="space-y-3">
            {seances.map((session) => {
              const available = programmes.filter((programme) => programme.id !== selected.id);
              return (
                <div key={session.id} className="rounded-2xl border border-filet-doux bg-papier p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <FolderInput className="size-4 text-encre-3" aria-hidden />
                    <span className="text-sm font-medium text-encre">{session.lettre} · {session.nom}</span>
                  </div>
                  <div className="flex gap-2">
                    <select
                      aria-label={`Destination de ${session.nom}`}
                      value={destinations[session.id] ?? ""}
                      onChange={(event) => setDestinations((current) => ({ ...current, [session.id]: event.target.value }))}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="">Choisir un programme</option>
                      {available.map((programme) => <option key={programme.id} value={programme.id}>{programme.nom}</option>)}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void moveSession(session.id)}
                      disabled={pending !== null || !destinations[session.id]}
                    >
                      {pending === `move:${session.id}` ? "…" : "Déplacer"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Drawer open={creatingSession} onOpenChange={setCreatingSession}>
        <DrawerContent className="bg-papier border-filet text-encre">
          <DrawerHeader>
            <DrawerTitle className="text-encre">
              {selected ? `Nouvelle séance · ${selected.nom}` : "Nouvelle séance"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="programme-session-name">Nom de la séance</Label>
              <Input
                id="programme-session-name"
                value={sessionName}
                onChange={(event) => setSessionName(event.target.value)}
                placeholder="Push, Haut du corps, Jambes…"
                autoFocus
              />
            </div>
            <Button
              type="button"
              className="w-full h-12"
              onClick={() => void createSession()}
              disabled={pending !== null}
            >
              {pending === "create-session" ? "Création…" : "Créer la séance"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
