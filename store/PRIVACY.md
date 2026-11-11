# Politique de confidentialité — IRP Lecture

*Dernière mise à jour : 11 novembre 2026.*

## En résumé
L'extension **ne collecte, ne transmet et ne vend aucune donnée**. Elle fonctionne entièrement dans votre navigateur.

## Extension « IRP Lecture »
- **Ce qu'elle lit** : le texte et la structure de la page de l'onglet actif, **uniquement** quand vous cliquez sur l'icône ou utilisez le raccourci. Ce contenu est analysé sur votre appareil et n'est envoyé nulle part.
- **Ce qu'elle enregistre** : vos préférences d'affichage (profil, taille du texte, option de simplification), dans le stockage local de votre navigateur (`chrome.storage.local`). Elles ne quittent pas votre appareil et peuvent être effacées en désinstallant l'extension.
- **IA locale (optionnelle)** : si vous cliquez sur « IA locale » et que votre Chrome propose son IA intégrée, la reformulation est faite sur votre appareil par Chrome. L'extension n'appelle aucun service d'IA distant.
- **Réseau** : l'extension n'effectue aucune requête réseau. Elle n'inclut ni publicité, ni suivi, ni statistiques d'usage.
- **Presse-papiers** : écrit uniquement quand vous cliquez sur « Copier en Markdown ».

## Site web (irp-lecture.netlify.app) : outil de collage, démo « modèle local », widget
- **Hébergement** : site statique hébergé par Netlify. Comme tout hébergeur, Netlify peut conserver des journaux techniques (adresse IP, page demandée, date) selon sa propre politique. L'éditeur n'exploite aucun serveur applicatif et ne reçoit aucune donnée personnelle.
- **Outil « collez le contenu »** : le texte que vous collez est analysé dans votre navigateur. Il n'est envoyé à aucun serveur.
- **Démo « modèle local »** (`/local`) : le modèle s'exécute sur votre appareil. Au premier chargement, votre navigateur télécharge la bibliothèque d'inférence depuis jsDelivr (cdn.jsdelivr.net) et les poids du modèle depuis Hugging Face (huggingface.co) ; ces services voient votre adresse IP. Votre texte n'est envoyé à aucun de ces services. Le modèle est conservé dans le stockage de votre navigateur (vous pouvez l'effacer dans les réglages du navigateur).
- **Widget** (`widget.js`) : s'il est installé sur un site, il ne charge rien tant que vous ne cliquez pas, puis traite la page dans votre navigateur. Il enregistre vos préférences d'affichage dans `localStorage`.
- Aucun cookie, aucun traceur, aucune publicité.

## Vos droits (RGPD)
Pour toute question ou pour exercer vos droits d'accès, de rectification ou d'effacement des journaux techniques : **lamaprod93@gmail.com**. Vous pouvez aussi saisir la CNIL (cnil.fr).

## Éditeur
Jean-Christophe Alhinho, France. Hébergeur du site : Netlify, Inc., San Francisco (États-Unis).

## Modifications
Toute modification sera publiée sur cette page avec une nouvelle date.
