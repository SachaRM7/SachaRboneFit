"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MUSCLES, LIBELLES, type Muscle } from "@/lib/referentiels/muscles";

const OBJECTIFS = [
  { valeur: "perte_de_poids", libelle: "Perte de poids" },
  { valeur: "prise_de_muscle", libelle: "Prise de muscle" },
  { valeur: "recomposition", libelle: "Recomposition corporelle" },
  { valeur: "gain_de_force", libelle: "Gain de force" },
  { valeur: "cardio", libelle: "Amélioration cardio" },
  { valeur: "reprise", libelle: "Reprise sportive" },
  { valeur: "maintien", libelle: "Maintien" },
] as const;

const PHASES = [
  { valeur: "seche", libelle: "Sèche" },
  { valeur: "prise_de_masse", libelle: "Prise de masse" },
  { valeur: "maintien", libelle: "Maintien" },
] as const;

export interface ProfilInitial {
  nom: string | null;
  dateNaissance: string | null;
  taille: number | null;
  phaseNutritionnelle: string | null;
  objectifType: string | null;
  objectifMusclesPrioritaires: string[];
  objectifChiffre: string | null;
  dateCible: string | null;
  frequenceCibleParSemaine: number | null;
  dureeSeanceCibleMinutes: number | null;
}

export function ProfilForm({ initial }: { initial: ProfilInitial }) {
  const router = useRouter();
  const [profil, setProfil] = useState(initial);
  const [enregistrement, setEnregistrement] = useState(false);

  const modifier = <K extends keyof ProfilInitial>(champ: K, valeur: ProfilInitial[K]) =>
    setProfil((p) => ({ ...p, [champ]: valeur }));

  const basculerMuscle = (muscle: Muscle) => {
    const actuels = profil.objectifMusclesPrioritaires;
    if (actuels.includes(muscle)) {
      modifier("objectifMusclesPrioritaires", actuels.filter((m) => m !== muscle));
    } else if (actuels.length < 4) {
      modifier("objectifMusclesPrioritaires", [...actuels, muscle]);
    } else {
      toast.error("Quatre muscles prioritaires au maximum");
    }
  };

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: profil.nom || null,
          dateNaissance: profil.dateNaissance || null,
          taille: profil.taille ?? null,
          phaseNutritionnelle: profil.phaseNutritionnelle || null,
          objectifType: profil.objectifType || null,
          objectifMusclesPrioritaires: profil.objectifMusclesPrioritaires,
          objectifChiffre: profil.objectifChiffre || null,
          dateCible: profil.dateCible || null,
          frequenceCibleParSemaine: profil.frequenceCibleParSemaine ?? null,
          dureeSeanceCibleMinutes: profil.dureeSeanceCibleMinutes ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Profil enregistré");
      router.refresh();
    } catch {
      toast.error("Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  const nombreOuNull = (v: string) => (v === "" ? null : Number(v));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">Identité</h2>
        <div className="space-y-2">
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" value={profil.nom ?? ""} onChange={(e) => modifier("nom", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="naissance">Date de naissance</Label>
            <Input id="naissance" type="date" value={profil.dateNaissance ?? ""}
              onChange={(e) => modifier("dateNaissance", e.target.value || null)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taille">Taille (cm)</Label>
            <Input id="taille" type="number" value={profil.taille ?? ""}
              onChange={(e) => modifier("taille", nombreOuNull(e.target.value))} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">Objectif</h2>
        <div className="space-y-2">
          <Label>Objectif principal</Label>
          <Select value={profil.objectifType ?? ""} onValueChange={(v) => modifier("objectifType", v)}>
            <SelectTrigger><SelectValue placeholder="Choisir un objectif" /></SelectTrigger>
            <SelectContent>
              {OBJECTIFS.map((o) => (
                <SelectItem key={o.valeur} value={o.valeur}>{o.libelle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Phase nutritionnelle</Label>
          <Select value={profil.phaseNutritionnelle ?? ""} onValueChange={(v) => modifier("phaseNutritionnelle", v)}>
            <SelectTrigger><SelectValue placeholder="Choisir une phase" /></SelectTrigger>
            <SelectContent>
              {PHASES.map((p) => (
                <SelectItem key={p.valeur} value={p.valeur}>{p.libelle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Muscles prioritaires <span className="text-encre-3">(4 max)</span></Label>
          <div className="flex flex-wrap gap-2">
            {MUSCLES.map((m) => {
              const actif = profil.objectifMusclesPrioritaires.includes(m);
              return (
                <button key={m} type="button" onClick={() => basculerMuscle(m)}
                  aria-pressed={actif}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    actif ? "bg-encre text-papier border-encre" : "bg-carte text-encre-2 border-filet"
                  }`}>
                  {LIBELLES[m]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="objectifChiffre">Objectif chiffré</Label>
          <Input id="objectifChiffre" value={profil.objectifChiffre ?? ""}
            placeholder="93 kg de masse propre"
            onChange={(e) => modifier("objectifChiffre", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateCible">Échéance</Label>
          <Input id="dateCible" type="date" value={profil.dateCible ?? ""}
            onChange={(e) => modifier("dateCible", e.target.value || null)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">Entraînement</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="frequence">Séances par semaine</Label>
            <Input id="frequence" type="number" min={1} max={14}
              value={profil.frequenceCibleParSemaine ?? ""}
              onChange={(e) => modifier("frequenceCibleParSemaine", nombreOuNull(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duree">Durée cible (min)</Label>
            <Input id="duree" type="number" min={15} max={240}
              value={profil.dureeSeanceCibleMinutes ?? ""}
              onChange={(e) => modifier("dureeSeanceCibleMinutes", nombreOuNull(e.target.value))} />
          </div>
        </div>
      </section>

      <Button className="w-full h-12" onClick={enregistrer} disabled={enregistrement}>
        {enregistrement ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </div>
  );
}
