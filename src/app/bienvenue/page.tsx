"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, Dumbbell, Home, MapPin, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { messageErreur } from "@/lib/messages";
import { BORNES_DUREE, LIBELLES_MATERIEL, LIBELLES_OBJECTIF, MOIS_AVANT_REPRISE, NIVEAUX, OBJECTIFS, PREFERENCES_MATERIEL, estUneReprise } from "@/lib/validators/onboarding";
import { MUSCLES } from "@/lib/referentiels/muscles";
import { libelleMuscle } from "@/lib/referentiels/libelles";
import { nombre, type Fourchette } from "@/lib/saisie";
import { blocageEtape, erreursMesures } from "@/lib/onboarding-flow";
import { ChampNombre } from "@/components/onboarding/ChampNombre";
import { QuiTuEs, MESURES_VIDES, type MesuresDuCorps } from "@/components/onboarding/QuiTuEs";
import { SelecteurFrequence } from "@/components/onboarding/SelecteurFrequence";
import { ChoixDuree } from "@/components/onboarding/ChoixDuree";
import { EchelleDouleur } from "@/components/onboarding/EchelleDouleur";
import { RechercheExercices, type ExerciceChoisi } from "@/components/onboarding/RechercheExercices";

type Etape = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
const DERNIERE: Etape = 7;
const CLE_BROUILLON = "sportperso:onboarding-v2";
const OBJECTIFS_PROPOSES = OBJECTIFS.filter((o) => o !== "reprise");
const TITRES = ["Bienvenue", "Ton profil", "Ton expérience", "Ton objectif", "Tes priorités", "Ton rythme", "Ton lieu", "Tes préférences"] as const;
const OBJECTIF_DETAIL: Record<string, string> = {
  perte_de_poids: "Bouger plus et préserver ta force.", prise_de_muscle: "Construire du muscle progressivement.",
  recomposition: "Gagner du muscle tout en affinant ta silhouette.", gain_de_force: "Devenir plus fort sur les mouvements clés.",
  cardio: "Améliorer ton souffle et ton endurance.", maintien: "Rester solide, mobile et régulier.",
};
const NIVEAU_DETAIL: Record<string, string> = {
  debutant: "Je n’ai jamais suivi de programme de musculation régulier.",
  intermediaire: "Je connais les mouvements et je sais m’entraîner seul.",
  avance: "Je programme mes charges et suis mes performances depuis plusieurs années.",
};
interface Contrainte { muscle: string; severite: number }

export function champMasqueParClavier({
  champHaut, champBas, footerHaut, viewportHaut, viewportHauteur,
}: {
  champHaut: number; champBas: number; footerHaut: number;
  viewportHaut: number; viewportHauteur: number;
}) {
  const marge = 12;
  const basVisible = Math.min(footerHaut, viewportHaut + viewportHauteur) - marge;
  return champHaut < viewportHaut + marge || champBas > basVisible;
}
interface Lieu { id: string; nom: string }
const classeChoix = (actif: boolean) => `group min-h-14 w-full rounded-[20px] border px-4 py-3 text-left transition-all ${actif ? "border-encre bg-encre text-papier shadow-[0_12px_30px_rgba(20,30,25,.16)]" : "border-filet bg-carte text-encre hover:border-encre-3"}`;

export default function PageBienvenue() {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [hydrate, setHydrate] = useState(false);
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [prenom, setPrenom] = useState<string | null>(null);
  const [mesures, setMesures] = useState<MesuresDuCorps>(MESURES_VIDES);
  const [objectifType, setObjectifType] = useState("");
  const [musclesPrioritaires, setMusclesPrioritaires] = useState<string[]>([]);
  const [niveauExperience, setNiveauExperience] = useState("");
  const [anneesDePratique, setAnneesDePratique] = useState("");
  const [moisDInterruption, setMoisDInterruption] = useState("");
  const [listeContraintes, setListeContraintes] = useState<Contrainte[]>([]);
  const [frequence, setFrequence] = useState<Fourchette>({ min: 2, cible: 3, max: 4 });
  const [dureeCible, setDureeCible] = useState(String(BORNES_DUREE.defaut));
  const [dureeMax, setDureeMax] = useState(String(BORNES_DUREE.defautMax));
  const [preferenceMateriel, setPreferenceMateriel] = useState<string>("aucune");
  const [exercicesRefuses, setExercicesRefuses] = useState<ExerciceChoisi[]>([]);
  const [lieuId, setLieuId] = useState("");
  const [nouveauLieuNom, setNouveauLieuNom] = useState("");

  useEffect(() => {
    try {
      const brut = sessionStorage.getItem(CLE_BROUILLON);
      if (brut) {
        const d = JSON.parse(brut);
        if (Number.isInteger(d.etape)) setEtape(Math.min(DERNIERE, Math.max(0, d.etape)) as Etape);
        if (d.mesures) setMesures({ ...MESURES_VIDES, ...d.mesures });
        if (typeof d.objectifType === "string") setObjectifType(d.objectifType);
        if (Array.isArray(d.musclesPrioritaires)) setMusclesPrioritaires(d.musclesPrioritaires);
        if (typeof d.niveauExperience === "string") setNiveauExperience(d.niveauExperience);
        if (typeof d.anneesDePratique === "string") setAnneesDePratique(d.anneesDePratique);
        if (typeof d.moisDInterruption === "string") setMoisDInterruption(d.moisDInterruption);
        if (Array.isArray(d.listeContraintes)) setListeContraintes(d.listeContraintes);
        if (d.frequence) setFrequence(d.frequence);
        if (typeof d.dureeCible === "string") setDureeCible(d.dureeCible);
        if (typeof d.dureeMax === "string") setDureeMax(d.dureeMax);
        if (typeof d.preferenceMateriel === "string") setPreferenceMateriel(d.preferenceMateriel);
        if (Array.isArray(d.exercicesRefuses)) setExercicesRefuses(d.exercicesRefuses);
        if (typeof d.lieuId === "string") setLieuId(d.lieuId);
        if (typeof d.nouveauLieuNom === "string") setNouveauLieuNom(d.nouveauLieuNom);
      }
    } catch { sessionStorage.removeItem(CLE_BROUILLON); }
    setHydrate(true);
  }, []);

  useEffect(() => {
    fetch("/api/onboarding").then((r) => r.json()).then((d) => {
      if (d?.termine) { router.replace("/dashboard"); return; }
      if (Array.isArray(d?.salles)) {
        setLieux(d.salles);
        if (d.salles.length > 0) setLieuId((actuel) => actuel || d.salles[0].id);
      }
      setPrenom(d?.prenom ?? null);
    }).catch(() => {});
  }, [router]);

  useEffect(() => {
    if (!hydrate) return;
    sessionStorage.setItem(CLE_BROUILLON, JSON.stringify({ etape, mesures, objectifType, musclesPrioritaires, niveauExperience, anneesDePratique, moisDInterruption, listeContraintes, frequence, dureeCible, dureeMax, preferenceMateriel, exercicesRefuses, lieuId, nouveauLieuNom }));
  }, [hydrate, etape, mesures, objectifType, musclesPrioritaires, niveauExperience, anneesDePratique, moisDInterruption, listeContraintes, frequence, dureeCible, dureeMax, preferenceMateriel, exercicesRefuses, lieuId, nouveauLieuNom]);

  const etatMinimal = useMemo(() => ({ mesures, objectifType, niveauExperience, anneesDePratique, moisDInterruption, dureeCible, dureeMax, lieuId, nouveauLieuNom }), [mesures, objectifType, niveauExperience, anneesDePratique, moisDInterruption, dureeCible, dureeMax, lieuId, nouveauLieuNom]);
  const raisonBlocage = blocageEtape(etape, etatMinimal);
  const erreursCorps = etape === 1 ? erreursMesures(etatMinimal) : {};
  const reprise = moisDInterruption !== "" && estUneReprise(nombre(moisDInterruption, 0));
  const basculerMuscle = (muscle: string) => setMusclesPrioritaires((liste) => liste.includes(muscle) ? liste.filter((m) => m !== muscle) : liste.length < 4 ? [...liste, muscle] : liste);
  const basculerContrainte = (muscle: string) => setListeContraintes((liste) => liste.some((c) => c.muscle === muscle) ? liste.filter((c) => c.muscle !== muscle) : [...liste, { muscle, severite: 4 }]);

  const terminer = async () => {
    if (envoi || raisonBlocage) return;
    setEnvoi(true); setErreur(null);
    try {
      const reponse = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        objectifType, musclesPrioritaires, dateNaissance: mesures.dateNaissance, sexe: mesures.sexe,
        taille: nombre(mesures.taille, 0), poids: nombre(mesures.poids, 0), poidsDate: mesures.poidsDate,
        niveauExperience, anneesDePratique: nombre(anneesDePratique, 0), moisDInterruption: nombre(moisDInterruption, 0),
        contraintes: listeContraintes, frequenceCibleParSemaine: frequence.cible, frequenceMinParSemaine: frequence.min,
        frequenceMaxParSemaine: frequence.max, dureeSeanceCibleMinutes: nombre(dureeCible, BORNES_DUREE.defaut),
        dureeSeanceMaxMinutes: nombre(dureeMax, BORNES_DUREE.defautMax), preferenceMateriel,
        exercicesRefuses: exercicesRefuses.map((e) => e.id), salleId: lieuId || undefined,
        nouvelleSalleNom: lieuId ? undefined : nouveauLieuNom.trim() || undefined,
      }) });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) throw new Error(messageErreur("enregistrer ton profil", corps?.error, reponse.status));
      sessionStorage.removeItem(CLE_BROUILLON); router.replace("/dashboard"); router.refresh();
    } catch (cause) { setErreur(cause instanceof Error ? cause.message : messageErreur("enregistrer ton profil")); setEnvoi(false); }
  };
  const avancer = () => { if (raisonBlocage) return; setErreur(null); if (etape === DERNIERE) void terminer(); else setEtape((etape + 1) as Etape); };
  const garderChampVisible = (event: FocusEvent<HTMLElement>) => {
    const champ = event.target;
    if (!(champ instanceof HTMLInputElement || champ instanceof HTMLTextAreaElement || champ instanceof HTMLSelectElement)) return;
    window.setTimeout(() => {
      const rectangle = champ.getBoundingClientRect();
      const viewport = window.visualViewport;
      if (champMasqueParClavier({
        champHaut: rectangle.top,
        champBas: rectangle.bottom,
        footerHaut: footerRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
        viewportHaut: viewport?.offsetTop ?? 0,
        viewportHauteur: viewport?.height ?? window.innerHeight,
      })) champ.scrollIntoView({ block: "center", inline: "nearest" });
    }, 180);
  };

  return <div className="relative h-dvh overflow-hidden bg-papier text-encre">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_78%_12%,rgba(197,69,38,.14),transparent_42%),radial-gradient(circle_at_12%_0%,rgba(190,229,115,.22),transparent_38%)]" />
    <div className="relative mx-auto flex h-full max-w-[520px] flex-col">
      <header className="z-20 px-5 pb-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}>
        <div className="flex min-h-12 items-center gap-3">
          {etape > 0 ? <button type="button" onClick={() => setEtape((etape - 1) as Etape)} className="grid size-11 place-items-center rounded-full border border-filet bg-carte/90 shadow-sm" aria-label="Étape précédente"><ChevronLeft className="size-5" /></button> : <div className="grid size-11 place-items-center rounded-2xl bg-encre text-papier"><Sparkles className="size-5" /></div>}
          <div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.16em] text-encre-3"><span>{TITRES[etape]}</span><span>{etape + 1}/{DERNIERE + 1}</span></div><div className="flex gap-1" role="progressbar" aria-label={`Étape ${etape + 1} sur ${DERNIERE + 1}`} aria-valuenow={etape + 1} aria-valuemin={1} aria-valuemax={DERNIERE + 1}>{Array.from({ length: DERNIERE + 1 }, (_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= etape ? "bg-encre" : "bg-filet"}`} />)}</div></div>
        </div>
      </header>
      <main data-testid="onboarding-scroll" onFocusCapture={garderChampVisible} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 7.5rem)", scrollPaddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 7.5rem)" }}>
        {etape === 0 && <section className="pt-[clamp(2rem,9vh,5rem)]"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-filet bg-carte/80 px-3 py-2 text-xs font-semibold uppercase tracking-[.14em] text-encre-2"><ShieldCheck className="size-4" /> 2–3 minutes</div><h1 className="max-w-[430px] text-[clamp(2.7rem,13vw,4.6rem)] font-semibold leading-[.92] tracking-[-.065em]">{prenom ? `${prenom}, partons du bon pied.` : "Partons du bon pied."}</h1><p className="mt-7 max-w-sm text-lg leading-7 text-encre-2">Ton programme commencera à ton niveau réel, dans le lieu où tu t’entraînes.</p><div className="mt-10 rounded-[28px] bg-encre p-5 text-papier shadow-[0_24px_60px_rgba(20,30,25,.2)]"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-[#c7ea78] text-encre"><Dumbbell className="size-5" /></div><strong>Pas de test maximal</strong></div><p className="mt-4 text-sm leading-6 text-papier/70">Tu n’as besoin d’aucune ancienne charge. Les premières séries construiront tes repères.</p></div></section>}
        {etape === 1 && <EtapeSection titre="Ton profil" sousTitre="Ces informations décrivent ton profil et donnent du contexte au Coach. Elles aideront à personnaliser progressivement tes futurs repères, sans déterminer ta première charge aujourd’hui."><QuiTuEs valeurs={mesures} onChange={setMesures} requis erreurs={erreursCorps} /></EtapeSection>}
        {etape === 2 && <EtapeSection titre="Où en es-tu aujourd’hui ?" sousTitre="Choisis selon ton autonomie technique, sans penser aux kilos."><div className="grid gap-3">{NIVEAUX.map((niveau) => <button key={niveau} type="button" onClick={() => setNiveauExperience(niveau)} aria-pressed={niveauExperience === niveau} className={classeChoix(niveauExperience === niveau)}><span className="flex items-start justify-between gap-4"><span><strong className="block text-base">{niveau === "debutant" ? "Je débute" : niveau === "intermediaire" ? "Je suis autonome" : "Je suis expérimenté"}</strong><span className={`mt-1 block text-sm leading-5 ${niveauExperience === niveau ? "text-papier/70" : "text-encre-2"}`}>{NIVEAU_DETAIL[niveau]}</span></span>{niveauExperience === niveau && <Check className="mt-1 size-5 shrink-0" />}</span></button>)}</div><div className="grid grid-cols-2 gap-3"><ChampNombre id="annees" label="Pratique cumulée" valeur={anneesDePratique} onChange={setAnneesDePratique} placeholder="0" unite="ans" /><ChampNombre id="interruption" label="Interruption actuelle" valeur={moisDInterruption} onChange={setMoisDInterruption} placeholder="0" unite="mois" /></div>{reprise && <div className="rounded-[20px] border border-filet bg-carte p-4 text-sm leading-6 text-encre-2">Après {MOIS_AVANT_REPRISE} mois ou plus, l’app lance une reprise progressive pour retrouver tes repères.</div>}</EtapeSection>}
        {etape === 3 && <EtapeSection titre="Qu’est-ce qui compte le plus ?" sousTitre="Un objectif principal suffit. Tu pourras le changer plus tard."><div className="grid gap-3">{OBJECTIFS_PROPOSES.map((objectif) => <button key={objectif} type="button" onClick={() => setObjectifType(objectif)} aria-pressed={objectifType === objectif} className={classeChoix(objectifType === objectif)}><span className="flex items-center justify-between gap-4"><span><strong className="block text-base">{LIBELLES_OBJECTIF[objectif]}</strong><span className={`mt-0.5 block text-sm ${objectifType === objectif ? "text-papier/70" : "text-encre-2"}`}>{OBJECTIF_DETAIL[objectif]}</span></span>{objectifType === objectif && <Check className="size-5 shrink-0" />}</span></button>)}</div></EtapeSection>}
        {etape === 4 && <EtapeSection titre="Tout le corps, par défaut" sousTitre="Le programme reste équilibré. Ajoute seulement les zones que tu veux favoriser."><button type="button" onClick={() => setMusclesPrioritaires([])} aria-pressed={musclesPrioritaires.length === 0} className={classeChoix(musclesPrioritaires.length === 0)}><span className="flex items-center justify-between"><span><strong className="block">Tout le corps</strong><span className={`text-sm ${musclesPrioritaires.length === 0 ? "text-papier/70" : "text-encre-2"}`}>Équilibre complet</span></span>{musclesPrioritaires.length === 0 && <Check className="size-5" />}</span></button><details className="rounded-[22px] border border-filet bg-carte p-4"><summary className="cursor-pointer font-medium">Choisir jusqu’à 4 priorités <span className="text-encre-3">({musclesPrioritaires.length}/4)</span></summary><div className="mt-4 flex flex-wrap gap-2">{MUSCLES.map((muscle) => { const actif = musclesPrioritaires.includes(muscle); return <button key={muscle} type="button" onClick={() => basculerMuscle(muscle)} disabled={!actif && musclesPrioritaires.length >= 4} aria-pressed={actif} className={`min-h-11 rounded-full border px-3.5 text-sm ${actif ? "border-encre bg-encre text-papier" : "border-filet bg-papier text-encre disabled:opacity-35"}`}>{libelleMuscle(muscle)}</button>; })}</div></details><details className="rounded-[22px] border border-filet bg-carte p-4"><summary className="cursor-pointer font-medium">Signaler une gêne actuelle <span className="text-encre-3">· facultatif</span></summary><div className="mt-4 flex flex-wrap gap-2">{MUSCLES.map((muscle) => { const actif = listeContraintes.some((c) => c.muscle === muscle); return <button key={muscle} type="button" onClick={() => basculerContrainte(muscle)} aria-pressed={actif} className={`min-h-11 rounded-full border px-3.5 text-sm ${actif ? "border-perte bg-perte-fond text-encre" : "border-filet bg-papier"}`}>{libelleMuscle(muscle)}</button>; })}</div>{listeContraintes.map((c) => <div key={c.muscle} className="mt-4 rounded-2xl bg-papier p-3"><div className="mb-2 flex justify-between text-sm"><span>{libelleMuscle(c.muscle)}</span><b>{c.severite}/10</b></div><EchelleDouleur valeur={c.severite} onChange={(v) => setListeContraintes((liste) => liste.map((x) => x.muscle === c.muscle ? { ...x, severite: v } : x))} labelZone={libelleMuscle(c.muscle)} /></div>)}</details></EtapeSection>}
        {etape === 5 && <EtapeSection titre="Un rythme qui tient" sousTitre="Donne une semaine réaliste, pas une semaine parfaite."><SelecteurFrequence valeur={frequence} onChange={setFrequence} /><ChoixDuree label="Durée idéale" valeur={dureeCible} onChange={setDureeCible} /><ChoixDuree label="Durée maximale" valeur={dureeMax} onChange={setDureeMax} /></EtapeSection>}
        {etape === 6 && <EtapeSection titre="Où vas-tu t’entraîner ?" sousTitre="Choisis un lieu existant ou crée le tien. Le matériel se complète ensuite."><div className="grid gap-3">{lieux.map((lieu) => <button key={lieu.id} type="button" onClick={() => setLieuId(lieu.id)} aria-pressed={lieuId === lieu.id} className={classeChoix(lieuId === lieu.id)}><span className="flex items-center gap-3"><MapPin className="size-5" /><span className="flex-1 font-medium">{lieu.nom}</span>{lieuId === lieu.id && <Check className="size-5" />}</span></button>)}</div><div className="flex items-center gap-3 py-1 text-xs font-semibold uppercase tracking-[.16em] text-encre-3"><span className="h-px flex-1 bg-filet" />ou<span className="h-px flex-1 bg-filet" /></div><button type="button" onClick={() => setLieuId("")} aria-pressed={!lieuId} className={classeChoix(!lieuId)}><span className="flex items-center gap-3"><Plus className="size-5" /><span className="font-medium">Créer un lieu</span></span></button>{!lieuId && <div className="space-y-2"><label htmlFor="nouveauLieu" className="text-sm text-encre-2">Nom du lieu</label><div className="relative"><Home className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-encre-3" /><Input id="nouveauLieu" value={nouveauLieuNom} onChange={(e) => setNouveauLieuNom(e.target.value)} placeholder="Maison, Fitness Park…" className="h-14 rounded-2xl border-filet bg-carte pl-12 text-base" /></div></div>}</EtapeSection>}
        {etape === 7 && <EtapeSection titre="Derniers réglages" sousTitre="Ces préférences orientent les choix sans enfermer ton programme."><div><p className="mb-3 text-sm font-medium">Matériel préféré</p><div className="grid grid-cols-2 gap-3">{PREFERENCES_MATERIEL.map((pref) => <button key={pref} type="button" onClick={() => setPreferenceMateriel(pref)} aria-pressed={preferenceMateriel === pref} className={`${classeChoix(preferenceMateriel === pref)} text-sm`}>{LIBELLES_MATERIEL[pref]}</button>)}</div></div><details className="rounded-[22px] border border-filet bg-carte p-4"><summary className="cursor-pointer font-medium">Exercices à éviter <span className="text-encre-3">· facultatif</span></summary><div className="mt-4"><RechercheExercices choisis={exercicesRefuses} onChange={setExercicesRefuses} /></div></details><div className="rounded-[24px] bg-encre p-5 text-papier"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#c7ea78]">Prêt à construire</p><strong className="mt-2 block text-xl">{reprise ? "Reprise & premiers repères" : "Premiers repères"}</strong><p className="mt-2 text-sm leading-6 text-papier/70">{frequence.cible} séances par semaine · {dureeCible} min · {musclesPrioritaires.length === 0 ? "tout le corps" : `${musclesPrioritaires.length} priorité${musclesPrioritaires.length > 1 ? "s" : ""}`}</p></div></EtapeSection>}
      </main>
      {/* Fixed reprend le garde éprouvé sur Safari iOS. Le contenu garde son
          propre scroll et réserve la hauteur du CTA, clavier ouvert compris. */}
      <footer ref={footerRef} data-testid="onboarding-footer" className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[520px] border-t border-filet bg-papier/90 px-5 pt-3 backdrop-blur-xl" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + .85rem)" }}>{(raisonBlocage || erreur) && <p className="mb-2 text-center text-xs font-medium text-perte" role="alert">{erreur ?? raisonBlocage}</p>}<button type="button" onClick={avancer} disabled={Boolean(raisonBlocage) || envoi} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-encre px-5 font-semibold text-papier shadow-[0_10px_25px_rgba(20,30,25,.16)] transition-transform active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-35">{envoi ? "Création en cours…" : etape === DERNIERE ? "Créer mon programme" : etape === 0 ? "Commencer" : "Continuer"}<ArrowRight className="size-5" /></button></footer>
    </div>
  </div>;
}

function EtapeSection({ titre, sousTitre, children }: { titre: string; sousTitre: string; children: React.ReactNode }) {
  return <section className="space-y-6 pb-4 pt-5"><div><h1 className="text-[2rem] font-semibold leading-[1.02] tracking-[-.045em]">{titre}</h1><p className="mt-2 max-w-md text-[15px] leading-6 text-encre-2">{sousTitre}</p></div>{children}</section>;
}
