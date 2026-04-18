"use client";
import { GymForm } from "@/components/gyms/GymForm";

export default function NewGymPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-white mb-4">Nouvelle salle</h1>
      <GymForm
        onSuccess={() => {}}
        defaultValues={{ est24h: false }}
      />
    </div>
  );
}
