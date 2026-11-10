# Journal de passation

À mettre à jour à la fin de chaque conversation (Claude ou Claude Code). Le plus récent en haut.

## 10/11/2026 — Claude Code, Mission 2 (notes → compte-rendu avec l'IA)
**Fait** (branche `mission-2-ia`, poussée, **pas fusionnée dans `main`**)
- `npm run cr -- <fichier> --categorie "<Catégorie>"` :
  1. lit un .txt, .md, .pdf ou .docx (`src/extract.ts`) ;
  2. envoie le texte à l'IA (`src/cr.ts`) ;
  3. valide le JSON, l'enregistre dans `out/<nom>.json`, puis lance le rendu de la mission 1.
- **IA : DeepSeek** à la place de Claude (choix de Christelle, voir `docs/DECISIONS.md`) :
  - SDK officiel `@anthropic-ai/sdk`, pointé vers l'API compatible Anthropic de DeepSeek ;
  - `.env` : `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`, `ANTHROPIC_API_KEY` (clé DeepSeek), `ANTHROPIC_MODEL` ;
  - modèle `deepseek-flash` par défaut, `deepseek-v4-pro` en option.
- DeepSeek ne gère pas la sortie structurée. L'IA répond donc en appelant l'outil `enregistrer_compte_rendu` :
  - son `input_schema` est le format SPEC §4, généré depuis le schéma zod (`src/schema.ts`) ;
  - pas de champ `type` dans l'outil (DeepSeek renvoie une erreur 422) ;
  - `tool_choice` forcé sur l'outil, réflexion désactivée (`thinking: disabled`) ;
  - le JSON est validé ; en cas d'échec, un seul nouvel essai, avec l'erreur renvoyée au modèle.
- La consigne envoyée à l'IA est dans `src/prompt.md`. Elle reprend :
  - les règles de SPEC §4 (ne rien inventer, « à confirmer », 3 points maximum, phrases courtes, « Prénom I. ») ;
  - le glossaire de §5 ;
  - le rôle de chaque bloc et les pictos ;
  - les dates : année manquante déduite de la date de dépôt et signalée ;
  - la liste de 12 membres, validée par Christelle.
- `.env.example` est dans le dépôt. Une règle de permission empêche Claude Code de lire ou d'écrire les fichiers `.env*` : c'est Christelle qui les modifie.
- Corrections :
  - le gras dans les étapes du bloc `objectif` garde le style du texte ;
  - la page 2 du PDF a une marge crème de 12 mm en haut ;
  - `package-lock.json` est resynchronisé avec `npm install` (commité avec la fonctionnalité).
- Paquets ajoutés :
  - `@anthropic-ai/sdk` : SDK officiel, qui sert aussi pour DeepSeek ;
  - `zod` : schéma de l'outil et validation ;
  - `unpdf` : texte des PDF ;
  - `mammoth` : texte des .docx.
- Tests : `npm test` → 11 tests OK, dont un test qui vérifie que l'outil n'a pas de champ `type`. `npm run typecheck` → sans erreur.
- Vérifications faites :
  - extraction sur .txt, .pdf et .docx ;
  - messages d'erreur : usage, catégorie inconnue, clé manquante, clé refusée ;
  - le PNG de l'exemple musiciens est identique au pixel près à celui de la mission 1.

**Pas encore fait : les deux essais réels**
- DeepSeek **refuse la clé** de `.env` : « Authentication Fails, Your api key: ****caf4 is invalid ».
  - L'adresse `ANTHROPIC_BASE_URL` est bonne : c'est bien DeepSeek qui répond.
  - À vérifier : la clé a été recopiée en entier, sans espace ni guillemets, et elle est active sur platform.deepseek.com.
- Une fois la clé corrigée, lancer :
  - `npm run cr -- exemples/notes/reunion-gcc.txt --categorie GCC`
  - `npm run cr -- exemples/notes/reunion-musiciens.txt --categorie "Culte Franco"`
- Ensuite, comparer avec `reference/exemple-cr-gcc.png` et `reference/exemple-cr-musiciens.png`, et lister les écarts de contenu.
- Pas encore vérifié avec DeepSeek :
  - que les noms de modèle `deepseek-flash` et `deepseek-v4-pro` sont acceptés ;
  - que `thinking: disabled` est accepté.

**Points d'attention**
- DeepSeek remplace la décision « pas de modèle chinois (données de l'église) » : les notes de réunion, avec les noms des membres, partent chez DeepSeek.
- La liste de membres est donnée à l'IA : les essais sur ces deux réunions sont un peu plus faciles que la réalité.
- `categorie` et `sous_titre` ne sont pas demandés à l'IA : ils viennent de la commande (plus tard, du dossier Drive).
- Les fichiers `out/` ne sont pas commités.

**Ensuite** : corriger la clé DeepSeek, faire les deux essais, comparer avec les références, puis valider la mission 2 avant de fusionner.

## 10/11/2026 — Claude Code, Mission 1 (suite) : validation et fusion
**Fait**
- Bandeau et champs ajoutés au JSON **validés par Christelle** ; `docs/SPEC.md` §4 mis à jour.
- Bloc `questions` : affiché en cartes comme `decisions` (titre, texte, tags, picto point d'interrogation).
- `exemples/tous-les-blocs.json` : un exemple de chaque type de bloc avec le contenu de la réunion GCC (thème 2027, règle de service, questions EDD, prochaines étapes, à confirmer). PNG vérifié.
- Signalé : en plus de la demande, les blocs ne sont plus coupés entre deux pages du PDF (`break-inside: avoid`). L'exemple musiciens est inchangé (PNG identique au pixel près).
- Tests : `npm test` → 5 tests OK.
- `mission-1-rendu` fusionnée dans `main` (tag `BeforeAnySignificantChange-MAJ01` posé sur `main` avant la fusion), puis push.

**Points d'attention**
- `tous-les-blocs` tient sur **2 pages** (1,34 page) : normal avec tous les blocs ; le PDF passe à la page 2 sans couper de bloc, mais la page 2 n'a pas de marge en haut.
- Date de l'exemple GCC : « Réunion 4/10 » (pas de date réelle connue, affichée telle quelle et listée dans « À confirmer »).
- Dans les étapes du bloc `objectif`, le gras `**…**` hérite du style du numéro (grand, couleur claire) : ne pas l'utiliser là pour l'instant ; à corriger dans une prochaine mission.
- Pour pousser vers GitHub : `gh` installé et connecté au compte `christellechen77400-art`.

**Ensuite** : Mission 2 (extraction de texte + résumé Claude → JSON).

## 10/11/2026 — Claude Code, Mission 1 (rendu PDF + PNG)
**Fait** (branche `mission-1-rendu`, pas encore fusionnée dans `main`)
- Projet Node.js + TypeScript : `npm install` (installe aussi Chromium pour Playwright).
- `npm run render -- exemples/musiciens.json` → `out/musiciens.pdf` (A4, 1 page, polices embarquées) + `out/musiciens.png` (1588 × 2246 px, ×2).
- `exemples/musiciens.json` : contenu de l'exemple musiciens au format SPEC §4.
- Modèle : `src/template.ts` (HTML/CSS), `src/categories.ts` (6 catégories), `src/icons.ts` (pictos), `src/types.ts` (format JSON).
- Polices Caladea et Carlito dans `fonts/` (licence OFL jointe), intégrées en base64 dans le HTML.
- Tests : `npm test` (4 tests : 6 catégories, dates, échappement, blocs vides) ; `npm run typecheck`.
- Comparaison avec `reference/exemple-cr-musiciens.png` : corps identique à la mise en page près (1 % de pixels différents, uniquement le lissage des lettres) ; seul le bandeau diffère, voir ci-dessous.

**À valider par Christelle**
- **Bandeau** : suit `docs/TEMPLATE.md` et `reference/bandeaux.png` (« Culte Franco · Louange », date sous le titre, pastille à droite) et non l'ancien bandeau de l'exemple musiciens (« Louange francophone · Réunions annuelles », « Compte-rendu · Novembre 2026 »). Il est 7 mm plus haut ; le contenu tient toujours sur une page.
- **Champs ajoutés au JSON de SPEC §4**, tous optionnels (détail dans `src/types.ts`) : `categorie`, `sous_titre` (fournis par le dossier Drive, pas par l'IA) ; `picto` sur les points et les cartes ; pour les blocs `sous_titre`, `texte`, `titre_etapes`, `picto` ; nouveau type de bloc `intertitre` (ex. « 2027 — Objectif, instruments et nouveautés »). À reporter dans SPEC §4 si validés.
- `date` accepte `AAAA-MM` (affiché « Novembre 2026 ») quand le jour n'est pas connu. Texte en gras avec `**…**`.
- Rendu des blocs absents des références (décisions, questions, prochaines étapes, « À confirmer ») : proposé par Claude Code, à valider sur un vrai compte-rendu.
- Pied de page : « GCC · Culte Franco · Réunion des musiciens » (règle de TEMPLATE.md) au lieu de « GCC · Louange francophone · … ».

**Problèmes / points d'attention**
- Carlito n'a pas de caractères chinois (ex. 高班) : sur Mac, une police système prend le relais ; sur Cloud Run (Mission 5), prévoir une police Noto Sans SC.
- Nom des fichiers produits : celui du JSON (`musiciens.pdf`) ; le nommage `AAAA-MM-JJ_<titre>` viendra avec Drive (Mission 4).
- Si le contenu dépasse une page, le script l'écrit dans la console et le PDF passe sur 2 pages.

**Ensuite** : fusion dans `main` après validation, puis Mission 2.

## 10/11/2026 — Claude (conversation cloud)
**Fait**
- Cadrage du projet : `CLAUDE.md`, `docs/SPEC.md`, `docs/TEMPLATE.md`, `docs/DECISIONS.md`.
- Exemples de comptes-rendus validés dans `reference/`.

**À faire ensuite (dans l'ordre)**
1. Valider l'interface GCCMeeting (artefact UI/UX, en cours avec Christelle).
2. Mission 1 — Claude Code : initialiser le projet (Node.js + TypeScript), et un script `npm run render -- exemple.json` qui génère PDF + PNG à partir d'un JSON, fidèle à `reference/`.
3. Mission 2 : extraction de texte (PDF, Google Doc, .txt) + résumé Claude → JSON.
4. Mission 3 : transcription audio (Groq).
5. Mission 4 : Drive (lecture des dossiers, rangement, déplacement) + mail.
6. Mission 5 : déploiement Cloud Run + Cloud Scheduler.
7. Mission 6 : interface GCCMeeting.

**Comptes à créer avant les missions 2 à 5** : Groq (gratuit), API Anthropic (quelques dollars), projet Google Cloud sur le compte GCC Franco.

**Points ouverts** : aucun bloquant.
