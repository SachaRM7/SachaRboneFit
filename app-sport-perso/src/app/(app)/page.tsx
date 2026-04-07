import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MOCK_USER_ID, MOCK_USER_EMAIL } from "@/lib/constants";

// Server component - will use real DB queries once Supabase is configured
export default function DashboardPage() {
  // Placeholder data for now - will be connected to DB in later steps
  const userName = "Sacha";
  const activeBloc = "Bloc 1 Cycle 1 Mécanique";
  const lastSession = "06/04/2026";
  const lastWeight = "90,55 kg";

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Bienvenue, {userName}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-zinc-400 text-sm">Membre depuis 2026</p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Bloc actif</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            {activeBloc}
          </Badge>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Dernière séance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-white text-lg font-medium">{lastSession}</p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Poids actuel</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-white text-lg font-medium">{lastWeight}</p>
        </CardContent>
      </Card>
    </div>
  );
}
