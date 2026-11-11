# Fiche Chrome Web Store — français

**Nom** (≤ 75 car.) : IRP Lecture — dyslexie, langage simplifié, basse vision

**Résumé** (≤ 132 car., champ « description courte ») :
Lisez n'importe quelle page en lecture adaptée : dyslexie, langage simplifié, basse vision. 100 % local, rien ne quitte votre appareil.

**Catégorie** : Accessibilité

**Langue** : français

## Description détaillée

IRP Lecture réaffiche la page que vous consultez dans un format plus facile à lire, d'un clic ou avec Alt+Maj+L.

**Pour qui ?**
Personnes dyslexiques, malvoyantes, fatiguées, qui lisent le français comme seconde langue, ou qui veulent simplement lire un texte administratif sans s'y perdre.

**Ce que ça fait**
• Profil Dyslexie : interligne et espacement larges, colonne étroite, fond doux.
• Profil Langage simplifié : phrases plus courtes, mots plus courants (aide de lecture automatique).
• Profil Basse vision : contraste maximal, texte très agrandi.
• Profil Lecture de nuit : fond sombre, contraste confortable.
• Réglage de la taille du texte, copie du contenu en Markdown.

**Rien n'est perdu**
Après chaque adaptation, l'extension vérifie que tous les nombres, dates, montants et noms de la page d'origine sont toujours affichés. Sinon, elle revient au texte d'origine et vous prévient.

**Respect de votre vie privée**
• Tout est traité dans votre navigateur : aucun serveur, aucun compte, aucune publicité, aucune statistique.
• Elle n'agit que quand vous le demandez (icône ou raccourci), uniquement sur l'onglet en cours.
• Le bouton « IA locale » utilise l'IA intégrée à Chrome si elle est disponible sur votre appareil ; sinon, des règles simples sont appliquées.

**Limites**
Le « langage simplifié » est une aide de lecture automatique, pas un FALC certifié. Les pages très dynamiques ou protégées (pages du navigateur, Web Store) ne peuvent pas être adaptées. Les images ne sont pas chargées : leur description (texte alternatif) est affichée.

Code libre (licence MIT).

## Justification de l'objectif unique (« single purpose »)

Afficher la page en cours dans un mode de lecture adapté (dyslexie, langage simplifié, basse vision, nuit).

## Justification des autorisations

| Autorisation | Pourquoi |
|---|---|
| `activeTab` | Lire le contenu de l'onglet actif uniquement au moment où l'utilisateur clique sur l'icône ou utilise le raccourci. Aucune permission d'hôte. |
| `scripting` | Injecter le script de lecture (`reader.js`) dans l'onglet actif après ce clic. Aucun script n'est injecté automatiquement. |
| `storage` | Mémoriser localement le profil choisi, la taille du texte et l'option de simplification. |

**Code distant** : non. Tout le code est dans le paquet de l'extension.
**Données collectées** : aucune. (Cocher « Je ne collecte pas de données utilisateur » ; certifier les 3 déclarations de conformité.)
**URL de la politique de confidentialité** : voir `store/PRIVACY.md` (à publier, par exemple sur `https://<votre-site>/privacy`).
