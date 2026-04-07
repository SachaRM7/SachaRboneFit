"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { bodyWeightSchema } from "@/lib/schemas/bodyweight";

export function BodyWeightForm() {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [poids, setPoids] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/bodyweight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, poids: parseFloat(poids) }),
      });
      if (!res.ok) throw new Error();
      toast.success("Poids enregistré");
      setPoids("");
    } catch {
      toast.error("Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 items-end">
      <div className="flex-1">
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex-1">
        <Label htmlFor="poids">Poids (kg)</Label>
        <Input id="poids" type="number" step="0.1" value={poids} onChange={(e) => setPoids(e.target.value)} placeholder="90.5" />
      </div>
      <Button type="submit" disabled={loading || !poids}>Ajouter</Button>
    </form>
  );
}
