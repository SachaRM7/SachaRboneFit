"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Download, LogOut, User, History, CalendarRange, Palette } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";
import { ChoixTheme } from "@/components/layout/ChoixTheme";

export default function SettingsPage() {
  const router = useRouter();
  const clearSession = useSessionStore((state) => state.clear);
  const [exporting, setExporting] = useState(false);

  // Trois comptes portent le même prénom : sans l'adresse affichée, un compte
  // vide est indiscernable d'une application qui aurait perdu les données.
  const [emailConnecte, setEmailConnecte] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmailConnecte(data.user?.email ?? null))
      .catch(() => setEmailConnecte(null));
  }, []);

  const handleExportJSON = async () => {
    setExporting(true);
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
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearSession();
    toast.success("Déconnecté");
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-papier text-encre pb-20">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6">Paramètres</h1>

        {/* Profil */}
        <Card className="bg-carte border-filet mb-4">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              Profil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-encre-3 text-sm">
              Taille, objectif, muscles prioritaires, fréquence et durée de séance.
            </p>
            <Link href="/profil" className="block">
              <Button variant="outline" className="w-full bg-papier-2 border-filet">
                Modifier mon profil
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Historique */}
        <Card className="bg-carte border-filet mb-4">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <History className="w-4 h-4" />
              Historique
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-encre-3 text-sm">
              Toutes tes séances passées, par mois, avec volume et durée.
            </p>
            <Link href="/historique" className="block">
              <Button variant="outline" className="w-full bg-papier-2 border-filet">
                Parcourir l&apos;historique
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Programme */}
        <Card className="bg-carte border-filet mb-4">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <CalendarRange className="w-4 h-4" />
              Programme
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-encre-3 text-sm">
              Bloc actif, séances et exercices programmés.
            </p>
            <Link href="/programme" className="block">
              <Button variant="outline" className="w-full bg-papier-2 border-filet">
                Gérer mon programme
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Data Export */}
        <Card className="bg-carte border-filet mb-4">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Mes données
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-encre-3 text-sm">
              Exporte toutes tes données : séances, exercices, poids, état du jour.
            </p>
            <Button
              variant="outline"
              className="w-full bg-papier-2 border-filet"
              onClick={handleExportJSON}
              disabled={exporting}
            >
              Exporter en JSON
            </Button>
          </CardContent>
        </Card>

        {/* Apparence */}
        <Card className="bg-carte border-filet mb-4">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Apparence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChoixTheme />
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="bg-carte border-filet">
          <CardHeader>
            <CardTitle className="text-encre-2 flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Compte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-encre-3 text-xs uppercase tracking-wide">Connecté en tant que</p>
              <p className="text-encre font-medium text-sm mt-0.5 break-all">
                {emailConnecte ?? "…"}
              </p>
            </div>
            <p className="text-encre-3 text-sm">
              Déconnecte-toi pour changer de compte.
            </p>
            <Button
              variant="outline"
              className="w-full bg-papier-2 border-filet hover:bg-papier-2"
              onClick={handleLogout}
            >
              Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
