"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gymSchema, type GymInput } from "@/lib/schemas/gym";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface GymFormProps {
  defaultValues?: Partial<GymInput>;
  gymId?: string;
  onSuccess: () => void;
}

export function GymForm({ defaultValues, gymId, onSuccess }: GymFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<GymInput>({
    resolver: zodResolver(gymSchema),
    defaultValues: defaultValues || { est24h: false },
  });

  const onSubmit = async (data: GymInput) => {
    setLoading(true);
    try {
      const url = gymId ? `/api/gyms/${gymId}` : "/api/gyms";
      const method = gymId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }

      toast.success(gymId ? "Salle modifiée" : "Salle créée");
      onSuccess();
      router.push("/gyms");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4">
      <div>
        <Label htmlFor="nom">Nom de la salle *</Label>
        <Input id="nom" {...form.register("nom")} placeholder="BasicFit Lalande" />
        {form.formState.errors.nom && (
          <p className="text-red-500 text-sm">{form.formState.errors.nom.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="horairesOuverture">Horaires d&apos;ouverture</Label>
        <Input id="horairesOuverture" {...form.register("horairesOuverture")} placeholder="6h-23h" />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="est24h"
          checked={form.watch("est24h")}
          onCheckedChange={(checked) => form.setValue("est24h", checked)}
        />
        <Label htmlFor="est24h">Ouverte 24h/24</Label>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" {...form.register("notes")} placeholder="Équipement, ambiance..." />
      </div>

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enregistrement..." : gymId ? "Modifier" : "Créer"}
      </Button>
    </form>
  );
}
