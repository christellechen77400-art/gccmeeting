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
| 12/11/2026 | « Isabelle » (professeurs EDD de l'organigramme) = Isabelle J. | Confirmé par Christelle |
| 12/11/2026 | Annuaire complété avec l'onglet Membres_Groupes (`data/membres_groupes.json`, ajouté par Christelle) : 118 personnes | Demandé par Christelle |
| 12/11/2026 | Une page : le problème est la répétition, pas la quantité. Chaque information une seule fois (seul « À retenir » résume) ; répétitions entre blocs repérées par le code et renvoyées au modèle avec le « trop long » ; raccourcir de 1,5 × le dépassement ; sinon 2 pages, accepté | Choix de Christelle |
| 12/11/2026 | Objectif ou thème à piliers (ex. Prière, Louange) : éléments avec titre affichés en piliers, comme `reference/exemple-cr-gcc.png` ; sans titre, étapes numérotées | Demandé par Christelle |
| 12/11/2026 | Répétitions encore là après la relance : retirées par le code (garder la question, sinon la première ; un bloc entier n'est jamais retiré) | Choix de Christelle |
| 12/11/2026 | Rendu : bandeau moins haut, marges latérales 10 → 9 mm, espaces entre blocs et marges internes réduits d'environ 10 %, tailles de texte inchangées | Choix de Christelle |
| 12/11/2026 | Liste des membres de la consigne générée depuis `config/annuaire.json` ; les membres du groupe de la réunion sont donnés dans le message pour départager les homonymes (ex. Christelle C. / Christelle Z.) | Demandé par Christelle (liste) ; groupe ajouté par Claude Code, car l'annuaire contient des prénoms en double |
| 12/11/2026 | David S. : une seule personne (une fiche dans l'annuaire) | Confirmé par Christelle |
| 12/11/2026 | Fusion de `mission-2-ia` dans `main` (tag `BeforeAnySignificantChange-MAJ02` posé avant) | Autorisée par Christelle si les deux essais tiennent sur une page « ou presque » : GCC 1 page, musiciens 4 % de trop |
| 12/11/2026 | Missions 4 (Google Drive) et 5 (mise en ligne) reportées : on teste en local, avec dépôt du fichier dans l'interface | Choix de Christelle |
| 12/11/2026 | Audio : Groq `whisper-large-v3-turbo` en français, appel direct (`fetch`), compression ffmpeg puis découpage au-delà de 25 Mo ; remplacements appliqués aussi à la transcription | Demandé par Christelle |
| 12/11/2026 | Fusion de `mission-3-audio` dans `main` (tag `BeforeAnySignificantChange-MAJ03` posé avant), test sur une vraie réunion reporté | Demandé par Christelle |
