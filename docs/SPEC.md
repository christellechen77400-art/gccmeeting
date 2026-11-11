# GCCMeeting — spécification

Statut : version 0.1 (10/11/2026). Interface (UI/UX) en cours de validation dans un artefact séparé.

## 1. Fonctionnement attendu (100 % automatique)

1. Christelle (ou un référent) dépose un fichier dans un sous-dossier Drive du compte GCC Franco :
   `GCCMeeting/À traiter/<Catégorie>/`
   avec `<Catégorie>` = `GCC`, `Culte Franco`, `EDD`, `DA`, `Campus GCC`, `Autre`.
2. Toutes les quelques minutes, GCCMeeting repère les nouveaux fichiers.
3. Selon le type de fichier :
   - **audio** (m4a, mp3, wav…) → transcription (Groq, Whisper large-v3 turbo, français) ;
   - **PDF**, **Google Doc**, **.txt** → extraction du texte.
4. Le texte est envoyé à l'IA (DeepSeek, `deepseek-flash` par défaut) avec le modèle de compte-rendu et le glossaire. L'IA renvoie un JSON structuré (voir §4).
5. Le JSON remplit le modèle HTML (`docs/TEMPLATE.md`) → export **PDF A4 portrait** + **PNG** (pour iPhone / WhatsApp).
6. Les fichiers sont rangés dans `GCCMeeting/Comptes-rendus/<Catégorie>/` avec un nom `AAAA-MM-JJ_<titre>.pdf|png`.
7. Le fichier source est déplacé dans `GCCMeeting/Traités/<Catégorie>/` (on le garde, rien n'est supprimé).
8. Un **mail** est envoyé depuis le compte GCC Franco à Christelle avec le PNG et le lien du PDF.

La catégorie vient du **nom du sous-dossier** : personne n'a à choisir le bandeau.

## 2. Interface GCCMeeting (légère)
- Suivi des fichiers : en attente / en cours / terminé / erreur (avec le message d'erreur lisible).
- Historique des comptes-rendus par catégorie.
- Modèle : catégories (nom, couleur, picto, sous-titre), rubriques, aperçu en direct.
- Paramètres : dossiers Drive, modèle IA (`deepseek-flash` / `deepseek-v4-pro`), adresse mail de notification.
- Bouton « Régénérer » sur un compte-rendu.
- **Annuaire** modifiable : ajouter, retirer, renommer une personne (format « Prénom I. »).
- **Groupes** modifiables : créer, renommer, supprimer un groupe ; ajouter ou retirer des membres, choisis dans l'annuaire ou tapés à la main (un nom hors de l'annuaire est signalé mais accepté).
- **Présents et absents** corrigeables pour chaque réunion, sans modifier le groupe.
- Rien de figé : annuaire, groupes et présences se changent depuis l'interface, sans toucher au code.
Le détail des écrans sera fixé dans l'artefact UI/UX.

## 3. Technique (proposition)
- Application Node.js (TypeScript) hébergée sur **Google Cloud Run** (projet du compte GCC Franco), déclenchée par **Cloud Scheduler** toutes les 5 minutes.
- Accès Drive et Gmail via l'API Google (compte GCC Franco).
- Transcription : **Groq** (free tier ≈ 8 h d'audio / jour). Compresser l'audio (ffmpeg, mono, 16 kHz) si le fichier dépasse la limite de taille.
- Résumé : **DeepSeek**, par son API compatible Anthropic (SDK officiel `@anthropic-ai/sdk`, adresse dans `ANTHROPIC_BASE_URL`). Modèle `deepseek-flash` par défaut (plus fidèle et plus court que `deepseek-v4-pro` lors du comparatif du 11/11/2026, température 0,2), `deepseek-v4-pro` en option. DeepSeek ne gère pas la sortie structurée : l'IA répond en appelant un outil forcé `enregistrer_compte_rendu` (format §4), sans mode réflexion ; le JSON est validé, avec un seul nouvel essai en cas d'erreur.
- Rendu : HTML/CSS du modèle → PDF et PNG avec Playwright (Chromium).
- Aucun audio stocké côté application : téléchargement temporaire, puis suppression.
- Clés dans `.env` : `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY` (clé DeepSeek), `ANTHROPIC_MODEL`, `GROQ_API_KEY`, identifiants Google.

## 4. Format de sortie de l'IA (JSON)
```json
{
  "titre": "Réunion des musiciens",
  "date": "2026-11-09",
  "categorie": "Culte Franco",
  "sous_titre": "Louange",
  "participants": ["Jonathan Z.", "Stéphane Z.", "Christelle C."],
  "a_retenir": [{"titre": "…", "detail": "…", "picto": "users"}],
  "blocs": [
    {"type": "bilan|decisions|objectif|nouveautes|cartes|questions|prochaines_etapes|intertitre",
     "titre": "…",
     "picto": "…",
     "sous_titre": "…",
     "texte": "…",
     "titre_etapes": "…",
     "elements": [{"titre": "…", "texte": "…", "tags": ["…"], "qui": "…", "quand": "…", "picto": "…"}]}
  ],
  "a_confirmer": ["…"]
}
```
Champs ajoutés pour la mise en page (validés le 10/11/2026), tous optionnels :
- `categorie` : `GCC`, `Culte Franco`, `EDD`, `DA`, `Campus GCC` ou `Autre` (par défaut `Autre`). Rempli par l'application d'après le sous-dossier Drive, pas par l'IA.
- `sous_titre` (racine) : sous-titre de la catégorie dans le bandeau ; sinon celui par défaut (`docs/TEMPLATE.md`).
- `participants` et `absents` (ajout du 11/11/2026) : remplis par l'application, **pas par l'IA**.
  - Les membres du groupe viennent de `config/groupes.json` ; le groupe vient du sous-dossier (ex. `Culte Franco/Musiciens`) ou de l'option `--groupe`.
  - Tous les membres sont présents par défaut. Une ligne « Absents : … » en tête des notes, ou une phrase « absents : … » au début d'une transcription, les retire.
  - Bandeau : « Présents : … » (en gras) et « Absents : … ». Sans groupe : ni présents ni absents.
- `picto` : nom d'un picto de `src/icons.ts` (sur un point « À retenir », un bloc ou un élément) ; sinon le picto par défaut du bloc.
- `date` : `AAAA-MM-JJ`, ou `AAAA-MM` si le jour n'est pas connu (affiché « Novembre 2026 »).
- Bloc `objectif` : `sous_titre` (petit texte au-dessus du titre), `texte` (paragraphe), `titre_etapes` (titre des étapes numérotées) ; les `elements` sont les étapes.
- Bloc `intertitre` : séparateur de partie, `titre` en grand (ex. « 2027 ») et `sous_titre` à côté ; pas d'éléments.
- Dans les textes, `**…**` met en gras.
- Après la réponse de l'IA, les remplacements de `src/remplacements.json` s'appliquent aux mots entiers (ex. « Gao » → « 高班 », « Davidson » → « David S. »).
- Une page : au plus 3 points « À retenir », 4 éléments par bloc et 25 mots par texte (demandés à l'IA, signalés dans la console s'ils sont dépassés). Si le compte-rendu dépasse une page, le contenu sous le bandeau est réduit par pas de 2,5 %, jusqu'à 80 % au plus. Si ça dépasse encore, le JSON est renvoyé une seule fois au modèle (« trop long de X %, raccourcis les textes sans supprimer aucun sujet »), puis rendu de nouveau ; s'il dépasse toujours, le PDF est sur 2 pages à taille normale. On ne limite pas le nombre de blocs et on ne descend pas sous 80 %. Le PNG est toujours une seule image en hauteur, sans coupure de page.

Règles données à l'IA : 3 points maximum dans « À retenir », phrases courtes, ne rien inventer, écrire « à confirmer » si un nom, une date ou une décision est incertain, utiliser la liste des membres pour corriger l'orthographe des noms.

## 5. Glossaire GCC (à donner à l'IA)
- **GCC** : Grace Church. **Franco** : culte francophone. **Interfranco**, **Intergroupe** : rencontres communes.
- **EDD** : école du dimanche, classes 中班, 大班, 高班 (« Gao »).
- Groupes : **Paix**, **Fidélité**, **Bonté**. **Teams fixes** : groupes de louange fixes par trimestre.
- **MD** : directeur musical. **Régie** : son, PPT. **DA** : direction artistique. **Campus GCC** : campus de l'église.
- Noms : format « Prénom + initiale. » (ex. « David S. »). Liste des membres : onglet ORGANIGRAMME du Google Sheets « [2026 QG] Planning ». Les groupes de `config/groupes.json` ont été remplis à la main d'après l'export PDF du 11/11/2026 (lecture automatique à brancher plus tard).

## 6. Hors périmètre pour l'instant
- Intégration au site GCC.
- Plusieurs langues (français uniquement).
- Gestion de plusieurs utilisateurs et droits.
