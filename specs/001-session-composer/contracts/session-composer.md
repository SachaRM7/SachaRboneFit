# Contrats — composition de séance

## POST `/api/session-composer`

Crée atomiquement un gabarit et ses exercices après authentification.

### Requête

```json
{
  "draft": {
    "id": "uuid",
    "origin": "blank",
    "name": "Dos express",
    "letter": "LIBRE",
    "gymId": "uuid",
    "durationMinutes": 35,
    "exercises": [
      {
        "clientId": "uuid",
        "exerciseId": "uuid",
        "order": 0,
        "sets": 3,
        "repMin": 8,
        "repMax": 12,
        "targetRir": 3,
        "tempo": "2-0-1-0",
        "restSeconds": 90
      }
    ]
  },
  "scope": { "type": "today" }
}
```

### Réponse 201 ou idempotente 200

```json
{
  "templateId": "uuid",
  "scope": "today",
  "startUrl": "/sessions/new/uuid"
}
```

Pour `replace_next`, `startUrl` contient un `rotationTemplateId` validé. Pour `program`, la réponse renvoie le gabarit permanent sans démarrer automatiquement le Live.

### Erreurs

- `400` : brouillon invalide ou portée incohérente.
- `401` : utilisateur absent.
- `403` : lieu, exercice ou séance de rotation n'appartient pas à l'utilisateur.
- `409` : contexte modifié, matériel devenu indisponible ou rotation différente.

## POST `/api/seance-du-jour`

Extension compatible du contrat existant :

```json
{
  "seanceTemplateId": "uuid-du-gabarit-personnalise",
  "rotationTemplateId": "uuid-optionnel-de-la-seance-planifiee",
  "gymId": "uuid",
  "sleepHours": 7,
  "fasted": false,
  "energyOnWake": 7
}
```

Sans `rotationTemplateId`, le comportement existant reste inchangé.

## Outil Coach `propose_session_build`

L'outil reçoit un gabarit complet et une justification courte. Il réutilise la validation existante, prépare une proposition persistée et ne crée aucune séance avant confirmation.

```json
{
  "name": "Haut du corps — 35 min",
  "letter": "ALT",
  "gymId": "uuid",
  "durationMinutes": 35,
  "exercises": [
    {
      "exerciseId": "uuid",
      "sets": 3,
      "repMin": 8,
      "repMax": 12,
      "targetRir": 3,
      "tempo": "2-0-1-0",
      "restSeconds": 90
    }
  ],
  "reason": "Alternative courte compatible avec le matériel et la récupération du jour."
}
```

L'application passe ensuite par la route existante de confirmation des propositions Coach.
