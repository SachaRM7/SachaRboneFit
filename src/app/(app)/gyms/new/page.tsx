"use client";
import { GymForm } from "@/components/gyms/GymForm";
import { EnTeteSecondaire } from "@/components/layout/EnTeteSecondaire";

export default function NewGymPage() {
  return (
    <div className="p-4 space-y-4">
      <EnTeteSecondaire titre="Nouvelle salle" vers="/gyms" libelleRetour="Retour aux salles" />
      <GymForm
        defaultValues={{ est24h: false }}
      />
    </div>
  );
}
