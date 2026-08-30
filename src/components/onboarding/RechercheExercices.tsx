"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Choisir des exercices dans le catalogue, plutôt que les écrire.
 *
 * Le champ précédent était une liste de noms séparés par des virgules. Une
 * faute de frappe, une variante, un mot anglais — et l'exercice n'était jamais
 * retrouvé : la donnée existait sans jamais servir. Ici on enregistre
 * l'identifiant du catalogue, donc le moteur reconnaît à coup sûr ce qui a été
 * écarté.
 *
 * Le catalogue tient en cent vingt entrées : il est chargé une fois et filtré
 * dans le navigateur, ce qui rend la recherche instantanée et supprime un
 * aller-retour réseau à chaque touche.
 */

export interface ExerciceChoisi {
  id: string;
  nom: string;
}

interface Props {
  choisis: ExerciceChoisi[];
  onChange: (liste: ExerciceChoisi[]) => void;
  max?: number;
}

/** Compare sans accents ni casse : « developpe » doit trouver « Développé ». */
const normaliser = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function RechercheExercices({ choisis, onChange, max = 20 }: Props) {
  const [catalogue, setCatalogue] = useState<ExerciceChoisi[]>([]);
  const [requete, setRequete] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetch("/api/exercises")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (annule || !Array.isArray(d)) return;
        setCatalogue(d.map((e: { id: string; nom: string }) => ({ id: e.id, nom: e.nom })));
      })
      .catch(() => !annule && setErreur("Catalogue indisponible pour le moment."));
    return () => { annule = true; };
  }, []);

  const resultats = useMemo(() => {
    const q = normaliser(requete.trim());
    if (q.length < 2) return [];
    const dejaPris = new Set(choisis.map((c) => c.id));
    return catalogue
      .filter((e) => !dejaPris.has(e.id) && normaliser(e.nom).includes(q))
      .slice(0, 8);
  }, [requete, catalogue, choisis]);

  const ajouter = (e: ExerciceChoisi) => {
    if (choisis.length >= max) return;
    onChange([...choisis, e]);
    setRequete("");
  };

  return (
    <div className="space-y-2">
      {choisis.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {choisis.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-encre bg-encre text-papier pl-3 pr-1.5 py-1.5 text-sm"
            >
              {e.nom}
              <button
                type="button"
                onClick={() => onChange(choisis.filter((x) => x.id !== e.id))}
                aria-label={`Retirer ${e.nom}`}
                className="p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-encre-3" aria-hidden />
        <Input
          value={requete}
          onChange={(e) => setRequete(e.target.value)}
          placeholder="Rechercher un exercice"
          aria-label="Rechercher un exercice à écarter"
          enterKeyHint="search"
          className="bg-carte border-filet text-encre h-12 pl-9 text-base"
        />
      </div>

      {erreur && <p className="text-encre-3 text-xs">{erreur}</p>}

      {resultats.length > 0 && (
        <ul className="rounded-xl border border-filet bg-carte divide-y divide-filet-doux overflow-hidden">
          {resultats.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => ajouter(e)}
                className="w-full text-left px-4 py-3 text-sm text-encre hover:bg-papier-2"
              >
                {e.nom}
              </button>
            </li>
          ))}
        </ul>
      )}

      {requete.trim().length >= 2 && resultats.length === 0 && !erreur && (
        <p className="text-encre-3 text-xs">
          Rien de ce nom au catalogue. Tu pourras écarter un exercice pendant une séance.
        </p>
      )}
    </div>
  );
}
