# Décisions

| Date | Décision | Pourquoi |
|---|---|---|
| 10/11/2026 | Logiciel séparé du site GCC, dépôt `gcccfranco/meeting` | Tester d'abord en interne, intégrer plus tard si utile |
| 10/11/2026 | Fonctionnement 100 % automatique : la catégorie vient du sous-dossier Drive | Personne n'a rien à cliquer |
| 10/11/2026 | Entrées : audio, PDF, Google Doc, .txt | Réunions sans enregistrement possibles |
| 10/11/2026 | Audios et fichiers sources restent dans Drive | Ne pas alourdir l'application |
| 10/11/2026 | Français uniquement | Réunions presque toujours en français |
| 10/11/2026 | Transcription : Groq Whisper (free tier) | Gratuit pour notre volume, bon en français |
| 10/11/2026 | Résumé : Claude Haiku par défaut, Sonnet en option | Moins d'1 centime par réunion ; pas de modèle chinois (données de l'église) |
| 10/11/2026 | Notification par mail depuis le compte GCC Franco | Demandé par Christelle |
| 10/11/2026 | Pas d'orchestration multi-agents ; liaison manuelle entre Claude (cloud) et Claude Code | Plus simple à suivre |
| 10/11/2026 | Plugin Superpowers interdit | Ralentit le développement |
| 10/11/2026 | Participants d'accord pour l'enregistrement ; audios gardés tant qu'il y a de la place | Validé par Christelle |
| 10/11/2026 | Liste de 12 membres écrite dans `src/prompt.md` en attendant l'onglet ORGANIGRAMME | Sans elle, l'IA ne peut pas deviner les initiales (« jo » → Jonathan Z.) ; validé par Christelle |
