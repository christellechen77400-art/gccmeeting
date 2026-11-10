# GCCMeeting — consignes pour Claude Code

Lis ce fichier en entier au début de chaque conversation, puis `docs/HANDOFF.md`.

## Le projet en une phrase
GCCMeeting transforme automatiquement un enregistrement ou des notes de réunion déposés dans Google Drive en un compte-rendu PDF + PNG, mis en page selon le modèle validé (voir `docs/TEMPLATE.md` et `reference/`).

## Règles de travail
1. **Ne jamais utiliser le plugin Superpowers**, ni ses commandes ou skills. Il est désactivé volontairement.
2. **Tout en français** : interface, messages, comptes-rendus, commentaires utiles. Le code (noms de variables, fonctions) reste en anglais.
3. **Mémoire sur le disque** : avant de terminer une conversation, mets à jour `docs/HANDOFF.md` (ce qui est fait, ce qui reste, les problèmes rencontrés). Une décision importante va dans `docs/DECISIONS.md`.
4. **Une mission à la fois** : ne travaille que sur la tâche demandée dans le message. Ne modifie pas d'autres parties sans le signaler.
5. **Prouve que ça marche** : lance les tests ou un exemple réel avant de dire qu'une tâche est terminée, et montre le résultat.
6. **Rien de secret dans le dépôt** : les clés API vont dans `.env` (jamais commité). Tiens `.env.example` à jour.
7. **Commits** petits et clairs, en français : `feat: …`, `fix: …`, `docs: …`.
8. **Ne rien inventer dans les comptes-rendus** : l'IA marque « à confirmer » ce qui est incertain.

## Contexte utile
- Utilisatrice : Christelle C., seule utilisatrice au départ (usage interne, pas intégré au site GCC pour l'instant).
- Église GCC (Grace Church), partie francophone. Glossaire et liste de membres : voir `docs/SPEC.md`.
- Compte Google : GCC Franco. Dépôt : `gcccfranco/meeting` (séparé de l'application GCC pour pouvoir l'intégrer plus tard).

## Documents
- `docs/SPEC.md` — ce que fait le logiciel
- `docs/TEMPLATE.md` — modèle de compte-rendu (bandeaux, blocs, charte)
- `docs/DECISIONS.md` — décisions prises et pourquoi
- `docs/HANDOFF.md` — journal de passation, à jour à chaque fin de conversation
- `reference/` — exemples validés (HTML + PNG) : c'est le rendu à reproduire
