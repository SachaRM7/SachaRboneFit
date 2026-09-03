"use client";
import { Input } from "@/components/ui/input";
import { ChampNombre } from "./ChampNombre";
import {
  BORNES_CORPS, LIBELLES_SEXE, SEXES, bornesDeNaissance,
} from "@/lib/validators/onboarding";

/**
 * Qui s'entraîne : naissance, sexe, taille, poids.
 *
 * Un seul composant pour l'onboarding ET le profil. C'est la raison d'être du
 * fichier : ces quatre champs vivaient dans deux formulaires qui ne se
 * ressemblaient pas — quand ils y vivaient. `date_naissance` et `taille`
 * existaient en base sans qu'aucun écran ne les demande, et le poids était
 * accepté par le schéma de validation de l'onboarding puis jeté.
 *
 * Tout est facultatif. Refuser de répondre ne doit empêcher ni de s'entraîner
 * ni de terminer l'inscription : le moteur fonctionne sans, et une valeur
 * inventée serait pire qu'une absence.
 */

export interface MesuresDuCorps {
  dateNaissance: string;
  sexe: string;
  taille: string;
  poids: string;
}

export const MESURES_VIDES: MesuresDuCorps = {
  dateNaissance: "", sexe: "", taille: "", poids: "",
};

interface Props {
  valeurs: MesuresDuCorps;
  onChange: (v: MesuresDuCorps) => void;
  /**
   * Le poids se saisit une fois, à l'inscription : ensuite il vit dans les
   * pesées, et le profil renvoie vers cet écran plutôt que d'ouvrir une
   * deuxième porte sur la même donnée.
   */
  avecPoids?: boolean;
  /** Ce que devient la donnée. Dit une fois, là où on la demande. */
  aide?: string;
}

const carte = "rounded-xl border text-left transition-colors w-full";
const actif = "border-encre bg-encre text-papier";
const inactif = "border-filet bg-carte text-encre";

export function QuiTuEs({ valeurs, onChange, avecPoids = true, aide }: Props) {
  const bornes = bornesDeNaissance();
  const modifier = (patch: Partial<MesuresDuCorps>) => onChange({ ...valeurs, ...patch });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="dateNaissance" className="text-encre-2 text-sm block">
          Date de naissance <span className="text-encre-3">· facultatif</span>
        </label>
        <Input
          id="dateNaissance"
          type="date"
          // Les bornes viennent du même endroit que la validation serveur :
          // sans ça, l'écran laisse saisir une valeur qui sera refusée après
          // l'envoi, et le refus arrive trop tard pour être compris.
          min={bornes.min}
          max={bornes.max}
          value={valeurs.dateNaissance}
          onChange={(e) => modifier({ dateNaissance: e.target.value })}
          className="bg-carte border-filet text-encre h-12 text-base"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-encre-2 text-sm">
          Sexe <span className="text-encre-3">· facultatif</span>
        </p>
        <div className="grid gap-1.5">
          {SEXES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => modifier({ sexe: valeurs.sexe === s ? "" : s })}
              aria-pressed={valeurs.sexe === s}
              className={`${carte} px-4 h-12 text-sm ${valeurs.sexe === s ? actif : inactif}`}
            >
              {LIBELLES_SEXE[s]}
            </button>
          ))}
        </div>
      </div>

      <ChampNombre
        id="taille"
        label="Taille · facultatif"
        valeur={valeurs.taille}
        onChange={(taille) => modifier({ taille })}
        placeholder={String(BORNES_CORPS.taille.min + 75)}
        unite="cm"
      />

      {avecPoids && (
        <ChampNombre
          id="poids"
          label="Poids actuel · facultatif"
          valeur={valeurs.poids}
          onChange={(poids) => modifier({ poids })}
          placeholder="75"
          unite="kg"
          aide="Ce sera ta première pesée. Tu pourras en ajouter d'autres quand tu veux."
        />
      )}

      {aide && <p className="text-encre-3 text-xs leading-relaxed">{aide}</p>}
    </div>
  );
}
