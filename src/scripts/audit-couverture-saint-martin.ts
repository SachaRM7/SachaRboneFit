import { besoinDe } from "@/lib/referentiels/capacites";
import { CATALOGUE } from "@/lib/referentiels/catalogue";
import { INVENTAIRE, type EntreeInventaire } from "./importer-saint-martin";

interface ExceptionCouverture { faisable: boolean; raison: string }

const FAISABLES_SANS_INSTANCE: Record<string, ExceptionCouverture> = {
  "push-up": { faisable: true, raison: "Poids du corps au sol : le moteur le conserve même en inventaire complet." },
  "dead-bug": { faisable: true, raison: "Poids du corps au sol : aucune instance ni installation n'est nécessaire." },
};

const NON_FAISABLES: Record<string, ExceptionCouverture> = {
  "chest-dip": { faisable: false, raison: "Usage assisté ou non assisté sur la Dip/Chin Assist non documenté; nature de charge indéterminée." },
  "decline-bench-press": { faisable: false, raison: "Aucun banc/poste décliné validé." },
  "weighted-dip": { faisable: false, raison: "Station dip présente, mais ceinture ou dispositif de lest non confirmé." },
  "neutral-grip-pull-up": { faisable: false, raison: "Prise neutre de traction sur la Dip/Chin Assist non confirmée." },
  "t-bar-row": { faisable: false, raison: "Aucune station T-bar ni accessoire landmine confirmé." },
  "weighted-pull-up": { faisable: false, raison: "Traction possible, mais ceinture ou dispositif de lest non confirmé." },
  "belt-squat": { faisable: false, raison: "Aucun belt squat; Perfect Squat ne lui est pas assimilé." },
  "step-up": { faisable: false, raison: "Aucune box/hauteur d'appui sûre validée; un banc n'est pas supposé convenir." },
  "back-extension": { faisable: false, raison: "La machine à pile observée n'est pas le mouvement bodyweight du catalogue." },
  "glute-focused-back-extension": { faisable: false, raison: "Aucun banc à lombaires bodyweight validé." },
  "hip-thrust": { faisable: false, raison: "Barre et banc présents, mais installation/calage du banc non validés." },
  "kettlebell-swing": { faisable: false, raison: "Aucune kettlebell confirmée dans le relevé terrain." },
  "smith-machine-hip-thrust": { faisable: false, raison: "Smith et banc présents, mais installation/calage du banc non validés." },
  "trap-bar-deadlift": { faisable: false, raison: "Aucune trap bar confirmée." },
  "ez-bar-curl": { faisable: false, raison: "Forme EZ des barres fixes non confirmée." },
  "reverse-curl": { faisable: false, raison: "Type/prise des barres fixes non confirmé pour ce mapping." },
  "ab-wheel": { faisable: false, raison: "Aucune roue abdominale confirmée." },
  "hanging-leg-raise": { faisable: false, raison: "Suspension libre adaptée sur la Dip/Chin Assist non validée." },
  "landmine-press": { faisable: false, raison: "Aucun ancrage/accessoire landmine confirmé." },
  "machine-lateral-raise": { faisable: false, raison: "Aucune machine d'élévations latérales observée." },
  "nordic-hamstring-curl": { faisable: false, raison: "Aucun dispositif fiable de blocage des chevilles validé." },
  "seated-calf-raise": { faisable: false, raison: "Aucune machine seated calf raise observée." },
  "standing-calf-raise": { faisable: false, raison: "Aucune machine standing calf raise observée." },
  "inverted-row": { faisable: false, raison: "Rack et Smith présents, mais aucune installation basse adaptée n'a été validée." },
};

export interface LigneCouvertureCatalogue {
  slug: string;
  exigencesMaterielles: string;
  physiquementFaisable: boolean;
  instanceExistante: boolean;
  raisonSiAbsente: string | null;
  instanceConcrete: string | null;
}

export const MATRICE_COUVERTURE: LigneCouvertureCatalogue[] = CATALOGUE.map((exercise) => {
  const instances = INVENTAIRE.filter((item) => item.slug === exercise.slug);
  const exception = FAISABLES_SANS_INSTANCE[exercise.slug] ?? NON_FAISABLES[exercise.slug];
  return {
    slug: exercise.slug,
    exigencesMaterielles: `${exercise.equipement} → ${besoinDe(exercise.slug, exercise.equipement)}`,
    physiquementFaisable: instances.length > 0 || exception?.faisable === true,
    instanceExistante: instances.length > 0,
    raisonSiAbsente: instances.length > 0 ? null : exception?.raison ?? "NON AUDITÉ",
    instanceConcrete: instances.length > 0 ? instances.map(descriptionInstance).join(" ; ") : null,
  };
});

function descriptionInstance(item: EntreeInventaire): string {
  return `${item.machineNom} ×${item.quantite} [${item.conventionCharge}]`;
}

export const SLUGS_AUDITES_EXPLICITEMENT = new Set([
  ...Object.keys(FAISABLES_SANS_INSTANCE),
  ...Object.keys(NON_FAISABLES),
]);
