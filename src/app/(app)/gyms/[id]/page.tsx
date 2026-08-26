import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db/client";
import { gyms } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { GymForm } from "@/components/gyms/GymForm";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function GymDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const gym = await db.query.gyms.findFirst({
    where: and(eq(gyms.id, id), eq(gyms.userId, user.id)),
  });

  if (!gym) notFound();

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-white">{gym.nom}</h1>

      <Link href={`/gyms/${id}/materiel`} className="block">
        <Button variant="outline" className="w-full bg-zinc-900 border-zinc-700">
          Voir le matériel de cette salle
        </Button>
      </Link>
      <GymForm
        gymId={id}
        defaultValues={{
          nom: gym.nom,
          horairesOuverture: gym.horairesOuverture || undefined,
          est24h: gym.est24h || false,
          notes: gym.notes || undefined,
        }}
        onSuccess={() => {}}
      />

      <Dialog>
        <DialogTrigger>
          <span className="inline-flex items-center justify-center w-full px-4 py-2 mt-8 text-sm font-medium text-white bg-red-600 rounded-md cursor-pointer hover:bg-red-700">
            Supprimer
          </span>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer cette salle ?</DialogTitle>
            <DialogDescription>
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <form action={`/api/gyms/${id}`} method="DELETE">
              <Button type="submit" variant="destructive">Supprimer</Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
