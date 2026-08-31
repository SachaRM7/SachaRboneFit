"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download, LogOut, User, History, CalendarRange, Palette, BookOpen, MapPin, Scale, HeartPulse,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/stores/sessionStore";
import { ChoixTheme } from "@/components/layout/ChoixTheme";
import { RejouerOnboarding } from "@/components/settings/RejouerOnboarding";
import { GroupeReglages, LigneAction, type Entree } from "@/components/settings/ListeReglages";
import { DeclarerContexte } from "@/components/coach/ContexteCoach";

/**
 * Plus.
 *
 * L'écran empilait six cartes complètes — en-tête, icône, description, bouton
 * pleine largeur — pour six liens de navigation. Trois écrans de défilement
 * avant d'atteindre la déconnexion.
 *
 * Il est maintenant fait de listes, regroupées par ce qu'on vient y chercher :
 * ce qui touche à l'entraînement, ce qui te concerne, l'application, puis le
 * compte. Aucune capacité n'a été retirée — et une a été rendue atteignable :
 * le suivi du poids de corps existait sans qu'aucun lien n'y mène.
 *
 * Le geste destructeur reste en dernier et garde sa carte : c'est le seul
 * endroit où la lourdeur est utile.
 */

const ENTRAINEMENT: Entree[] = [
  { href: "/programme", libelle: "Programme", description: "Ton cycle et ta semaine", icone: CalendarRange },
  { href: "/historique", libelle: "Historique", description: "Toutes tes séances passées", icone: History },
  { href: "/exercises", libelle: "Bibliothèque", description: "Tous les exercices", icone: BookOpen },
  { href: "/gyms", libelle: "Salles", description: "Lieux et matériel disponible", icone: MapPin },
];

const TOI: Entree[] = [
  { href: "/profil", libelle: "Mon profil", description: "Objectif, fréquence, durée de séance", icone: User },
  // L'écran existait et fonctionnait, sans qu'aucun lien de l'application n'y
  // mène : il n'était atteignable qu'en tapant l'adresse à la main.
  { href: "/bodyweight", libelle: "Poids de corps", description: "Suivi et tendance", icone: Scale },
  { href: "/contraintes", libelle: "Ce que tu ménages", description: "Gênes en cours et passées", icone: HeartPulse },
];

export default function SettingsPage() {
  const router = useRouter();
  const viderSeance = useSessionStore((state) => state.clear);
  const [export_, setExport] = useState(false);

  // Trois comptes portent le même prénom : sans l'adresse affichée, un compte
  // vide est indiscernable d'une application qui aurait perdu les données.
  const [emailConnecte, setEmailConnecte] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmailConnecte(data.user?.email ?? null))
      .catch(() => setEmailConnecte(null));
  }, []);

  const exporter = async () => {
    setExport(true);
    try {
      const res = await fetch("/api/export?format=json");
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sport-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export JSON téléchargé");
    } catch {
      toast.error("Erreur lors de l'export");
    } finally {
      setExport(false);
    }
  };

  const deconnecter = async () => {
    await createClient().auth.signOut();
    viderSeance();
    toast.success("Déconnecté");
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-dvh bg-papier text-encre p-4 pb-24 space-y-6">
      {/* Aucun contexte sportif : on ne fabrique pas de situation ici. */}
      <DeclarerContexte ecran="plus" />

      <h1 className="text-2xl font-bold">Plus</h1>

      <GroupeReglages titre="Entraînement" entrees={ENTRAINEMENT} />
      <GroupeReglages titre="Toi" entrees={TOI} />

      <section className="space-y-2">
        <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">Application</h2>
        <div className="rounded-xl border border-filet bg-carte divide-y divide-filet">
          <div className="px-4 py-3.5 flex items-center gap-3">
            <Palette className="w-4 h-4 text-encre-2 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-encre text-sm font-medium">Apparence</span>
              <span className="block mt-2">
                <ChoixTheme />
              </span>
            </span>
          </div>
          <LigneAction
            libelle="Exporter mes données"
            description="Séances, exercices, poids, états du jour — en JSON"
            icone={Download}
            onClick={() => void exporter()}
            disabled={export_}
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-encre-2 text-xs font-semibold uppercase tracking-wide">Compte</h2>
        <div className="rounded-xl border border-filet bg-carte divide-y divide-filet">
          <div className="px-4 py-3.5">
            <p className="text-encre-3 text-xs">Connecté en tant que</p>
            <p className="text-encre text-sm font-medium mt-0.5 break-all">
              {emailConnecte ?? "…"}
            </p>
          </div>
          <LigneAction libelle="Se déconnecter" icone={LogOut} onClick={() => void deconnecter()} />
        </div>
      </section>

      {/* En dernier, et non dans une liste d'actions anodines : ce geste
          efface un historique sans corbeille. */}
      <RejouerOnboarding />
    </div>
  );
}
