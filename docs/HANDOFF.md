# Journal de passation

À mettre à jour à la fin de chaque conversation (Claude ou Claude Code). Le plus récent en haut.

## 11/11/2026 — Claude Code, Mission 2 (suite 2) : flash par défaut, annuaire, essais
**Fait** (branche `mission-2-ia`, poussée, **pas fusionnée dans `main`**)
- **Modèle par défaut `deepseek-flash`** (choix de Christelle) : `src/cr.ts`, SPEC §1 et §3, DECISIONS. `deepseek-v4-pro` reste en option (`ANTHROPIC_MODEL`).
  - `.env.example` n'a pas pu être modifié par Claude Code (fichiers `.env*` bloqués) : il contient toujours « … ». Christelle doit relancer la commande `printf` (voir le message de fin de conversation).
- **Groupe « Coordination Franco »** : Jonathan Z., Stéphane Z., Christelle C. C'est le groupe de la réunion GCC du 4/10. Les autres groupes sont inchangés.
- **Annuaire** `config/annuaire.json` : les 54 personnes de l'organigramme (`[2026 QG] Planning - ORGANIGRAMME.pdf`, 2 pages).
  - Pas ajouté : « Isabelle » sans initiale (professeurs EDD), qui est peut-être Isabelle J. ; « Stéphane » (TEAM ÉVÉNEMENTIEL) compté comme Stéphane Z.
  - `npm run cr` signale un membre de groupe absent de l'annuaire, mais le garde. Un test vérifie que tous les groupes actuels sont dans l'annuaire.
  - La liste des membres de `src/prompt.md` (12 noms du 10/11) n'est pas reliée à l'annuaire : 5 de ses noms n'y sont pas (Cyliane D., Mina C., Claire L., Cyrick D., Valérie W.).
- **SPEC §2** : annuaire et groupes modifiables depuis l'interface, présents et absents corrigeables pour chaque réunion sans toucher au groupe.
- **Dossier `essais/`** : les PNG des quatre essais (`gcc-flash`, `gcc-v4-pro`, `musiciens-flash`, `musiciens-v4-pro`).
  - Les deux PNG GCC viennent des essais relancés aujourd'hui avec « Coordination Franco », sur les notes d'origine (sans ligne « Absents »).
  - Les deux PNG musiciens sont ceux du comparatif ci-dessous (11/11, même code).
- Tests : `npm test` → 21 tests OK ; `npm run typecheck` → sans erreur.

**Essai GCC 4/10 relancé avec « Coordination Franco »** (un essai par modèle, température 0,2)

| | GCC flash | GCC v4-pro |
|---|---|---|
| Jetons entrée / sortie | 3 533 / 1 235 | 3 544 / 1 048 |
| Présents / absents | 3 / 0 | 3 / 0 |
| Pages | **2** (1 777 px pour 1 123) | **2** (1 462 px pour 1 123) |
| Blocs | 9 | 7 |
| Question « nouveaux musiciens ? » avec les 6 noms | oui | oui |
| Groupe Bonté | oui, mais avec une phrase vide (« EDD avec le groupe Bonté ») | **non** |
| 高班, règle de service | oui | oui |
| Écarts | bilan vague (« Réunion de travail sur… ») ; noms de la prière répétés en étiquettes | Interfranco T1 (2027) mis dans le bilan ; « Mettre en place les teams fixes » ajouté aux étapes |

- Cette fois, aucun des deux ne tient sur une page, même à 80 %. Ce matin, `deepseek-flash` tenait sur une page (932 jetons en sortie) ; cet après-midi, il a écrit 1 235 jetons. La longueur varie d'un essai à l'autre.
- `deepseek-v4-pro` oublie de nouveau le groupe Bonté.

**À valider par Christelle**
- La liste de l'annuaire, en particulier « Isabelle » (EDD) et les 5 noms de la consigne absents de l'organigramme.
- Comment garantir une page pour la réunion GCC : limites plus strictes dans la consigne (ex. 6 blocs au plus), ou plus petit que 80 %.

## 11/11/2026 — Claude Code, Mission 2 (suite) : participants, une page, comparatif des modèles
**Fait** (branche `mission-2-ia`, poussée, **pas fusionnée dans `main`**)
- **Participants sans l'IA** (`src/participants.ts`, `config/groupes.json`) :
  - le groupe vient de `--groupe "<Groupe>"` ou du dossier du fichier (ex. `…/Culte Franco/Musiciens/notes.txt`) ;
  - tous les membres sont présents, sauf ceux de la ligne « Absents : … » (dans les 3 premières lignes des notes, ou au début d'une transcription) ;
  - un absent est reconnu par son prénom ou son nom complet, sans tenir compte des accents ; un nom non reconnu va dans « À confirmer » ;
  - bandeau : « Présents : … » (en gras), puis « Absents : … » ; sans groupe, rien.
- **Groupes**, remplis à la main d'après `[2026 QG] Planning - ORGANIGRAMME.pdf` (Téléchargements de Christelle, 11/11/2026 ; le PDF n'est pas copié dans le dépôt) :
  - « Comité Orga » = TEAM ORGA, coordination générale (9 personnes) ;
  - « Comité Franco » = COMITÉ FRANCO (7 personnes), ajouté parce que « Comité Orga » pouvait désigner l'un ou l'autre ;
  - « Musiciens » = instrumentistes de la TEAM LOUANGE : pianistes, guitaristes, batteurs (10 personnes, dont Maëlice D. « en essai »).
- **Remplacements fixes** après l'IA (`src/remplacements.json`, mots entiers) : « Gao » → « 高班 », « Davidson » → « David S. ».
- **Contrôles** (`src/postprocess.ts`), signalés dans la console : mois sans année (avec l'année probable d'après la date de réunion), plus de 4 éléments par bloc, plus de 25 mots par texte, plus de 3 points « À retenir ».
- **Une page** (`src/render.ts`, `.fit` dans `src/template.ts`) : si le compte-rendu dépasse, le contenu sous le bandeau est réduit par pas de 2,5 %, jusqu'à 80 % au plus.
  - À 80 %, le texte des cartes est à 7,7 pt ; les petites capitales et étiquettes ne descendent pas sous 6 pt.
  - Au-delà, le compte-rendu reste sur 2 pages à taille normale.
  - Les marges latérales sont compensées pour rester alignées avec le bandeau.
  - L'exemple musiciens de la mission 1 est inchangé au pixel près.
- **Consigne** : limites strictes (3 / 4 / 25 mots), année toujours écrite avec un mois ; tout ce qui concernait les participants est retiré.
- **Température 0,2.** Elle n'existe plus dans l'API Anthropic ni dans le SDK, mais DeepSeek la lit bien : 5 est refusé (« valid range [0, 2] »), 0,2 est accepté.
- Tests : `npm test` → 20 tests OK ; `npm run typecheck` → sans erreur.

**Comparatif `deepseek-flash` / `deepseek-v4-pro`** (11/11/2026, un essai par cas, température 0,2)
- GCC : `--groupe "Comité Orga"`, avec la ligne « Absents : Paul, Karémy, Charlie, Lorenzo, Éloïse, Daniela » ajoutée en tête d'une copie des notes.
- Musiciens : `--groupe Musiciens`, sans absents.

| | GCC flash | GCC v4-pro | Musiciens flash | Musiciens v4-pro |
|---|---|---|---|---|
| Jetons entrée / sortie | 3 533 / 932 | 3 544 / 1 080 | 4 068 / 957 | 4 079 / 1 110 |
| Durée | 9 s | 13 s | 8 s | 14 s |
| JSON valide du premier coup | oui | oui | oui | oui |
| Pages | **1 (82,5 %)** | 2 | **1 (82,5 %)** | 2 |
| Blocs | 6 | 9 | 6 | 7 |
| Présents / absents | 3 / 6 | 3 / 6 | 10 / 0 | 10 / 0 |
| Question « nouveaux musiciens ? » gardée en question | oui, avec les 6 noms | oui, mais **sans les noms** (mélangée avec l'âge minimum) | — | — |
| Groupe Bonté | oui | **non** | — | — |
| 高班 | oui | oui | — | — |
| Règle de service juste | oui | oui | — | — |
| Objectifs par instrument hors du bilan | — | — | oui | **non** (aussi dans le bilan) |
| Nouveautés dans l'ordre demandé | — | — | oui | oui |
| « À retenir » conforme | — | — | oui | oui |
| Mois sans année signalés | 0 | 0 | 0 | 1 (« décembre ») |

- Sur ces essais, `deepseek-flash` fait mieux que `v4-pro` : plus court (donc 1 page), plus fidèle, et environ 1,5 fois plus rapide.
- Les essais du 10/11 (sans température basse ni les nouvelles règles) donnaient l'avantage à `v4-pro`.
- Avec un seul essai par cas, la différence n'est pas sûre : à confirmer sur d'autres notes avant de changer le modèle par défaut.

**À valider par Christelle**
- La composition des groupes, en particulier le sens de « Comité Orga ».
- Le minimum de 80 % : est-ce lisible sur papier ?
- Le modèle par défaut : `deepseek-v4-pro` (choix du 11/11) ou retour à `deepseek-flash` d'après ce comparatif.

## 10/11/2026 — Claude Code, Mission 2 (notes → compte-rendu avec l'IA)
**Fait** (branche `mission-2-ia`, poussée, **pas fusionnée dans `main`**)
- `npm run cr -- <fichier> --categorie "<Catégorie>"` :
  1. lit un .txt, .md, .pdf ou .docx (`src/extract.ts`) ;
  2. envoie le texte à l'IA (`src/cr.ts`) ;
  3. valide le JSON, l'enregistre dans `out/<nom>.json`, puis lance le rendu de la mission 1.
- **IA : DeepSeek** à la place de Claude (choix de Christelle, voir `docs/DECISIONS.md`) :
  - SDK officiel `@anthropic-ai/sdk`, pointé vers l'API compatible Anthropic de DeepSeek ;
  - `.env` : `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`, `ANTHROPIC_API_KEY` (clé DeepSeek), `ANTHROPIC_MODEL` ;
  - modèle `deepseek-v4-pro` par défaut (choix de Christelle le 11/11/2026), `deepseek-flash` en option.
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

**Essais réels (11/11/2026, `deepseek-flash`)**
- Les deux commandes marchent : JSON valide du premier coup, PDF + PNG produits.
  - `npm run cr -- exemples/notes/reunion-gcc.txt --categorie GCC`
  - `npm run cr -- exemples/notes/reunion-musiciens.txt --categorie "Culte Franco"`
- Vérifié chez DeepSeek :
  - `deepseek-flash` et `deepseek-v4-pro` sont acceptés ;
  - `thinking: disabled` est accepté ;
  - l'outil sans `type` est accepté.
- Les deux comptes-rendus tiennent sur **2 pages** (1525 px et 1355 px pour 1123), alors que les références en font 1.

Écarts de contenu avec `reference/exemple-cr-gcc.png` :
- **Erreurs** :
  - « Nouveaux musiciens à mettre EDD ? » devient une **décision** (« à intégrer à l'EDD »), alors que c'est une question ouverte.
  - Le groupe **Bonté** est oublié.
  - « EDD GAO » reste « EDD Gao » au lieu de « EDD 高班 », pourtant donné dans le glossaire.
  - La règle « Franco : baptisé / reste du service : pas d'âge minimum » est présentée comme une « Règle EDD ». La référence en fait une « Règle de service 2027 ».
- **Choix différents** :
  - Titre : « Thème 2027 et organisation du franco » au lieu de « Décisions de la réunion ».
  - Date : « 4 octobre 2026 » déduit de « Réunion 4/10 », signalé dans « À confirmer ». La référence garde « Réunion 4/10 ».
  - La sortie a un bloc « À retenir » (3 points), la référence n'en a pas.
  - Accompagnement découpé en 4 cartes au lieu de 2.
  - « Louange : entre nous puis diffusion » au lieu de « partage à l'église ».
  - Teams fixes : dans « À confirmer » au lieu du pied de page.
- **Forme** :
  - Trop de gras : souvent plus de 2 groupes de mots par phrase, malgré la consigne.
  - Des étiquettes inutiles sur chaque carte (« EDD », « campus »…).

Écarts de contenu avec `reference/exemple-cr-musiciens.png` :
- **Erreurs** :
  - Participants : « Christelle C. » est **inventée**, à cause de la ligne « Corrections apportées par Christelle ». Elle contredit en plus « Liste des participants présents » dans « À confirmer ».
  - Les objectifs par instrument (batterie, guitare, piano) sont rangés dans le **Bilan**. La référence en fait le bloc « Objectifs par instrument » de 2027.
  - « Cette année, groupes fixes entre musiciens » est absent du bilan.
- **Choix différents** :
  - La sortie ajoute un bloc « Prochaines étapes » (4 lignes, dont l'arrivée de David S. qui répète « Nouveautés »).
  - « À confirmer » a 3 points, la référence n'en a aucun.
  - « Équiper tous les pianistes d'un Mac » est une interprétation : les notes disent « équiper tout le monde ».
- **Conforme** :
  - « À retenir » : les 3 bons points.
  - Objectif commun et ses 3 étapes.
  - Nouveautés dans l'ordre demandé.
  - « Davidson » corrigé en David S.
  - Date « Novembre 2026 ».
- **Petits écarts** : « fin décembre » et « mars » sans l'année (la référence dit 2026 et 2027), titre « Réunion annuelle des musiciens ».

Même notes GCC avec `deepseek-v4-pro` (essai rapide) :
- Mieux : la question des nouveaux musiciens reste une question, et 高班 est utilisé.
- Toujours : Bonté oublié, et la règle est présentée comme « Règle 2027 musiciens ».
- 2 852 jetons en entrée, 1 188 en sortie.

**Points d'attention**
- **`.env.example` est cassé dans le commit `236deb1`** : il ne contient plus que « … » (aucune clé dedans). Christelle doit relancer la commande `printf` complète, puis commiter le fichier.
- DeepSeek remplace la décision « pas de modèle chinois (données de l'église) » : les notes de réunion, avec les noms des membres, partent chez DeepSeek.
- La liste de membres est donnée à l'IA : les essais sur ces deux réunions sont un peu plus faciles que la réalité.
- `categorie` et `sous_titre` ne sont pas demandés à l'IA : ils viennent de la commande (plus tard, du dossier Drive).
- Les fichiers `out/` ne sont pas commités.

**Ajustements après les essais (11/11/2026, `deepseek-v4-pro`)**
- Changements dans `src/prompt.md`, contre les erreurs relevées :
  - une question reste une question, même suivie d'une liste de noms ;
  - ne rien oublier (noms de groupe dans les titres des notes) ;
  - ne rien préciser ni élargir ;
  - les lignes de correction ne font pas de leur auteur un participant ;
  - une personne seulement mentionnée n'est pas un participant ;
  - gras plus limité ;
  - les objectifs ne vont jamais dans le bilan ;
  - pas de répétition dans « Prochaines étapes » ;
  - `tags` et « À confirmer » limités ;
  - glossaire : « Gao » s'écrit toujours 高班, et la notion de règle de service est ajoutée.
- `src/schema.ts` refuse :
  - un bloc de cartes sans `elements` : le modèle mettait parfois le contenu dans `texte`, que la page n'affiche pas, et le contenu disparaissait ;
  - une réponse sans aucun bloc de contenu (vu 2 fois : réponse coupée après un intertitre).

  Dans les deux cas, le nouvel essai automatique renvoie l'erreur au modèle. Ce mécanisme a servi une fois pendant les essais, avec succès.
- Mesuré sur 4 essais GCC avec la consigne finale (3 essais d'atelier et 1 essai officiel) :

  | Point | Résultat |
  |---|---|
  | Question gardée en question | 4/4 |
  | Règle de service juste | 4/4 |
  | Bonté présent | 3/4 |
  | 高班 au lieu de « Gao » | 3/4 |

- Musiciens, essai officiel : même structure que la référence (bilan, 2027, objectif, objectifs par instrument, nouveautés). Pas de participant inventé, « À retenir » conforme.
- **Restent** :
  - Les deux comptes-rendus font **2 pages** (1490 et 1457 px pour 1123). La référence GCC tient sur 1 page parce qu'elle regroupe beaucoup plus.
  - Dans l'essai officiel GCC, Delphine Z. est ajoutée aux participants alors qu'elle n'est que citée, et « EDD Gao » n'est pas converti.
  - Dans l'essai officiel musiciens, les étapes de l'atelier sont dans une carte à part au lieu du bloc objectif, et le MD est répété.
  - L'année n'est jamais ajoutée aux mois (« mars » au lieu de « mars 2027 »).
  - Les réponses varient d'un essai à l'autre : il faut relire chaque compte-rendu.
- Risque de surapprentissage : la consigne a été ajustée sur ces deux réunions. À vérifier sur de nouvelles notes.
- **Christelle doit modifier `.env`** (`ANTHROPIC_MODEL=deepseek-v4-pro`), sinon `deepseek-flash` reste utilisé. `.env.example` est aussi à refaire (voir plus haut).

**Ensuite** :
1. Essayer sur de nouvelles notes.
2. Décider si 2 pages sont acceptables, ou s'il faut resserrer le modèle de page ou la consigne.
3. Valider la mission 2 avant de fusionner.

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
