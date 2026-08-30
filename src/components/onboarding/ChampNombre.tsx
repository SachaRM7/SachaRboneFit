"use client";
import { Input } from "@/components/ui/input";
import { chiffresSeulement } from "@/lib/saisie";

/**
 * Un nombre qu'on tape, avec son unité.
 *
 * Le champ commence VIDE. Le pré-remplir à zéro produisait « 04 » et « 060 » :
 * le zéro survivait à la frappe parce qu'il ne venait pas de l'utilisateur. La
 * valeur indicative passe par le placeholder, qui disparaît dès la première
 * touche.
 *
 * L'absence de réponse et la réponse « 0 » restent deux choses distinctes :
 * la chaîne vide n'est pas convertie ici, elle remonte telle quelle.
 */

interface Props {
  id: string;
  label: string;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unite?: string;
  aide?: string;
  maxCaracteres?: number;
}

export function ChampNombre({
  id, label, valeur, onChange, placeholder, unite, aide, maxCaracteres = 3,
}: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-encre-2 text-sm block">{label}</label>
      <div className="relative">
        <Input
          id={id}
          // `type="number"` sur iOS accepte « e », « + » et le collage de texte,
          // et son incrémenteur n'a aucun sens pour une durée. Le clavier
          // numérique vient de `inputMode`.
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          value={valeur}
          placeholder={placeholder}
          onChange={(e) => onChange(chiffresSeulement(e.target.value, maxCaracteres))}
          className={`bg-carte border-filet text-encre chiffres h-12 text-base ${unite ? "pr-14" : ""}`}
        />
        {unite && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-encre-3 text-sm pointer-events-none">
            {unite}
          </span>
        )}
      </div>
      {aide && <p className="text-encre-3 text-xs">{aide}</p>}
    </div>
  );
}
