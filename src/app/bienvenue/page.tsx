"use client";

import { useEffect, useState } from "react";
import { messageErreur } from "@/lib/messages";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Home, Loader2, MapPin, Plus } from "lucide-react";
import {
  OBJECTIFS, NIVEAUX, PREFERENCES_MATERIEL,
  LIBELLES_OBJECTIF, LIBELLES_NIVEAU, LIBELLES_MATERIEL,
  BORNES_DUREE, MOIS_AVANT_REPRISE, estUneReprise,
} from "@/lib/validators/onboarding";
import { MUSCLES } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { nombre, type Fourchette } from "@/lib/saisie";
import { ChampNombre } from "@/components/onboarding/ChampNombre";
import { SelecteurFrequence } from "@/components/onboarding/SelecteurFrequence";
import { ChoixDuree } from "@/components/onboarding/ChoixDuree";
import { EchelleDouleur } from "@/components/onboarding/EchelleDouleur";
import { RechercheExercices, type ExerciceChoisi } from "@/components/onboarding/RechercheExercices";

/**
 * Onboarding.
 *
 * Il ne demande que ce que l'application ne peut pas déduire : une intention,
 * une contrainte, une disponibilité. Jamais les anciennes charges ni les
 * anciens records.
 *
 * Trois principes portent la mise en page, tous issus d'un essai sur téléphone :
 *
 *   — l'action principale ne défile pas. Elle vit dans un pied de page fixe,
 *     au-dessus de la zone sûre ; le contenu défile derrière, avec la réserve
 *     de place qu'il faut pour que rien ne se cache dessous.
 *   — un champ vide est vide. Les valeurs indicatives passent par le
 *     placeholder, jamais par une valeur pré-écrite qu'il faudrait effacer.
 *   — quand le bouton est inactif, l'écran dit pourquoi. Un CTA grisé sans
 *     explication est un cul-de-sac.
 *
 * « Reprendre le sport » ne figure plus parmi les objectifs : la reprise se
 * déduit des mois d'interruption (`estUneReprise`), et poser deux fois la même
 * question laissait deux réponses se contredire. La valeur reste au vocabulaire
 * pour les profils qui la portent déjà.
 */

type Etape = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
const DERNIERE: Etape = 7;

const OBJECTIFS_PROPOSES = OBJECTIFS.filter((o) => o !== "reprise");

interface Contrainte {
  muscle: string;
  severite: number;
}

interface Lieu {
  id: string;
  nom: string;
}

const carte = "rounded-xl border text-left transition-colors w-full";
const actif = "border-encre bg-encre text-papier";
const inactif = "border-filet bg-carte text-encre";
const puce = "rounded-full border px-3 py-2 text-sm transition-colors";

export default function PageBienvenue() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [prenom, setPrenom] = useState<string | null>(null);

  const [objectifType, setObjectifType] = useState<string>("prise_de_muscle");
  const [musclesPrioritaires, setMusclesPrioritaires] = useState<string[]>([]);
  const [niveauExperience, setNiveauExperience] = useState<string>("intermediaire");
  // Les champs numériques gardent la saisie brute, vide par défaut : c'est la
  // seule façon de distinguer « pas répondu » de « zéro », et d'éviter le zéro
  // qui survivait à la frappe.
  const [anneesDePratique, setAnneesDePratique] = useState("");
  const [moisDInterruption, setMoisDInterruption] = useState("");
  const [listeContraintes, setListeContraintes] = useState<Contrainte[]>([]);
  const [frequence, setFrequence] = useState<Fourchette>({ min: 2, cible: 3, max: 4 });
  const [dureeCible, setDureeCible] = useState(String(BORNES_DUREE.defaut));
  const [dureeMax, setDureeMax] = useState(String(BORNES_DUREE.defautMax));
  const [preferenceMateriel, setPreferenceMateriel] = useState<string>("melange");
  const [exercicesRefuses, setExercicesRefuses] = useState<ExerciceChoisi[]>([]);
  const [lieuId, setLieuId] = useState<string>("");
  const [nouveauLieuNom, setNouveauLieuNom] = useState("");

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => {
        if (d?.termine) { router.replace("/dashboard"); return; }
        if (Array.isArray(d?.salles)) {
          setLieux(d.salles);
          if (d.salles.length > 0) setLieuId(d.salles[0].id);
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

  const cible = nombre(dureeCible, BORNES_DUREE.defaut);
  const maximum = nombre(dureeMax, BORNES_DUREE.defautMax);
  const dureeHorsBornes = (v: number) => v < BORNES_DUREE.min || v > BORNES_DUREE.max;

  /**
   * Ce qui empêche d'avancer, dit en clair.
   * Un bouton grisé sans raison oblige à deviner ; la raison s'affiche à côté
   * du champ concerné et sous le bouton.
   */
  const blocage = (): string | null => {
    if (etape === 5) {
      if (dureeHorsBornes(cible) || dureeHorsBornes(maximum)) {
        return `Une séance dure entre ${BORNES_DUREE.min} et ${BORNES_DUREE.max} minutes.`;
      }
      if (cible > maximum) return "La durée idéale ne peut pas dépasser le maximum.";
    }
    if (etape === 6 && !lieuId && nouveauLieuNom.trim().length < 2) {
      return "Donne un nom à ton lieu d'entraînement.";
    }
    return null;
  };
  const raisonBlocage = blocage();

  const terminer = async () => {
    // Un deuxième appui pendant l'écriture créerait une deuxième salle et un
    // deuxième bloc : l'état d'envoi ferme la porte avant la requête.
    if (envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const reponse = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectifType,
          musclesPrioritaires,
          niveauExperience,
          anneesDePratique: nombre(anneesDePratique, 0),
          moisDInterruption: nombre(moisDInterruption, 0),
          contraintes: listeContraintes,
          frequenceCibleParSemaine: frequence.cible,
          frequenceMinParSemaine: frequence.min,
          frequenceMaxParSemaine: frequence.max,
          dureeSeanceCibleMinutes: cible,
          dureeSeanceMaxMinutes: maximum,
          preferenceMateriel,
          exercicesRefuses: exercicesRefuses.map((e) => e.id),
          salleId: lieuId || undefined,
          nouvelleSalleNom: lieuId ? undefined : nouveauLieuNom.trim() || undefined,
        }),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) throw new Error(messageErreur("enregistrer ton profil", corps?.error, reponse.status));
      // On n'avance qu'une fois l'écriture réellement acceptée.
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : messageErreur("enregistrer ton profil"));
      setEnvoi(false);
    }
  };

  const reprise = moisDInterruption !== "" && estUneReprise(nombre(moisDInterruption, 0));
  const derniere = etape === DERNIERE;

  // `h-dvh` et non `min-h-dvh` : avec une hauteur seulement minimale, une étape
  // longue fait grandir le conteneur au lieu de faire défiler `main`, et la page
  // se retrouve avec deux ascenseurs — celui du corps emportant l'en-tête collé.
  return (
    <div className="h-dvh bg-papier text-encre flex flex-col overflow-hidden">
      <header
        className="sticky top-0 z-20 bg-papier px-4 pb-3 flex items-center gap-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)" }}
      >
        {etape > 0 ? (
          <button
            type="button"
            onClick={() => setEtape((e) => (e - 1) as Etape)}
            aria-label="Étape précédente"
            className="text-encre-2 -ml-2 w-9 h-9 grid place-items-center shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <span className="w-0" />
        )}
        <div className="flex-1 flex gap-1" role="progressbar"
          aria-valuenow={etape + 1} aria-valuemin={1} aria-valuemax={DERNIERE + 1}
          aria-label={`Étape ${etape + 1} sur ${DERNIERE + 1}`}>
          {Array.from({ length: DERNIERE + 1 }, (_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= etape ? "bg-encre" : "bg-filet"}`} />
          ))}
        </div>
      </header>

      {/* La réserve du bas vaut la hauteur du pied de page plus la zone sûre :
          sans elle, la dernière question se cache derrière le bouton.
          `min-h-0` : sans lui un enfant flex refuse de descendre sous la hauteur
          de son contenu, et `overflow-y-auto` n'a jamais rien à faire défiler. */}
      <main
        className="flex-1 min-h-0 px-4 overflow-y-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6.5rem)" }}
      >
        {etape === 0 && (
          <section className="pt-12 space-y-4">
            <h1 className="text-3xl font-bold leading-tight">
              {prenom ? `Bonjour ${prenom}` : "Faisons connaissance"}
            </h1>
            <p className="text-encre-2 leading-relaxed">
              Quelques questions pour construire ton point de départ. Trois minutes.
            </p>
            <p className="text-encre-3 text-sm leading-relaxed">
              Pas besoin de retrouver tes anciennes charges : on repart proprement, et
              l&apos;application les apprendra avec toi.
            </p>
          </section>
        )}

        {etape === 1 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Ton objectif</h2>
              <p className="text-encre-3 text-sm mt-1">Il décide de la répartition du volume.</p>
            </div>
            {/* Compact : sept options tiennent à l'écran sans défiler, en
                gardant une cible tactile de 48 px. */}
            <div className="grid gap-1.5">
              {OBJECTIFS_PROPOSES.map((o) => (
                <button key={o} type="button" onClick={() => setObjectifType(o)}
                  aria-pressed={objectifType === o}
                  className={`${carte} px-4 h-12 text-sm ${objectifType === o ? actif : inactif}`}>
                  {LIBELLES_OBJECTIF[o]}
                </button>
              ))}
            </div>
          </section>
        )}

        {etape === 2 && (
          <section className="pt-4 space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Muscles prioritaires</h2>
              <p className="text-encre-3 text-sm mt-1">
                Facultatif · jusqu&apos;à 4 · {musclesPrioritaires.length} sélectionné
                {musclesPrioritaires.length > 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((m) => {
                const choisi = musclesPrioritaires.includes(m);
                const complet = !choisi && musclesPrioritaires.length >= 4;
                return (
                  <button key={m} type="button" onClick={() => basculerMuscle(m)}
                    aria-pressed={choisi} disabled={complet}
                    className={`${puce} ${choisi ? actif : inactif} ${complet ? "opacity-40" : ""}`}>
                    {libelleMuscle(m)}
                  </button>
                );
              })}
            </div>
            {musclesPrioritaires.length >= 4 && (
              <p className="text-encre-3 text-xs">
                Quatre suffisent. Retires-en un pour en choisir un autre.
              </p>
            )}
          </section>
        )}

        {etape === 3 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Ton point de départ</h2>
              <p className="text-encre-3 text-sm mt-1">
                Ton aisance technique, pas tes performances.
              </p>
            </div>
            <div className="grid gap-1.5">
              {NIVEAUX.map((n) => (
                <button key={n} type="button" onClick={() => setNiveauExperience(n)}
                  aria-pressed={niveauExperience === n}
                  className={`${carte} px-4 h-12 text-sm ${niveauExperience === n ? actif : inactif}`}>
                  {LIBELLES_NIVEAU[n]}
                </button>
              ))}
            </div>

            <ChampNombre
              id="annees"
              label="Années de pratique, au total"
              valeur={anneesDePratique}
              onChange={setAnneesDePratique}
              placeholder="2"
              unite="ans"
              maxCaracteres={2}
            />

            <ChampNombre
              id="mois"
              label="Depuis ton dernier entraînement régulier"
              valeur={moisDInterruption}
              onChange={setMoisDInterruption}
              placeholder="0"
              unite="mois"
              aide="0 si tu t'entraînes actuellement."
            />

            {reprise && (
              <p className="text-sm text-encre-2 border-l-2 border-filet pl-3 py-1">
                {/* `{" "}` explicite : JSX rogne l'espace en tête d'un texte
                    multiligne, et « 2 mois » devenait « 2mois ». */}
                Après {MOIS_AVANT_REPRISE}{" "}
                mois ou plus, tes premières séances serviront à
                retrouver tes charges et à mesurer ta récupération. Rien ne sera poussé à
                l&apos;échec.
              </p>
            )}
          </section>
        )}

        {etape === 4 && (
          <section className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Une gêne en ce moment ?</h2>
              <p className="text-encre-3 text-sm mt-1">
                Signale une douleur ou une gêne actuelle pour que tes séances puissent
                s&apos;y adapter. Facultatif.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((m) => {
                const touche = listeContraintes.some((c) => c.muscle === m);
                return (
                  <button key={m} type="button" onClick={() => basculerContrainte(m)}
                    aria-pressed={touche}
                    className={`${puce} ${touche ? actif : inactif}`}>
                    {libelleMuscle(m)}
                  </button>
                );
              })}
            </div>
            {listeContraintes.map((c) => (
              <div key={c.muscle} className="rounded-xl border border-filet bg-carte p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{libelleMuscle(c.muscle)}</span>
                  <span className="chiffres text-sm text-encre-2 tabular-nums">{c.severite}/10</span>
                </div>
                <EchelleDouleur
                  valeur={c.severite}
                  onChange={(v) => reglerSeverite(c.muscle, v)}
                  labelZone={libelleMuscle(c.muscle)}
                />
              </div>
            ))}
            <p className="text-encre-3 text-xs">
              L&apos;application n&apos;établit aucun diagnostic. Si une douleur est vive ou
              inhabituelle, consulte.
            </p>
          </section>
        )}

        {etape === 5 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Ta disponibilité</h2>
              <p className="text-encre-3 text-sm mt-1">
                Ta semaine minimale, idéale et maximale, pour que le programme reste souple.
              </p>
            </div>

            <SelecteurFrequence valeur={frequence} onChange={setFrequence} />

            <ChoixDuree label="Durée idéale d'une séance" valeur={dureeCible} onChange={setDureeCible} />
            <ChoixDuree
              label="Maximum quand tu as le temps"
              valeur={dureeMax}
              onChange={setDureeMax}
              aide={cible > maximum ? undefined : "Le programme s'adaptera entre les deux."}
            />
          </section>
        )}

        {etape === 6 && (
          <section className="pt-4 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Où t&apos;entraînes-tu ?</h2>
              <p className="text-encre-3 text-sm mt-1">
                Une salle, chez toi, ailleurs. Tu décriras le matériel plus tard — pas besoin
                de tout inventorier maintenant.
              </p>
            </div>

            <div className="grid gap-1.5">
              {lieux.map((l) => (
                <button key={l.id} type="button" onClick={() => setLieuId(l.id)}
                  aria-pressed={lieuId === l.id}
                  className={`${carte} px-4 h-12 text-sm flex items-center gap-2.5 ${
                    lieuId === l.id ? actif : inactif
                  }`}>
                  <MapPin className="w-4 h-4 shrink-0" aria-hidden />
                  {l.nom}
                </button>
              ))}
              <button type="button" onClick={() => setLieuId("")}
                aria-pressed={lieuId === ""}
                className={`${carte} px-4 h-12 text-sm flex items-center gap-2.5 ${
                  lieuId === "" ? actif : inactif
                }`}>
                <Plus className="w-4 h-4 shrink-0" aria-hidden />
                {lieux.length > 0 ? "Un autre lieu" : "Ajouter un lieu"}
              </button>
            </div>

            {lieuId === "" && (
              <div className="space-y-2">
                <label htmlFor="lieu" className="text-encre-2 text-sm block">
                  Nom du lieu
                </label>
                <Input
                  id="lieu"
                  value={nouveauLieuNom}
                  onChange={(e) => setNouveauLieuNom(e.target.value)}
                  placeholder="Basic-Fit Purpan"
                  enterKeyHint="done"
                  className="bg-carte border-filet text-encre h-12 text-base"
                />
                <div className="flex flex-wrap gap-2">
                  {["Chez moi", "Salle de quartier"].map((suggestion) => (
                    <button key={suggestion} type="button"
                      onClick={() => setNouveauLieuNom(suggestion)}
                      className={`${puce} ${inactif} text-xs flex items-center gap-1.5`}>
                      <Home className="w-3.5 h-3.5" aria-hidden />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {etape === 7 && (
          <section className="pt-4 space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Tes préférences</h2>
              <p className="text-encre-3 text-sm mt-1">Le coach apprendra le reste tout seul.</p>
            </div>
            <div className="grid gap-1.5">
              {PREFERENCES_MATERIEL.map((p) => (
                <button key={p} type="button" onClick={() => setPreferenceMateriel(p)}
                  aria-pressed={preferenceMateriel === p}
                  className={`${carte} px-4 h-12 text-sm ${preferenceMateriel === p ? actif : inactif}`}>
                  {LIBELLES_MATERIEL[p]}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-encre-2 text-sm">
                Exercices dont tu ne veux pas <span className="text-encre-3">· facultatif</span>
              </p>
              <RechercheExercices choisis={exercicesRefuses} onChange={setExercicesRefuses} />
            </div>
          </section>
        )}
      </main>

      {/* Fixe, pas sticky : sur Safari iOS un pied de page collant remonte avec
          le clavier et finit hors de portée. Ici il reste où il est, et le
          champ actif défile sous lui. */}
      <footer
        className="fixed inset-x-0 bottom-0 z-20 bg-papier border-t border-filet px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      >
        {(raisonBlocage || erreur) && (
          <p className={`text-sm mb-2 ${erreur ? "text-perte" : "text-encre-2"}`}>
            {erreur ?? raisonBlocage}
          </p>
        )}
        <button
          type="button"
          onClick={() => (derniere ? terminer() : setEtape((e) => (e + 1) as Etape))}
          disabled={Boolean(raisonBlocage) || envoi}
          className="w-full h-12 rounded-xl bg-encre text-papier font-medium disabled:opacity-40 grid place-items-center"
        >
          {envoi ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              Enregistrement…
            </span>
          ) : derniere ? (
            "Terminer"
          ) : etape === 0 ? (
            "Commencer"
          ) : (
            "Continuer"
          )}
        </button>
      </footer>
    </div>
  );
}
