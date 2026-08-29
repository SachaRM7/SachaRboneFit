"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, MapPin, Plus, X } from "lucide-react";
import {
  OBJECTIFS, NIVEAUX, PREFERENCES_MATERIEL,
  LIBELLES_OBJECTIF, LIBELLES_NIVEAU, LIBELLES_MATERIEL,
  MOIS_AVANT_REPRISE,
} from "@/lib/validators/onboarding";
import { MUSCLES } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";

/**
 * Onboarding.
 *
 * Il ne demande que ce que l'application ne peut pas déduire : une intention,
 * une contrainte, une disponibilité. Jamais les anciennes charges ni les
 * anciens records — l'expérience technique n'est pas la performance actuelle,
 * et cette application est un nouveau départ.
 *
 * Chaque étape tient dans un écran, avec une seule question principale. Un
 * questionnaire de sept pages denses ferait abandonner avant la salle.
 */

type Etape = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const DERNIERE: Etape = 6;

interface Contrainte {
  muscle: string;
  severite: number;
}

interface Salle {
  id: string;
  nom: string;
}

const choix =
  "rounded-xl border px-4 py-3.5 text-left text-sm transition-colors w-full";
const choixActif = "border-encre bg-encre text-papier";
const choixInactif = "border-filet bg-carte text-encre hover:bg-papier-2";

export default function PageBienvenue() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [salles, setSalles] = useState<Salle[]>([]);
  const [prenom, setPrenom] = useState<string | null>(null);

  const [objectifType, setObjectifType] = useState<string>("prise_de_muscle");
  const [musclesPrioritaires, setMusclesPrioritaires] = useState<string[]>([]);
  const [niveauExperience, setNiveauExperience] = useState<string>("intermediaire");
  const [anneesDePratique, setAnneesDePratique] = useState(2);
  const [moisDInterruption, setMoisDInterruption] = useState(0);
  const [listeContraintes, setListeContraintes] = useState<Contrainte[]>([]);
  const [frequenceCible, setFrequenceCible] = useState(3);
  const [frequenceMin, setFrequenceMin] = useState(2);
  const [frequenceMax, setFrequenceMax] = useState(4);
  const [dureeCible, setDureeCible] = useState(60);
  const [dureeMax, setDureeMax] = useState(75);
  const [preferenceMateriel, setPreferenceMateriel] = useState<string>("melange");
  const [exercicesRefuses, setExercicesRefuses] = useState<string>("");
  const [salleId, setSalleId] = useState<string>("");
  const [nouvelleSalleNom, setNouvelleSalleNom] = useState("");

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => {
        if (d?.termine) { router.replace("/dashboard"); return; }
        if (Array.isArray(d?.salles)) {
          setSalles(d.salles);
          if (d.salles.length > 0) setSalleId(d.salles[0].id);
        }
        setPrenom(d?.prenom ?? null);
      })
      .catch(() => {});
  }, [router]);

  const basculerMuscle = (m: string) =>
    setMusclesPrioritaires((liste) =>
      liste.includes(m) ? liste.filter((x) => x !== m) : liste.length < 4 ? [...liste, m] : liste,
    );

  const basculerContrainte = (muscle: string) =>
    setListeContraintes((liste) =>
      liste.some((c) => c.muscle === muscle)
        ? liste.filter((c) => c.muscle !== muscle)
        : [...liste, { muscle, severite: 4 }],
    );

  const reglerSeverite = (muscle: string, severite: number) =>
    setListeContraintes((liste) =>
      liste.map((c) => (c.muscle === muscle ? { ...c, severite } : c)),
    );

  const terminer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectifType, musclesPrioritaires,
          niveauExperience, anneesDePratique, moisDInterruption,
          contraintes: listeContraintes,
          frequenceCibleParSemaine: frequenceCible,
          frequenceMinParSemaine: frequenceMin,
          frequenceMaxParSemaine: frequenceMax,
          dureeSeanceCibleMinutes: dureeCible,
          dureeSeanceMaxMinutes: dureeMax,
          preferenceMateriel,
          exercicesRefuses: exercicesRefuses
            .split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20),
          salleId: salleId || undefined,
          nouvelleSalleNom: salleId ? undefined : nouvelleSalleNom.trim() || undefined,
        }),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) throw new Error(corps?.error ?? `HTTP ${reponse.status}`);
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : "Enregistrement impossible");
      setEnvoi(false);
    }
  };

  const peutAvancer = (): boolean => {
    if (etape === 5) return salles.length > 0 ? Boolean(salleId) : nouvelleSalleNom.trim().length >= 2;
    return true;
  };

  const reprise = moisDInterruption >= MOIS_AVANT_REPRISE;

  return (
    <div className="min-h-dvh bg-papier text-encre flex flex-col">
      <header className="px-4 pt-6 pb-3 flex items-center gap-2">
        {etape > 0 && (
          <button
            type="button"
            onClick={() => setEtape((e) => (e - 1) as Etape)}
            aria-label="Étape précédente"
            className="text-encre-2 -ml-1 p-1"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 flex gap-1" aria-hidden>
          {Array.from({ length: DERNIERE + 1 }, (_, i) => (
            <span
              key={i}
              className={`h-0.5 flex-1 rounded-full ${i <= etape ? "bg-encre" : "bg-filet"}`}
            />
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 pb-4 overflow-y-auto">
        {etape === 0 && (
          <section className="pt-10">
            <h1 className="text-3xl font-bold leading-tight">
              {prenom ? `Bonjour ${prenom}` : "Faisons connaissance"}
            </h1>
            <p className="text-encre-2 mt-4 leading-relaxed">
              Je vais construire ton entraînement autour de ton objectif, de ton niveau
              actuel, de tes salles et de ta récupération.
            </p>
            <p className="text-encre-3 mt-3 text-sm">
              Trois minutes. Je ne te demanderai ni tes anciennes charges ni tes anciens
              records : on repart proprement, et l&apos;application apprendra tes charges
              en t&apos;entraînant.
            </p>
          </section>
        )}

        {etape === 1 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Ton objectif</h2>
              <p className="text-encre-3 text-sm mt-1">Il décide de la répartition du volume.</p>
            </div>
            <div className="grid gap-2">
              {OBJECTIFS.map((o) => (
                <button key={o} type="button" onClick={() => setObjectifType(o)}
                  className={`${choix} ${objectifType === o ? choixActif : choixInactif}`}>
                  {LIBELLES_OBJECTIF[o]}
                </button>
              ))}
            </div>
            <div>
              <Label className="text-encre-2 text-xs">
                Muscles prioritaires <span className="text-encre-3">(jusqu&apos;à 4, facultatif)</span>
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {MUSCLES.map((m) => (
                  <button key={m} type="button" onClick={() => basculerMuscle(m)}
                    aria-pressed={musclesPrioritaires.includes(m)}
                    className={`rounded-full border px-3 py-2 text-xs ${
                      musclesPrioritaires.includes(m) ? choixActif : choixInactif
                    }`}>
                    {libelleMuscle(m)}
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {etape === 2 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Ton point de départ</h2>
              <p className="text-encre-3 text-sm mt-1">
                Ton aisance technique, pas tes performances.
              </p>
            </div>
            <div className="grid gap-2">
              {NIVEAUX.map((n) => (
                <button key={n} type="button" onClick={() => setNiveauExperience(n)}
                  className={`${choix} ${niveauExperience === n ? choixActif : choixInactif}`}>
                  {LIBELLES_NIVEAU[n]}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-encre-2 text-xs">Années de pratique, au total</Label>
              <Input type="number" inputMode="numeric" min={0} max={60} value={anneesDePratique}
                onChange={(e) => setAnneesDePratique(Number(e.target.value) || 0)}
                className="bg-carte border-filet text-encre chiffres" />
            </div>

            <div className="space-y-2">
              <Label className="text-encre-2 text-xs">
                Mois depuis ta dernière période régulière
              </Label>
              <Input type="number" inputMode="numeric" min={0} max={600} value={moisDInterruption}
                onChange={(e) => setMoisDInterruption(Number(e.target.value) || 0)}
                className="bg-carte border-filet text-encre chiffres" />
              <p className="text-encre-3 text-xs">0 si tu t&apos;entraînes actuellement.</p>
              {reprise && (
                <p className="text-sm text-encre-2 border-l-2 border-filet pl-3 py-1">
                  Tes premières séances serviront à retrouver tes charges et à mesurer
                  ta récupération. Rien ne sera poussé à l&apos;échec.
                </p>
              )}
            </div>
          </section>
        )}

        {etape === 3 && (
          <section className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Une gêne en ce moment ?</h2>
              <p className="text-encre-3 text-sm mt-1">
                Touche les zones concernées. Au-delà de 7, l&apos;exercice sera écarté
                plutôt qu&apos;allégé.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((m) => {
                const active = listeContraintes.some((c) => c.muscle === m);
                return (
                  <button key={m} type="button" onClick={() => basculerContrainte(m)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-2 text-xs ${active ? choixActif : choixInactif}`}>
                    {libelleMuscle(m)}
                  </button>
                );
              })}
            </div>
            {listeContraintes.map((c) => (
              <div key={c.muscle} className="rounded-xl border border-filet bg-carte p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{libelleMuscle(c.muscle)}</span>
                  <button type="button" onClick={() => basculerContrainte(c.muscle)}
                    aria-label={`Retirer ${libelleMuscle(c.muscle)}`} className="text-encre-3">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="range" min={1} max={10} value={c.severite}
                    onChange={(e) => reglerSeverite(c.muscle, Number(e.target.value))}
                    className="flex-1 accent-current" />
                  <span className="chiffres text-sm w-8 text-right">{c.severite}/10</span>
                </div>
              </div>
            ))}
            <p className="text-encre-3 text-xs">
              L&apos;application n&apos;établit aucun diagnostic. Si une douleur est vive
              ou inhabituelle, consulte.
            </p>
          </section>
        )}

        {etape === 4 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Ta disponibilité</h2>
              <p className="text-encre-3 text-sm mt-1">
                Une fourchette, pas un chiffre : un programme bâti sur une seule fréquence
                s&apos;effondre dès qu&apos;une séance saute.
              </p>
            </div>
            {([
              ["Minimum réaliste", frequenceMin, setFrequenceMin],
              ["Objectif", frequenceCible, setFrequenceCible],
              ["Maximum possible", frequenceMax, setFrequenceMax],
            ] as const).map(([libelle, valeur, setter]) => (
              <div key={libelle}>
                <Label className="text-encre-2 text-xs">{libelle}</Label>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button key={n} type="button" onClick={() => setter(n)}
                      className={`chiffres flex-1 h-11 rounded-lg border text-sm ${
                        valeur === n ? choixActif : choixInactif
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-encre-2 text-xs">Durée idéale</Label>
                <Input type="number" inputMode="numeric" value={dureeCible}
                  onChange={(e) => setDureeCible(Number(e.target.value) || 0)}
                  className="bg-carte border-filet text-encre chiffres mt-2" />
              </div>
              <div>
                <Label className="text-encre-2 text-xs">Maximum</Label>
                <Input type="number" inputMode="numeric" value={dureeMax}
                  onChange={(e) => setDureeMax(Number(e.target.value) || 0)}
                  className="bg-carte border-filet text-encre chiffres mt-2" />
              </div>
            </div>
          </section>
        )}

        {etape === 5 && (
          <section className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Où t&apos;entraînes-tu ?</h2>
              <p className="text-encre-3 text-sm mt-1">
                Tu compléteras les machines pendant tes séances — pas besoin de tout
                inventorier maintenant.
              </p>
            </div>
            {salles.length > 0 && (
              <div className="grid gap-2">
                {salles.map((s) => (
                  <button key={s.id} type="button" onClick={() => setSalleId(s.id)}
                    className={`${choix} flex items-center gap-2 ${salleId === s.id ? choixActif : choixInactif}`}>
                    <MapPin className="w-4 h-4 shrink-0" />
                    {s.nom}
                  </button>
                ))}
                <button type="button" onClick={() => setSalleId("")}
                  className={`${choix} flex items-center gap-2 ${salleId === "" ? choixActif : choixInactif}`}>
                  <Plus className="w-4 h-4 shrink-0" />
                  Une autre salle
                </button>
              </div>
            )}
            {salleId === "" && (
              <div className="space-y-2">
                <Label className="text-encre-2 text-xs">Nom de la salle</Label>
                <Input value={nouvelleSalleNom} onChange={(e) => setNouvelleSalleNom(e.target.value)}
                  placeholder="Basic-Fit Purpan"
                  className="bg-carte border-filet text-encre" />
              </div>
            )}
          </section>
        )}

        {etape === 6 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Tes préférences</h2>
              <p className="text-encre-3 text-sm mt-1">Le coach apprendra le reste tout seul.</p>
            </div>
            <div className="grid gap-2">
              {PREFERENCES_MATERIEL.map((p) => (
                <button key={p} type="button" onClick={() => setPreferenceMateriel(p)}
                  className={`${choix} ${preferenceMateriel === p ? choixActif : choixInactif}`}>
                  {LIBELLES_MATERIEL[p]}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-encre-2 text-xs">
                Exercices dont tu ne veux pas <span className="text-encre-3">(facultatif)</span>
              </Label>
              <Input value={exercicesRefuses} onChange={(e) => setExercicesRefuses(e.target.value)}
                placeholder="Soulevé de terre, Burpees"
                className="bg-carte border-filet text-encre" />
              <p className="text-encre-3 text-xs">Séparés par des virgules.</p>
            </div>
            {erreur && (
              <p className="rounded-lg bg-perte-fond border border-perte/30 px-3 py-2 text-perte text-sm">
                {erreur}
              </p>
            )}
          </section>
        )}
      </main>

      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 border-t border-filet">
        <Button
          className="w-full h-12 rounded-full bg-encre text-papier hover:bg-encre/90"
          disabled={!peutAvancer() || envoi}
          onClick={() => (etape === DERNIERE ? terminer() : setEtape((e) => (e + 1) as Etape))}
        >
          {etape === DERNIERE ? (envoi ? "Enregistrement…" : "Terminer") : etape === 0 ? "Commencer" : "Continuer"}
        </Button>
      </footer>
    </div>
  );
}
