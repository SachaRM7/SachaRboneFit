import { GymCard } from "@/components/gyms/GymCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { db } from "@/db/client";
import { gyms } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq } from "drizzle-orm";

export default async function GymsPage() {
  const allGyms = await db.query.gyms.findMany({
    where: eq(gyms.userId, MOCK_USER_ID),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Mes salles</h1>
        <Link href="/gyms/new">
          <Button size="icon" variant="default" className="bg-zinc-800 hover:bg-zinc-700">
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
        <p className="text-zinc-500 text-center py-8">Aucune salle. Créez votre première salle.</p>
      )}

      <Link href="/gyms/new">
        <Button className="fixed bottom-24 right-4 bg-zinc-800 hover:bg-zinc-700" size="lg">
          <Plus className="w-5 h-5 mr-2" />
          Nouvelle salle
        </Button>
      </Link>
    </div>
  );
}
