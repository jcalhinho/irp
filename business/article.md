# Ce que l'IA perd quand elle simplifie un texte — et comment le prouver

*Brouillon d'article. Les chiffres viennent de `bench/REPORT.md` (reproductible : `node bench/run.mjs`).*

Vous avez déjà demandé à un assistant de « rendre ce texte plus simple » ? Le résultat est souvent plus lisible. Mais l'avez-vous relu **chiffre par chiffre** ?

Une reformulation peut arrondir un montant, déplacer une date, oublier une condition ou changer le nom d'un service. Sur un article de blog, c'est gênant. Sur une page de démarches (« déposez votre dossier avant le 15 mars 2027, timbre fiscal de 25 € »), c'est une erreur qui coûte de l'argent à quelqu'un. Et les personnes qui ont le plus besoin de textes simplifiés — dyslexie, handicap cognitif, français langue seconde — sont celles qui ont le moins de moyens de repérer l'erreur.

## Le problème n'est pas l'IA, c'est l'absence de contrat

Aujourd'hui, quand un outil simplifie un texte, personne ne vérifie rien. On fait confiance.

J'ai construit IRP en partant d'une règle inverse : **l'IA n'a pas le dernier mot**. Le texte d'origine contient des éléments qui ne doivent jamais disparaître — nombres, dates, montants, adresses e-mail, URL, noms propres. Après chaque adaptation, un test automatique vérifie que chacun d'eux est toujours là. S'il en manque un, la reformulation est rejetée et on affiche le texte d'origine, en le disant.

C'est volontairement simple (une comparaison de chaînes normalisées : espaces insécables, casse, séparateurs). Ce qui compte, c'est que ce soit **systématique** et **visible** : l'utilisateur voit « ✔ Nombres, dates et noms conservés », ou un avertissement.

## Deux autres choix de conception

**1. Aucun HTML produit par un modèle.** La page est décrite par des composants (titres, listes, tableaux, faits, boutons) et affichée par du code déterministe. Pas de faille XSS venue d'une sortie de modèle, un rendu identique à chaque visite, et une accessibilité (titres, repères, tableaux) garantie par le code plutôt que « au mieux ».

**2. Les règles d'abord, l'IA ensuite.** Une couche de règles françaises (vocabulaire courant, phrases coupées, « afin de » → « pour ») fait déjà une partie du travail, de façon reproductible. Une IA locale, si on l'active, ne peut que reformuler du texte, et passe par le même contrôle.

## Ce que j'ai mesuré

Sur un corpus de 20 pages françaises (menus, bannières de cookies, images sans description, tableaux de mise en page, phrases administratives de 40 mots) :

- **Faits conservés** : 100 % des faits critiques (prix, dates, numéros) se retrouvent après extraction, rendu et simplification.
- **Lisibilité** : indice de Kandel-Moles 61.4 → 65.2 ; 19.3 → 15.9 mots par phrase.
- **Accessibilité** : 166 violations axe-core sur les pages d'origine, 0 sur la page rendue. (C'est vrai par construction : c'est mon rendu, pas une correction de la page source.)
- **Pour un agent IA** : 7941 tokens en HTML contre 2851 en Markdown (÷2.8).
- **Garde-fou** : j'ai simulé un « adaptateur hostile » qui, une fois sur deux, remplace les nombres par « plusieurs ». Sur 58 paragraphes, 20 auraient perdu un fait ; le contrôle en a bloqué **20** et en a laissé passer **0**.

## Ce que ça ne prouve pas

Je tiens à être clair, parce que c'est le point de l'article :

- L'adaptateur hostile est **simulé**. Je ne prétends pas mesurer le taux d'erreur d'un vrai modèle : je mesure que le contrôle attrape ce qu'il est censé attraper.
- Le corpus est **synthétique**. Les pages réelles sont plus sales, et l'extraction fera moins bien.
- Le contrôle détecte les éléments perdus, **pas** un sens déformé avec les mêmes chiffres (« avant » devenu « après »). C'est une limite réelle : le contrôle réduit le risque, il ne le supprime pas.
- Ce n'est **pas un FALC certifié** : un vrai FALC se valide avec des personnes concernées. C'est une aide de lecture.
- axe-core sous jsdom ne mesure pas les contrastes ; ceux des thèmes sont vérifiés par calcul séparément.

## L'idée à retenir

Pour tout système qui reformule du contenu important, **demandez la preuve, pas la promesse** : une liste de ce qui doit être conservé, un test qui la vérifie à chaque fois, un repli sûr quand il échoue, et un affichage honnête du résultat. Ça ne coûte presque rien et ça change la nature de la confiance.

## Essayer

- Extension Chrome « IRP Lecture » (lecture adaptée sur n'importe quelle page, 100 % locale).
- Outil en ligne : collez une adresse, voyez la page adaptée, le Markdown pour agents et le contrôle « rien de perdu ».
- Code, tests et benchmark : dépôt GitHub (licence MIT).

*Remarque pour la publication : ajouter les liens réels, une capture avant/après (`store/screenshots/`) et, idéalement, les résultats sur 20 pages réelles de votre choix (voir `bench/README.md`).*
