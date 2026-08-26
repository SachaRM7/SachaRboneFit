"use client";
import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, Check } from "lucide-react";
import { findSubstitutes, type SubstituteResult } from "@/lib/engine/substitutions";

interface SubstitutionModalProps {
  exerciseInstanceId: string;
  exerciseName: string;
  pilier: string;
  profilTension: string;
  gymId: string;
  musclesCibles?: string[];
  musclesAvecCourbatures?: string[];
  onSelect?: (substitute: SubstituteResult) => void;
}

export function SubstitutionModal({
  exerciseInstanceId,
  exerciseName,
  pilier,
  profilTension,
  gymId,
  musclesCibles,
  musclesAvecCourbatures,
  onSelect,
}: SubstitutionModalProps) {
  const [open, setOpen] = useState(false);
  // Le resultat porte la cle qui l'a produit : `loading` en derive, ce qui evite
  // un setState synchrone en tete d'effet.
  const [result, setResult] = useState<{ cle: string; items: SubstituteResult[] } | null>(null);

  const cle = `${exerciseInstanceId}:${pilier}:${profilTension}:${gymId}`;
  const loading = open && result?.cle !== cle;
  const substitutes = result?.cle === cle ? result.items : [];

  useEffect(() => {
    if (!open) return;
    let annule = false;
    const cleCourante = `${exerciseInstanceId}:${pilier}:${profilTension}:${gymId}`;
    fetch("/api/exercise-instances")
      .then((r) => r.json())
      .then((data) => {
        if (annule) return;
        const allInstances = Array.isArray(data) ? data : data.instances || [];
        setResult({
          cle: cleCourante,
          items: findSubstitutes(allInstances, {
            pilier,
            profilTension,
            gymId,
            excludeExerciseIds: [exerciseInstanceId],
            musclesAvecCourbatures,
          }),
        });
      })
      .catch(() => {
        if (!annule) setResult({ cle: cleCourante, items: [] });
      });
    return () => { annule = true; };
  }, [open, exerciseInstanceId, pilier, profilTension, gymId, musclesAvecCourbatures]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger>
        <span className="inline-flex items-center justify-center px-3 py-1.5 text-sm border border-filet rounded-md bg-papier-2 text-encre-2 cursor-pointer hover:bg-papier-2 hover:text-encre">
          <ArrowLeftRight className="w-4 h-4 mr-1" />
          Remplacer
        </span>
      </DrawerTrigger>
      <DrawerContent className="bg-papier border-filet text-encre max-h-[80vh]">
        <DrawerHeader>
          <DrawerTitle className="text-encre">
            Substituer {exerciseName}
          </DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 space-y-2 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-encre-2 py-8 text-center">Chargement...</div>
          ) : substitutes.length === 0 ? (
            <div className="text-encre-3 py-8 text-center">
              Aucun substitut trouve
            </div>
          ) : (
            substitutes.map((sub) => (
              <button
                key={sub.exerciseInstanceId}
                onClick={() => {
                  onSelect?.(sub);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between p-3 bg-carte border border-filet rounded-lg hover:border-filet transition-colors"
              >
                <div className="text-left">
                  <p className="text-encre font-medium">{sub.exerciseName}</p>
                  {sub.machineName && (
                    <p className="text-encre-3 text-sm">{sub.machineName}</p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={
                    sub.categorieRole === "pilier"
                      ? "border-gain text-gain"
                      : sub.categorieRole === "substitut"
                      ? "border-encre text-encre"
                      : "border-filet text-encre-2"
                  }
                >
                  {sub.categorieRole}
                </Badge>
              </button>
            ))
          )}
        </div>
        <DrawerClose>
          <span className="inline-flex items-center justify-center w-full mx-4 mb-4 px-3 py-2 text-sm border border-filet rounded-md bg-papier-2 text-encre-2 cursor-pointer hover:bg-papier-2 hover:text-encre">
            Fermer
          </span>
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
