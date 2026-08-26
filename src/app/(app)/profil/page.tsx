import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { getAuthenticatedUserId } from "@/lib/supabase/auth-helper";
import { ProfilForm } from "@/components/profil/ProfilForm";

export default async function ProfilPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) redirect("/login");

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
  });

  if (!user) redirect("/login");

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-encre">Profil</h1>
        <p className="text-encre-3 text-sm mt-1">
          Ces informations orientent les séances proposées.
        </p>
      </div>
      <ProfilForm
        initial={{
          nom: user.nom,
          dateNaissance: user.dateNaissance,
          taille: user.taille,
          phaseNutritionnelle: user.phaseNutritionnelle,
          objectifType: user.objectifType,
          objectifMusclesPrioritaires: user.objectifMusclesPrioritaires ?? [],
          objectifChiffre: user.objectifChiffre,
          dateCible: user.dateCible,
          frequenceCibleParSemaine: user.frequenceCibleParSemaine,
          dureeSeanceCibleMinutes: user.dureeSeanceCibleMinutes,
        }}
      />
    </div>
  );
}
