import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { gyms } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { GymCard } from "@/components/gyms/GymCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

export default async function GymsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const allGyms = await db.query.gyms.findMany({
    where: and(eq(gyms.userId, user.id), isNull(gyms.archiveLe)),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-encre">Mes salles</h1>
        <Link href="/gyms/new">
          <Button size="icon" variant="default" className="bg-papier-2 hover:bg-papier-2">
            <Plus className="w-5 h-5" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {allGyms.map((gym) => (
          <Link key={gym.id} href={`/gyms/${gym.id}`}>
            <GymCard gym={gym} />
          </Link>
        ))}
      </div>

      {allGyms.length === 0 && (
        <p className="text-encre-3 text-center py-8">Aucune salle. Créez votre première salle.</p>
      )}

      <Link href="/gyms/new">
        <Button className="fixed bottom-24 right-4 bg-papier-2 hover:bg-papier-2" size="lg">
          <Plus className="w-5 h-5 mr-2" />
          Nouvelle salle
        </Button>
      </Link>
    </div>
  );
}
