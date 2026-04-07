import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { gyms } from "@/db/schema";
import { MOCK_USER_ID } from "@/lib/constants";
import { eq, and } from "drizzle-orm";
import { GymForm } from "@/components/gyms/GymForm";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default async function GymDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gym = await db.query.gyms.findFirst({
    where: and(eq(gyms.id, id), eq(gyms.userId, MOCK_USER_ID)),
  });

  if (!gym) notFound();

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-white">{gym.nom}</h1>
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
          <Button variant="destructive" className="w-full mt-8">Supprimer</Button>
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
