"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { exerciseSchema } from "@/lib/schemas/exercise";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type ExerciseInput = z.input<typeof exerciseSchema>;

export function ExerciseForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<ExerciseInput>({
    resolver: zodResolver(exerciseSchema),
    defaultValues: {
      musclesPrincipaux: [],
    },
  });

  const onSubmit = async (data: ExerciseInput) => {
    setLoading(true);
    try {
      const res = await fetch("/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Erreur");
      toast.success("Exercice créé");
      router.push("/exercises");
    } catch {
      toast.error("Erreur lors de la création");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4">
      <div>
        <Label>Nom *</Label>
        <Input {...form.register("nom")} placeholder="Nom de l'exercice" />
      </div>

      <div>
        <Label>Pilier *</Label>
        <Select onValueChange={(v) => form.setValue("pilier", v as ExerciseInput["pilier"])}>
          <SelectTrigger><SelectValue placeholder="Choisir un pilier" /></SelectTrigger>
          <SelectContent>
            {["P1_poussee","P2_tirage","P3_squat","P4_hanche","epaules","bras_biceps","bras_triceps","jambes_iso","core"].map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Profil de tension *</Label>
        <Select onValueChange={(v) => form.setValue("profilTension", v as ExerciseInput["profilTension"])}>
          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
          <SelectContent>
            {["stretch","contract","mi_range"].map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Type *</Label>
        <Select onValueChange={(v) => form.setValue("type", v as ExerciseInput["type"])}>
          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
          <SelectContent>
            {["polyarticulaire","isolation"].map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Rôle *</Label>
        <Select onValueChange={(v) => form.setValue("categorieRole", v as ExerciseInput["categorieRole"])}>
          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
          <SelectContent>
            {["pilier","substitut","accessoire"].map(r => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Création..." : "Créer l'exercice"}
      </Button>
    </form>
  );
}
