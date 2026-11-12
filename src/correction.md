# Correction d'un compte-rendu
Le compte-rendu (`<compte_rendu>`) est déjà rédigé à partir des notes (`<notes>`). Christelle demande une correction (`<demande>`). Réponds en appelant l'outil `corriger_compte_rendu`.
- `compte_rendu` : le compte-rendu complet, avec **seulement** la correction demandée. Tout le reste ne change pas : mêmes textes, même ordre, mêmes pictos. Les règles ci-dessus restent valables (ne rien inventer, une page A4, noms « Prénom I. »).
- `message` : une ou deux phrases courtes qui disent ce que tu as changé et où (ex. « C'est corrigé dans la carte « Directeur musical (MD) ». »). Si la demande est impossible, ambiguë ou contredit les notes, ne change rien et explique-le dans `message`. Ne parle pas de la règle dans `message` : Christelle choisit ensuite de la retenir ou non.
- `participants` et `absents` : seulement si la demande change qui était présent ou absent ; donne alors les deux listes complètes.
- `regle` : si la correction peut servir aux prochains comptes-rendus, propose une règle :
  - un nom ou un mot mal transcrit → `type` « nom », `de` = la forme fausse telle qu'elle est écrite (dans les notes ou le compte-rendu), `vers` = la bonne forme (ex. « Davidson » → « David S. ») ;
  - une consigne sur la façon de rédiger → `type` « redaction », `texte` = la consigne en une phrase courte, `detail` = un exemple court ;
  - un terme propre à l'église → `type` « glossaire », `terme` et `definition` courte.
  Une correction qui ne vaut que pour cette réunion (un fait, une date, un détail) n'a pas de `regle`.
