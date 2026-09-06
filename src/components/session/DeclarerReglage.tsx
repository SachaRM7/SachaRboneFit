"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  LIBELLES_COURANTS, LIMITE_LIBELLE_REGLAGE, LIMITE_OPTION_REGLAGE, LIMITE_UNITE_REGLAGE,
  MAX_OPTIONS_REGLAGE, messageDeRefusDeclaration, validerDeclaration,
  type TypeReglage,
} from "./execution-client";
import { EXEMPLES_TYPE_REGLAGE, LIBELLES_TYPE_REGLAGE } from "@/lib/validators/reglage";
import type { ReglageAffiche } from "./execution-client";

interface Props {
  exerciseInstanceId: string;
  exerciseId: string;
  /** Reçoit l'état complet des réglages après création. */
  onDeclare: (reglages: ReglageAffiche[]) => void;
}

const TYPES: TypeReglage[] = ["cran", "degres", "choix", "texte"];

/**
 * Dire qu'un réglage existe, debout devant la machine.
 *
 * CE QUE CE FORMULAIRE NE DEMANDE PAS. Les bornes d'un cran sont facultatives,
 * et rien n'est pré-rempli. On ne sait pas combien de crans a le siège de cette
 * Seated Row tant qu'on n'est pas allé les compter, et un « 1 à 10 » posé par
 * défaut ferait pire que ne rien poser : il refuserait un cran 12 pourtant
 * réel, en donnant à une supposition l'autorité d'une mesure. Le champ dit donc
 * « si tu les as comptés », et l'absence se propage jusqu'à la validation, qui
 * ne compare simplement rien.
 *
 * Les noms proposés en dessous sont des LIBELLÉS, pas des réglages tout faits :
 * appuyer sur « Siège » remplit le nom et choisit un type probable. Rien de ce
 * qui décrit l'appareil lui-même n'est deviné.
 *
 * Le formulaire est replié par défaut. Ouvrir la fiche d'exécution sert
 * d'abord à LIRE ce qu'on avait retenu ; déclarer un réglage est un geste
 * occasionnel, qui ne doit pas occuper l'écran à chaque série.
 */
export function DeclarerReglage({ exerciseInstanceId, exerciseId, onDeclare }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [libelle, setLibelle] = useState("");
  const [type, setType] = useState<TypeReglage>("cran");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [unite, setUnite] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const reinitialiser = () => {
    setLibelle(""); setType("cran"); setMin(""); setMax(""); setUnite("");
    setOptions(["", ""]); setErreur(null);
  };

  const fermer = () => { setOuvert(false); reinitialiser(); };

  const proposer = (nom: string, typeProbable: TypeReglage) => {
    setLibelle(nom);
    setType(typeProbable);
    setErreur(null);
  };

  const majOption = (i: number, valeur: string) => {
    setOptions((o) => o.map((v, n) => (n === i ? valeur : v)));
    setErreur(null);
  };

  const envoyer = async () => {
    const brute = {
      libelle,
      type,
      min: type === "cran" || type === "degres" ? min : null,
      max: type === "cran" || type === "degres" ? max : null,
      options: type === "choix" ? options : null,
      unite: type === "degres" || type === "cran" ? unite : null,
    };

    // La même validation que le serveur, avant l'aller-retour : le serveur
    // revalide de toute façon — il fait autorité — mais dire « il faut au moins
    // deux valeurs » tout de suite évite d'attendre pour l'apprendre.
    const verdict = validerDeclaration(brute);
    if (!verdict.valide) {
      setErreur(messageDeRefusDeclaration(verdict.refus));
      return;
    }

    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/execution/${exerciseInstanceId}/reglages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...brute, exerciseId }),
      });
      const reponse = await res.json();
      if (!res.ok) {
        setErreur(reponse.error ?? "Déclaration impossible");
        return;
      }
      onDeclare(reponse.reglages);
      fermer();
    } catch {
      setErreur("Déclaration impossible");
    } finally {
      setEnCours(false);
    }
  };

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-3 h-11 px-3 flex items-center gap-2 rounded-lg border border-filet bg-carte text-sm text-encre-2"
      >
        <Plus className="w-4 h-4" aria-hidden />
        Ajouter un réglage
      </button>
    );
  }

  const numerique = type === "cran" || type === "degres";

  return (
    <div className="mt-3 rounded-xl border border-filet bg-carte p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-encre">Nouveau réglage</h4>
        <button
          type="button" onClick={fermer} aria-label="Annuler"
          className="w-9 h-9 -mr-1 flex items-center justify-center rounded-full text-encre-3"
        >
          <X className="w-5 h-5" aria-hidden />
        </button>
      </div>

      <div>
        <label htmlFor="decl-libelle" className="block text-sm text-encre-2 mb-1">
          Nom du réglage
        </label>
        <input
          id="decl-libelle"
          value={libelle}
          maxLength={LIMITE_LIBELLE_REGLAGE}
          onChange={(e) => { setLibelle(e.target.value); setErreur(null); }}
          placeholder="Siège, dossier, hauteur de poulie…"
          className="w-full h-12 rounded-xl border border-filet bg-papier px-3 text-encre"
        />
        {/* Des noms, pas des réglages : le type suit, tout le reste reste à
            renseigner par qui regarde la machine. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {LIBELLES_COURANTS.map((p) => (
            <button
              key={p.libelle}
              type="button"
              onClick={() => proposer(p.libelle, p.type)}
              className="h-8 px-2.5 rounded-full border border-filet text-xs text-encre-3"
            >
              {p.libelle}
            </button>
          ))}
        </div>
      </div>

      <fieldset>
        <legend className="block text-sm text-encre-2 mb-1">Nature de la valeur</legend>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => { setType(t); setErreur(null); }}
              className={`h-11 px-2 rounded-lg border text-sm ${
                type === t
                  ? "border-encre bg-encre text-papier font-medium"
                  : "border-filet bg-papier text-encre-2"
              }`}
            >
              {LIBELLES_TYPE_REGLAGE[t]}
            </button>
          ))}
        </div>
        <p className="text-xs text-encre-3 mt-1.5">{EXEMPLES_TYPE_REGLAGE[type]}</p>
      </fieldset>

      {numerique && (
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="decl-min" className="block text-sm text-encre-2 mb-1">Minimum</label>
              <input
                id="decl-min" inputMode="decimal" value={min}
                onChange={(e) => { setMin(e.target.value); setErreur(null); }}
                placeholder="—"
                className="w-full h-12 rounded-xl border border-filet bg-papier px-3 text-encre chiffres tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="decl-max" className="block text-sm text-encre-2 mb-1">Maximum</label>
              <input
                id="decl-max" inputMode="decimal" value={max}
                onChange={(e) => { setMax(e.target.value); setErreur(null); }}
                placeholder="—"
                className="w-full h-12 rounded-xl border border-filet bg-papier px-3 text-encre chiffres tabular-nums"
              />
            </div>
          </div>
          {/* La phrase qui empêche d'inventer une plage : laisser vide est un
              état normal, pas un formulaire inachevé. */}
          <p className="text-xs text-encre-3 mt-1.5">
            Seulement si tu les as comptés sur l&apos;appareil. Laisse vide sinon —
            aucune valeur ne sera refusée.
          </p>
        </div>
      )}

      {numerique && (
        <div>
          <label htmlFor="decl-unite" className="block text-sm text-encre-2 mb-1">
            Unité <span className="text-encre-3">(facultatif)</span>
          </label>
          <input
            id="decl-unite" value={unite} maxLength={LIMITE_UNITE_REGLAGE}
            onChange={(e) => { setUnite(e.target.value); setErreur(null); }}
            placeholder={type === "degres" ? "°" : "—"}
            className="w-full h-12 rounded-xl border border-filet bg-papier px-3 text-encre"
          />
        </div>
      )}

      {type === "choix" && (
        <div>
          <span className="block text-sm text-encre-2 mb-1">Positions possibles</span>
          <div className="space-y-2">
            {options.map((o, i) => (
              <input
                // Les positions n'ont pas d'identité tant qu'elles sont vides :
                // l'index est ici le seul repère stable, et la liste ne se
                // réordonne jamais.
                // eslint-disable-next-line react/no-array-index-key
                key={i}
                value={o}
                maxLength={LIMITE_OPTION_REGLAGE}
                onChange={(e) => majOption(i, e.target.value)}
                placeholder={i === 0 ? "verticale" : i === 1 ? "neutre" : "…"}
                aria-label={`Position ${i + 1}`}
                className="w-full h-12 rounded-xl border border-filet bg-papier px-3 text-encre"
              />
            ))}
          </div>
          {options.length < MAX_OPTIONS_REGLAGE && (
            <button
              type="button"
              onClick={() => setOptions((o) => [...o, ""])}
              className="mt-2 h-10 px-3 rounded-lg border border-filet text-sm text-encre-2"
            >
              Une position de plus
            </button>
          )}
        </div>
      )}

      {erreur && <p role="alert" className="text-perte text-sm">{erreur}</p>}

      <button
        type="button"
        onClick={() => void envoyer()}
        disabled={enCours}
        className="w-full h-12 rounded-xl bg-encre text-papier font-medium disabled:opacity-60"
      >
        {enCours ? "Enregistrement…" : "Décrire ce réglage"}
      </button>
      {/* Une définition est commune au lieu : le dire avant, pas après. */}
      <p className="text-xs text-encre-3">
        Ce réglage décrit l&apos;appareil : tous les comptes de la salle le verront.
        La valeur que tu y mettras ensuite reste la tienne.
      </p>
    </div>
  );
}
