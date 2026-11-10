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
4. Le texte est envoyé à Claude (Haiku par défaut) avec le modèle de compte-rendu et le glossaire. Claude renvoie un JSON structuré (voir §4).
5. Le JSON remplit le modèle HTML (`docs/TEMPLATE.md`) → export **PDF A4 portrait** + **PNG** (pour iPhone / WhatsApp).
6. Les fichiers sont rangés dans `GCCMeeting/Comptes-rendus/<Catégorie>/` avec un nom `AAAA-MM-JJ_<titre>.pdf|png`.
7. Le fichier source est déplacé dans `GCCMeeting/Traités/<Catégorie>/` (on le garde, rien n'est supprimé).
8. Un **mail** est envoyé depuis le compte GCC Franco à Christelle avec le PNG et le lien du PDF.

La catégorie vient du **nom du sous-dossier** : personne n'a à choisir le bandeau.

## 2. Interface GCCMeeting (légère)
- Suivi des fichiers : en attente / en cours / terminé / erreur (avec le message d'erreur lisible).
- Historique des comptes-rendus par catégorie.
- Modèle : catégories (nom, couleur, picto, sous-titre), rubriques, aperçu en direct.
- Paramètres : dossiers Drive, modèle IA (Haiku / Sonnet), adresse mail de notification.
- Bouton « Régénérer » sur un compte-rendu.
Le détail des écrans sera fixé dans l'artefact UI/UX.

## 3. Technique (proposition)
- Application Node.js (TypeScript) hébergée sur **Google Cloud Run** (projet du compte GCC Franco), déclenchée par **Cloud Scheduler** toutes les 5 minutes.
- Accès Drive et Gmail via l'API Google (compte GCC Franco).
- Transcription : **Groq** (free tier ≈ 8 h d'audio / jour). Compresser l'audio (ffmpeg, mono, 16 kHz) si le fichier dépasse la limite de taille.
- Résumé : **API Anthropic**, modèle Claude Haiku par défaut, Sonnet en option.
- Rendu : HTML/CSS du modèle → PDF et PNG avec Playwright (Chromium).
- Aucun audio stocké côté application : téléchargement temporaire, puis suppression.
- Clés dans `.env` : `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, identifiants Google.

## 4. Format de sortie de l'IA (JSON)
```json
{
  "titre": "Réunion des musiciens",
  "date": "2026-11-09",
  "participants": ["Jonathan Z.", "Stéphane Z.", "Christelle C."],
  "a_retenir": [{"titre": "…", "detail": "…"}],
  "blocs": [
    {"type": "bilan|decisions|objectif|nouveautes|cartes|questions|prochaines_etapes",
     "titre": "…",
     "elements": [{"titre": "…", "texte": "…", "tags": ["…"], "qui": "…", "quand": "…"}]}
  ],
  "a_confirmer": ["…"]
}
```
Règles données à l'IA : 3 points maximum dans « À retenir », phrases courtes, ne rien inventer, écrire « à confirmer » si un nom, une date ou une décision est incertain, utiliser la liste des membres pour corriger l'orthographe des noms.

## 5. Glossaire GCC (à donner à l'IA)
- **GCC** : Grace Church. **Franco** : culte francophone. **Interfranco**, **Intergroupe** : rencontres communes.
- **EDD** : école du dimanche, classes 中班, 大班, 高班 (« Gao »).
- Groupes : **Paix**, **Fidélité**, **Bonté**. **Teams fixes** : groupes de louange fixes par trimestre.
- **MD** : directeur musical. **Régie** : son, PPT. **DA** : direction artistique. **Campus GCC** : campus de l'église.
- Noms : format « Prénom + initiale. » (ex. « David S. »). Liste des membres : onglet ORGANIGRAMME du Google Sheets « [2026 QG] Planning » (à brancher plus tard).

## 6. Hors périmètre pour l'instant
- Intégration au site GCC.
- Plusieurs langues (français uniquement).
- Gestion de plusieurs utilisateurs et droits.
