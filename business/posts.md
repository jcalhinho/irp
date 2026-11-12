# Posts prêts à publier — IRP Lecture

Adresse : https://irp-lecture.netlify.app · démo modèle local : /local · dépôt : https://github.com/jcalhinho/irp
Image à joindre : docs/screenshots/lecture-desktop.png (lecteur) ; pour la démo /local, une capture où le contrôle rejette la sortie d'un vrai modèle.
Moment conseillé : mardi à jeudi, 14 h – 16 h (heure de Paris). Répondre à tous les commentaires pendant 48 h.

Règles de ton (AGENTS.md) : ne PAS dire « rien de perdu », « sortie vérifiée », « sans erreur » ni « certifié ». Dire « contrôles heuristiques qui réduisent le risque, sans prouver le sens ». Corpus du banc d'essai synthétique ; FALC = aide automatique non certifiée ; l'ouverture par URL n'existe qu'en version locale (le site hébergé est statique).
Structure choisie : accroche = le lecteur utilisable tout de suite ; deuxième temps = la thèse « les modèles locaux feront du travail de front » avec la démo /local.

---

## 1. Show HN (anglais)

**Titre** (≤ 80 car.) :
Show HN: IRP Lecture – a no-account reader for web text, with optional on-device AI

**URL** : https://irp-lecture.netlify.app

**Premier commentaire (de l'auteur)** :
Hi HN. IRP Lecture is a local reader: paste a text, import a .txt/.md/.html file (or open a public page with the local version), pick a font, background, spacing or contrast profile, and read it without the site's layout. You can compare the extracted text with the reading version, copy it as Markdown, save a self-contained offline .html, or print only the reading view. No account, no API key, no AI required; settings stay in your browser, documents are not stored.

Second part, the thing I'm actually curious about: small models that run on the device (Gemini Nano in Chrome, Liquid AI's LFM2.5 via WebGPU) are getting good enough to rewrite text for a reader. Letting them touch content is risky, so IRP puts plain code around them: a model only receives and returns text (never HTML), and its output is rejected if it drops numbers, dates, amounts, emails or proper nouns, adds new ones, or flips negation/condition/modality/order markers. The UI says which model did the work.

There's a demo at /local that downloads LFM2.5-1.2B (~1 GB, cached) and runs it on your GPU (about 1 s per paragraph on my M-series Mac). On my sample the real model dropped a proper noun and invented a sentence; both were rejected and the rules-based version was shown instead.

Honest limits: these checks are heuristics, they do NOT prove the meaning is preserved or that extraction is complete; the benchmark is 20 synthetic French pages, not the real web; the plain-language mode is an automatic reading aid, not certified FALC; the hosted site is static, so direct URL opening needs the local Python server from the repo (MIT: https://github.com/jcalhinho/irp). What I'd most like: cases where the guard lets something wrong through.

---

## 2. Mastodon / Bluesky (français) — fil de 4 messages
Hashtags : #accessibilité #a11y #dyslexie #FALC #IA #WebGPU

1/ IRP Lecture : un lecteur local pour coller un texte ou importer un fichier, choisir police, fond, espacement, contraste, puis lire sans la mise en page du site. Sans compte, sans clé API, sans IA obligatoire.
https://irp-lecture.netlify.app 🧵

2/ On peut comparer le texte extrait et la version de lecture, copier en Markdown, garder une lecture .html hors ligne, ou n'imprimer que la lecture. Les réglages restent dans votre navigateur ; les documents ne sont pas conservés.

3/ Et l'IA ? Les petits modèles locaux (Gemini Nano dans Chrome, LFM2.5 en WebGPU) progressent vite. IRP les met sous contrôle : texte seulement, jamais de HTML, sortie rejetée si un chiffre, une date, un nom propre ou une négation change. Démo où le modèle tourne chez vous : https://irp-lecture.netlify.app/local

4/ Code ouvert (MIT) : https://github.com/jcalhinho/irp
Limites : les contrôles sont heuristiques et ne prouvent pas le sens ; banc d'essai sur corpus synthétique ; FALC = aide automatique non certifiée. Critiques bienvenues, surtout les cas que le contrôle laisse passer.

---

## 3. LinkedIn (français)

Un lecteur qui ne demande ni compte, ni clé API, ni IA.

IRP Lecture : vous collez un texte ou importez un fichier, vous choisissez police, fond, espacement, contraste, taille, et vous lisez sans la mise en page du site. Comparaison avec le texte extrait, export Markdown, lecture .html hors ligne, impression de la seule lecture. Réglages conservés dans votre navigateur ; documents non conservés.

La suite m'intéresse davantage : les modèles locaux (Gemini Nano dans Chrome, LFM2.5 de Liquid AI en WebGPU) vont reprendre une partie du travail de présentation. Pour les laisser reformuler sans risque, IRP les encadre : texte seulement, jamais de HTML, et rejet de toute sortie qui perd ou ajoute un chiffre, une date, un nom propre, ou qui modifie une négation ou une condition. L'interface indique quel modèle a travaillé.

→ Lecteur : https://irp-lecture.netlify.app
→ Démo (le modèle tourne chez vous, ~1 Go au premier chargement) : https://irp-lecture.netlify.app/local
→ Code (MIT) : https://github.com/jcalhinho/irp

Limites assumées : les contrôles sont heuristiques et ne prouvent pas le sens ; mes mesures portent sur un corpus synthétique ; le FALC est une aide automatique non certifiée. Je cherche vos critiques.

#accessibilité #IA #WebGPU

---

## 4. Reddit (anglais) — r/webdev (jeudi ou vendredi), r/accessibility, r/LocalLLaMA
Respecter les règles d'auto-promotion de chaque sous-forum. Titre pour r/LocalLLaMA :
I put a real LFM2.5-1.2B (WebGPU, in-browser) behind heuristic guards that reject outputs that drop or invent facts — here's what it got wrong

Corps : reprendre le premier commentaire Show HN, en insistant sur : modèle local, ~1 s sur Apple Silicon, exemples réels de rejet, limites (heuristique, corpus synthétique). Pour r/webdev / r/accessibility : commencer par le lecteur, mentionner l'IA locale en second. Lien de démo en commentaire si le sous-forum l'exige.

---

## 5. Réponses toutes prêtes
- « Pourquoi pas simplement un LLM ? » → Un modèle peut perdre ou inventer un montant ou une négation. Ici il ne reçoit et ne renvoie que du texte, des contrôles heuristiques rejettent les sorties suspectes, et c'est optionnel : le lecteur marche sans IA.
- « Ça prouve que le sens est conservé ? » → Non, et ce n'est pas annoncé : les contrôles réduisent le risque (nombres, dates, noms propres, marqueurs de négation/condition/modalité/ordre) mais ne prouvent ni le sens ni l'exhaustivité de l'extraction.
- « C'est un overlay d'accessibilité ? » → Non : aucune promesse de conformité RGAA/WCAG pour un site ; c'est une aide de lecture côté lecteur.
- « Ça marche avec LFM3 ? » → Le catalogue accepte un modèle ONNX lisible par transformers.js ; LFM3 sera ajouté quand une version ONNX existe (non vérifié aujourd'hui).
- « Mes données ? » → Texte et fichiers restent dans votre navigateur. La démo /local télécharge la bibliothèque (jsDelivr) et les poids (Hugging Face) ; votre texte n'est envoyé à aucun de ces services.
- « Pourquoi je ne peux pas coller une URL sur le site ? » → Le site hébergé est statique ; l'ouverture par URL demande le serveur local (`./start.sh`) ou l'extension.
