#!/usr/bin/env python3
"""
Genere le SQL de raccordement de la base existante au catalogue.

Contexte : le catalogue de 120 exercices et leurs illustrations n'existaient
que dans le code et dans `public/exercices/`. La seule voie qui les inserait en
base etait `seed.ts`, qui commence par un TRUNCATE — donc injouable sur une base
portant un historique reel. Resultat : `exercises.slug` etait NULL partout, et
tout l'affichage des illustrations est conditionne a ce slug.

Le SQL produit est **non destructif** :
- il ne fait que des UPDATE de colonnes descriptives (slug, equipement, muscles
  secondaires) sur les exercices existants, jamais sur `nom` ni `pilier`, qui
  sont des choix de l'utilisateur ;
- il n'ecrase un slug que s'il est NULL (relance sans effet de bord) ;
- il ajoute les exercices du catalogue absents, sans toucher aux lignes en place,
  donc les `exercise_instances` et l'historique de series restent rattaches.

Usage : python3 src/scripts/generer-backfill-catalogue.py > backfill.sql
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
CATALOGUE_TS = RACINE / "src/lib/referentiels/catalogue.ts"

# Rapprochements que le score de tokens ne trouve pas seul : abreviations
# maison, noms de machine propres a la salle, ou libelles trop eloignes.
CORRESPONDANCES_MANUELLES = {
    "Seated Pec Fly": "pec-deck",
    "Standing Military Press Machine": "machine-shoulder-press",
    "Triceps Pushdown": "tricep-pushdown",
    "Wide Stance Hack Squat (Matrix Perfect Squat)": "hack-squat",
    "Incline DB Twist Curl": "incline-dumbbell-curl",
    "Overhead Cable Triceps Extension": "overhead-tricep-extension",
    "Seated Row Machine": "machine-row",
    "Wide-Grip Seated Cable Row": "seated-row",
}

# Tokens trop courants pour porter de l'information : « machine » ou « barre »
# apparaissent partout et rapprocheraient n'importe quoi de n'importe quoi.
TOKENS_FAIBLES = {"the", "a", "of", "machine", "barre", "cable", "db", "bar"}
SEUIL_CONFIANCE = 0.50


def tokens(valeur: str) -> list[str]:
    sans_accent = unicodedata.normalize("NFD", valeur.lower())
    sans_accent = "".join(c for c in sans_accent if unicodedata.category(c) != "Mn")
    return [t for t in re.split(r"[^a-z0-9]+", sans_accent) if t]


def lire_catalogue() -> list[dict]:
    """Extrait le catalogue du fichier TypeScript, qui en est la seule source."""
    source = CATALOGUE_TS.read_text()
    blocs = re.findall(r"\{\s*slug:.*?\n  \}", source, flags=re.S)
    entrees = []
    for bloc in blocs:
        def champ(nom):
            m = re.search(rf'{nom}:\s*"([^"]*)"', bloc)
            return m.group(1) if m else None

        def liste(nom):
            m = re.search(rf"{nom}:\s*\[([^\]]*)\]", bloc)
            return re.findall(r'"([^"]+)"', m.group(1)) if m else []

        slug = champ("slug")
        if not slug:
            continue
        entrees.append({
            "slug": slug,
            "nom": champ("nom"),
            "pilier": champ("pilier"),
            "profilTension": champ("profilTension"),
            "categorieRole": champ("categorieRole"),
            "type": champ("type"),
            "equipement": champ("equipement"),
            "musclesPrincipaux": liste("musclesPrincipaux"),
            "musclesSecondaires": liste("musclesSecondaires"),
        })
    return entrees


def meilleur_rapprochement(nom: str, catalogue: list[dict]) -> tuple[str | None, float]:
    cibles = set(tokens(nom))
    meilleur, score_max = None, 0.0
    for entree in catalogue:
        candidats = set(tokens(entree["nom"])) | set(tokens(entree["slug"]))
        commun = cibles & candidats
        if not commun:
            continue
        poids = sum(0.3 if t in TOKENS_FAIBLES else 1.0 for t in commun)
        total = sum(0.3 if t in TOKENS_FAIBLES else 1.0 for t in (cibles | candidats))
        score = poids / total if total else 0.0
        if score > score_max:
            meilleur, score_max = entree["slug"], score
    return meilleur, score_max


def litteral(valeur) -> str:
    if valeur is None:
        return "NULL"
    if isinstance(valeur, list):
        return "'" + json.dumps(valeur).replace("'", "''") + "'::jsonb"
    return "'" + str(valeur).replace("'", "''") + "'"


def main() -> None:
    catalogue = lire_catalogue()
    par_slug = {e["slug"]: e for e in catalogue}
    noms_bd = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else []

    lignes = [
        "-- Raccordement de la base existante au catalogue d'exercices.",
        "-- Genere par src/scripts/generer-backfill-catalogue.py — ne pas editer a la main.",
        "-- Non destructif : aucun DELETE, aucun TRUNCATE, aucune modification de `nom` ni `pilier`.",
        "BEGIN;",
        "",
    ]

    non_resolus = []
    for entree_bd in noms_bd:
        nom = entree_bd["nom"]
        slug = CORRESPONDANCES_MANUELLES.get(nom)
        if not slug:
            candidat, score = meilleur_rapprochement(nom, catalogue)
            slug = candidat if score >= SEUIL_CONFIANCE else None
        if not slug or slug not in par_slug:
            non_resolus.append(nom)
            continue
        c = par_slug[slug]
        lignes.append(
            "UPDATE exercises SET "
            f"slug = {litteral(slug)}, "
            f"equipement = COALESCE(equipement, {litteral(c['equipement'])}), "
            f"muscles_secondaires = COALESCE(muscles_secondaires, {litteral(c['musclesSecondaires'])}), "
            "updated_at = now() "
            f"WHERE nom = {litteral(nom)} AND slug IS NULL;"
        )

    lignes += ["", "-- Exercices du catalogue absents de la base, ajoutes pour chaque utilisateur.", ""]
    for c in catalogue:
        lignes.append(
            "INSERT INTO exercises (user_id, nom, pilier, profil_tension, type, "
            "categorie_role, muscles_principaux, muscles_secondaires, equipement, slug)\n"
            f"SELECT u.id, {litteral(c['nom'])}, {litteral(c['pilier'])}, "
            f"{litteral(c['profilTension'])}, {litteral(c['type'])}, "
            f"{litteral(c['categorieRole'])}, {litteral(c['musclesPrincipaux'])}, "
            f"{litteral(c['musclesSecondaires'])}, {litteral(c['equipement'])}, {litteral(c['slug'])}\n"
            "FROM users u\n"
            "WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.user_id = u.id "
            f"AND (e.slug = {litteral(c['slug'])} OR e.nom = {litteral(c['nom'])}));"
        )

    lignes += [
        "",
        "COMMIT;",
        "",
        "-- Verification.",
        "SELECT 'exercices sans slug' AS controle, count(*) AS valeur FROM exercises WHERE slug IS NULL",
        "UNION ALL SELECT 'exercices au catalogue', count(*) FROM exercises WHERE slug IS NOT NULL;",
    ]

    if non_resolus:
        print(f"-- ATTENTION : {len(non_resolus)} exercice(s) sans rapprochement fiable :", file=sys.stderr)
        for nom in non_resolus:
            print(f"--   {nom}", file=sys.stderr)

    print("\n".join(lignes))


if __name__ == "__main__":
    main()
