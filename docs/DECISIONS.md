# Décisions

| Date | Décision | Pourquoi |
|---|---|---|
| 10/11/2026 | Logiciel séparé du site GCC, dépôt `gcccfranco/meeting` | Tester d'abord en interne, intégrer plus tard si utile |
| 10/11/2026 | Fonctionnement 100 % automatique : la catégorie vient du sous-dossier Drive | Personne n'a rien à cliquer |
| 10/11/2026 | Entrées : audio, PDF, Google Doc, .txt | Réunions sans enregistrement possibles |
| 10/11/2026 | Audios et fichiers sources restent dans Drive | Ne pas alourdir l'application |
| 10/11/2026 | Français uniquement | Réunions presque toujours en français |
| 10/11/2026 | Transcription : Groq Whisper (free tier) | Gratuit pour notre volume, bon en français |
| 10/11/2026 | ~~Résumé : Claude Haiku par défaut, Sonnet en option~~ (remplacée, voir plus bas) | Moins d'1 centime par réunion ; pas de modèle chinois (données de l'église) |
| 10/11/2026 | Notification par mail depuis le compte GCC Franco | Demandé par Christelle |
| 10/11/2026 | Pas d'orchestration multi-agents ; liaison manuelle entre Claude (cloud) et Claude Code | Plus simple à suivre |
| 10/11/2026 | Plugin Superpowers interdit | Ralentit le développement |
| 10/11/2026 | Participants d'accord pour l'enregistrement ; audios gardés tant qu'il y a de la place | Validé par Christelle |
| 10/11/2026 | Liste de 12 membres écrite dans `src/prompt.md` en attendant l'onglet ORGANIGRAMME | Sans elle, l'IA ne peut pas deviner les initiales (« jo » → Jonathan Z.) ; validé par Christelle |
| 10/11/2026 | DeepSeek retenu à la place de Claude (choix de Christelle, 10/11/2026) : API compatible Anthropic, `deepseek-flash` par défaut, `deepseek-v4-pro` en option | Choix de Christelle. Remplace la ligne « Résumé : Claude Haiku… » et sa raison « pas de modèle chinois (données de l'église) » |
| 11/11/2026 | ~~Modèle `deepseek-v4-pro` par défaut, `deepseek-flash` en option~~ (remplacée, voir plus bas) | Choix de Christelle après les essais : `deepseek-v4-pro` respecte mieux les notes (questions gardées en questions, glossaire) |
| 11/11/2026 | Les participants ne sont plus devinés par l'IA : groupe de `config/groupes.json` (d'après l'ORGANIGRAMME), tous présents sauf la ligne « Absents : … » | Demandé par Christelle : l'IA inventait ou oubliait des participants |
| 11/11/2026 | Remplacements fixes après l'IA (`src/remplacements.json`) ; température 0,2 | Demandé par Christelle : corrections sûres par le code plutôt que par la consigne ; résultats plus réguliers |
| 11/11/2026 | Une page : contenu réduit automatiquement jusqu'à 80 % (texte des cartes 7,7 pt, petites capitales ≥ 6 pt), sinon 2 pages | Demandé par Christelle (« minimum lisible ») ; seuil de 80 % choisi par Claude Code, à valider |
| 11/11/2026 | Modèle `deepseek-flash` par défaut, `deepseek-v4-pro` en option | Choix de Christelle après le comparatif à température 0,2 : `deepseek-flash` plus fidèle aux notes, tient sur une page, plus rapide |
| 11/11/2026 | Groupe « Coordination Franco » (Jonathan Z., Stéphane Z., Christelle C.) : c'est le groupe de la réunion GCC du 4/10 | Indiqué par Christelle |
| 11/11/2026 | Annuaire `config/annuaire.json` (personnes de l'organigramme) ; les groupes n'y prennent que des noms de l'annuaire, un nom inconnu est signalé mais accepté ; annuaire, groupes et présences modifiables depuis l'interface (SPEC §2) | Demandé par Christelle : rien de figé |
| 11/11/2026 | Une page : ni limite du nombre de blocs ni réduction sous 80 % ; si ça dépasse même à 80 %, le modèle raccourcit ses textes une seule fois (« trop long de X % »), sinon PDF sur 2 pages ; PNG toujours en une seule image | Choix de Christelle |
| 11/11/2026 | Annuaire complété avec les membres des groupes Paix, Fidélité, Bonté cités par Christelle (Cyliane D., Mina C., Claire L., Cyrick D., Valérie W.) ; MAJxx.TXT remplacé par HANDOFF.md | Choix de Christelle |
