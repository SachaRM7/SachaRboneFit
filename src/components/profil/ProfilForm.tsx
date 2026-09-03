"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MUSCLES, LIBELLES, type Muscle } from "@/lib/referentiels/muscles";
import {
  BORNES_DUREE, OBJECTIFS as LISTE_OBJECTIFS, LIBELLES_OBJECTIF,
} from "@/lib/validators/onboarding";
import { QuiTuEs, type MesuresDuCorps } from "@/components/onboarding/QuiTuEs";
import { SelecteurFrequence } from "@/components/onboarding/SelecteurFrequence";
import { ChoixDuree } from "@/components/onboarding/ChoixDuree";
import { ajusterFourchette, nombre, type Fourchette } from "@/lib/saisie";

/**
 * Le profil, et l'onboarding, disent la même chose de la même façon.
 *
 * Ils ne le faisaient pas. Le profil demandait « Séances par semaine » — un
 * seul chiffre — alors que la base porte une FOURCHETTE que l'onboarding
 * remplit et que le moteur lit en entier : le bilan compare les séances faites
 * au minimum et à la cible, le tableau de bord plafonne au maximum. Modifier
 * ce chiffre unique laissait donc un minimum et un maximum incohérents avec
 * lui, en silence. Même chose pour la durée, dont seul le repère idéal était
 * modifiable alors que le constructeur de séance lit aussi le maximum.
 *
 * Les champs communs viennent maintenant des mêmes composants et des mêmes
 * bornes que l'onboarding. C'est la seule façon que les deux écrans ne
 * divergent pas — ils écrivent les mêmes colonnes.
 *
 * Le poids n'est pas ici : sa source est la courbe des pesées. Une deuxième
 * porte sur la même donnée aurait divergé dès la deuxième pesée.
 */

const OBJECTIFS = LISTE_OBJECTIFS.map((valeur) => ({
  valeur,
  libelle: LIBELLES_OBJECTIF[valeur],
}));

const PHASES = [
  { valeur: "seche", libelle: "Sèche" },
  { valeur: "prise_de_masse", libelle: "Prise de masse" },
  { valeur: "maintien", libelle: "Maintien" },
] as const;

export interface ProfilInitial {
  nom: string | null;
  dateNaissance: string | null;
  sexe: string | null;
  taille: number | null;
  phaseNutritionnelle: string | null;
  objectifType: string | null;
  objectifMusclesPrioritaires: string[];
  objectifChiffre: string | null;
  dateCible: string | null;
  frequenceMinParSemaine: number | null;
  frequenceCibleParSemaine: number | null;
  frequenceMaxParSemaine: number | null;
  dureeSeanceCibleMinutes: number | null;
  dureeSeanceMaxMinutes: number | null;
}

/** Ce que le profil propose quand la colonne est vide — jamais écrit tout seul. */
const FREQUENCE_PAR_DEFAUT: Fourchette = { min: 2, cible: 3, max: 4 };

export function ProfilForm({ initial }: { initial: ProfilInitial }) {
  const router = useRouter();
  const [profil, setProfil] = useState(initial);
  const [mesures, setMesures] = useState<MesuresDuCorps>({
    dateNaissance: initial.dateNaissance ?? "",
    sexe: initial.sexe ?? "",
    taille: initial.taille !== null ? String(initial.taille) : "",
    poids: "",
  });
  const [frequence, setFrequence] = useState<Fourchette>({
    min: initial.frequenceMinParSemaine ?? FREQUENCE_PAR_DEFAUT.min,
    cible: initial.frequenceCibleParSemaine ?? FREQUENCE_PAR_DEFAUT.cible,
    max: initial.frequenceMaxParSemaine ?? FREQUENCE_PAR_DEFAUT.max,
  });
  const [dureeCible, setDureeCible] = useState(
    String(initial.dureeSeanceCibleMinutes ?? BORNES_DUREE.defaut),
  );
  const [dureeMax, setDureeMax] = useState(
    String(initial.dureeSeanceMaxMinutes ?? BORNES_DUREE.defautMax),
  );
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

  const cible = nombre(dureeCible, BORNES_DUREE.defaut);
  const maximum = nombre(dureeMax, BORNES_DUREE.defautMax);

  /** Ce qui empêche d'enregistrer, dit avant l'envoi plutôt qu'après le refus. */
  const blocage = (): string | null => {
    if (cible < BORNES_DUREE.min || maximum > BORNES_DUREE.max) {
      return `Une séance dure entre ${BORNES_DUREE.min} et ${BORNES_DUREE.max} minutes.`;
    }
    if (cible > maximum) return "La durée idéale ne peut pas dépasser le maximum.";
    const taille = mesures.taille ? nombre(mesures.taille, 0) : null;
    if (taille !== null && (taille < 100 || taille > 250)) {
      return "La taille se situe entre 100 et 250 cm.";
    }
    return null;
  };
  const raisonBlocage = blocage();

  const enregistrer = async () => {
    if (raisonBlocage) return;
    setEnregistrement(true);
    try {
      const res = await fetch("/api/user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: profil.nom || null,
          dateNaissance: mesures.dateNaissance || null,
          sexe: mesures.sexe || null,
          taille: mesures.taille ? nombre(mesures.taille, 0) : null,
          phaseNutritionnelle: profil.phaseNutritionnelle || null,
          objectifType: profil.objectifType || null,
          objectifMusclesPrioritaires: profil.objectifMusclesPrioritaires,
          objectifChiffre: profil.objectifChiffre || null,
          dateCible: profil.dateCible || null,
          // Les trois, toujours ensemble : n'en écrire qu'une laisserait les
          // deux autres en contradiction avec elle.
          frequenceMinParSemaine: frequence.min,
          frequenceCibleParSemaine: frequence.cible,
          frequenceMaxParSemaine: frequence.max,
          dureeSeanceCibleMinutes: cible,
          dureeSeanceMaxMinutes: maximum,
        }),
      });
      const corps = await res.json().catch(() => null);
      if (!res.ok) throw new Error(corps?.error ?? "Enregistrement impossible");
      toast.success("Profil enregistré");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">Toi</h2>
        <div className="space-y-2">
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" value={profil.nom ?? ""} className="h-12 text-base"
            onChange={(e) => modifier("nom", e.target.value)} />
        </div>
        {/* Le même bloc que l'onboarding, sans le poids : celui-ci vit dans la
            courbe des pesées, et l'écran y renvoie plutôt que d'ouvrir une
            deuxième porte sur la même donnée. */}
        <QuiTuEs valeurs={mesures} onChange={setMesures} avecPoids={false} />
        <Link href="/bodyweight" className="text-encre-2 text-sm underline underline-offset-2">
          Suivre mon poids
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">Objectif</h2>
        <div className="space-y-2">
          <Label>Objectif principal</Label>
          <Select value={profil.objectifType ?? ""} onValueChange={(v) => modifier("objectifType", v)}>
            <SelectTrigger className="h-12"><SelectValue placeholder="Choisir un objectif" /></SelectTrigger>
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
            <SelectTrigger className="h-12"><SelectValue placeholder="Choisir une phase" /></SelectTrigger>
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
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
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
            placeholder="93 kg de masse propre" className="h-12 text-base"
            onChange={(e) => modifier("objectifChiffre", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateCible">Échéance</Label>
          <Input id="dateCible" type="date" value={profil.dateCible ?? ""} className="h-12 text-base"
            onChange={(e) => modifier("dateCible", e.target.value || null)} />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-encre-2 uppercase tracking-wide">Disponibilité</h2>
        {/* Les trois valeurs, comme à l'inscription. Le profil n'en montrait
            qu'une : le minimum et le maximum restaient ceux de l'onboarding,
            en contradiction silencieuse avec la cible qu'on venait de changer. */}
        <SelecteurFrequence
          valeur={frequence}
          onChange={(f) => setFrequence(ajusterFourchette(f, "cible", f.cible))}
        />
        <ChoixDuree label="Durée idéale d'une séance" valeur={dureeCible} onChange={setDureeCible} />
        <ChoixDuree
          label="Durée maximale"
          valeur={dureeMax}
          onChange={setDureeMax}
          aide="Au-delà, le coach propose de raccourcir plutôt que de laisser filer."
        />
      </section>

      {raisonBlocage && <p className="text-perte text-sm">{raisonBlocage}</p>}

      <Button className="w-full h-12" onClick={enregistrer}
        disabled={enregistrement || Boolean(raisonBlocage)}>
        {enregistrement ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </div>
  );
}
