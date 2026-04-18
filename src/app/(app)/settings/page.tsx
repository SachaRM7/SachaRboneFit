"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useSessionStore } from "@/stores/sessionStore";

export default function SettingsPage() {
  const router = useRouter();
  const clearSession = useSessionStore((state) => state.clear);
  const [exporting, setExporting] = useState(false);

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
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6">Paramètres</h1>

        {/* Data Export */}
        <Card className="bg-zinc-900 border-zinc-800 mb-4">
          <CardHeader>
            <CardTitle className="text-zinc-300 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Mes données
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-zinc-500 text-sm">
              Exporte toutes tes données : séances, exercices, poids, état du jour.
            </p>
            <Button
              variant="outline"
              className="w-full bg-zinc-800 border-zinc-700"
              onClick={handleExportJSON}
              disabled={exporting}
            >
              Exporter en JSON
            </Button>
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-300 flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Compte
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-zinc-500 text-sm">
              Déconnecte-toi pour changer de compte.
            </p>
            <Button
              variant="outline"
              className="w-full bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
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
