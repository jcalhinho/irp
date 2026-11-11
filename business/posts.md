# Posts prêts à publier — IRP

Adresse : https://irp-lecture.netlify.app · démo : /local · outil : /tool · dépôt : https://github.com/jcalhinho/irp
Image à joindre : capture de /local où le garde-fou rejette la sortie d'un vrai modèle (store/screenshots/ ou nouvelle capture).
Moment conseillé : mardi à jeudi, 14 h – 16 h (heure de Paris) = matin côte est des États-Unis. Répondre à tous les commentaires pendant 48 h.

Règles de ton : dire « rien de perdu », jamais « rien d'inventé » ni « certifié ». Dire que le corpus du banc d'essai est synthétique et que le FALC est une aide automatique non certifiée.

---

## 1. Show HN (anglais)

**Titre** (≤ 80 car.) :
Show HN: Small local LLMs adapt page text; deterministic code checks nothing was lost

**URL** : https://irp-lecture.netlify.app/local

**Premier commentaire (de l'auteur)** :
Hi HN. The idea: small models that run on the device (Gemini Nano in Chrome, Liquid AI's LFM2.5 via WebGPU) are getting good enough to do presentation work that front-ends do by hand — simplify, reformat, adapt to the reader. What's missing is a contract that makes it safe to let them.

IRP is that contract. The server publishes meaning (JSON components + a `must_show` list of facts that must survive), a local model rewrites the text for the reader, and plain code (a) rejects any output that loses a number, date, amount, email or proper noun, (b) rejects outputs that add new ones or too many new words, and (c) renders the result deterministically (no innerHTML, no model-generated HTML ever). The UI always says which model did the work.

The demo page downloads LFM2.5-1.2B (~1 GB, cached) and runs it on your GPU. On my M-series Mac it rewrites a paragraph in about a second. It also shows the interesting failure: on my sample, the real model dropped "Caisse des Écoles" and the guard rejected it and fell back to deterministic rules. That's the point.

Same document also gets served as compact Markdown for agents (HTML→Markdown: 7941 → 2851 tokens on my test set), and there's a one-line embeddable widget and a Chrome extension (reader mode with dyslexia / plain-language / low-vision profiles).

Honest limits: the benchmark corpus is 20 synthetic French pages, not the real web; the plain-language ("FALC") mode is an automatic reading aid, not certified; the additions check is a heuristic and will miss subtle inventions; the hosted site is static, so the paste box works, but URL fetching needs the Python server from the repo (https://github.com/jcalhinho/irp, MIT), which I haven't hosted. Feedback on the guard (what it misses) is what I'm after.

---

## 2. Mastodon / Bluesky (français) — fil de 4 messages
Hashtags : #accessibilité #a11y #dyslexie #FALC #IA #WebGPU

1/ Les petits modèles tournent déjà sur votre appareil (Gemini Nano dans Chrome, LFM2.5 de Liquid AI en WebGPU). Ils sauront bientôt faire le travail de présentation du front : simplifier, reformuler, adapter au lecteur.
Il manque un contrat pour les laisser faire sans risque. J'en ai fait un : IRP. 🧵

2/ Le serveur publie du sens. Un modèle local adapte le texte. Du code vérifie qu'aucun nombre, date, montant, e-mail ou nom propre n'est perdu ni inventé, puis affiche. L'interface dit toujours quel modèle a travaillé.

3/ Démo : un vrai LFM2.5 tourne dans votre navigateur, et vous voyez IRP accepter ou rejeter sa sortie en direct. Sur mon exemple, le modèle a oublié « Caisse des Écoles » : rejeté, version sûre affichée.
https://irp-lecture.netlify.app/local

4/ Code ouvert (MIT) : https://github.com/jcalhinho/irp
Une ligne pour l'installer sur un site : un bouton « Lecture adaptée » (dyslexie, langage simplifié, basse vision). Rien n'est chargé avant le clic, rien n'est envoyé.
Limites : FALC = aide automatique non certifiée ; banc d'essai sur corpus synthétique. Critiques bienvenues.

---

## 3. LinkedIn (français)

Et si les modèles locaux faisaient le travail du front ?

Gemini Nano est dans Chrome. LFM2.5 de Liquid AI tourne dans le navigateur en WebGPU. Ces petits modèles savent déjà simplifier et reformuler un texte pour un lecteur donné (dyslexie, langage simple, basse vision).

Le vrai problème : comment les laisser faire sans qu'ils perdent un montant ou une date limite ?

J'ai construit IRP, un contrat de confiance : le serveur publie du sens, un modèle local adapte le texte, et du code vérifie que rien n'est perdu (ni inventé) avant d'afficher. L'interface dit toujours quel modèle a travaillé.

→ Démo (le modèle tourne chez vous) : https://irp-lecture.netlify.app/local
→ Code (MIT) : https://github.com/jcalhinho/irp
→ Installation sur un site : une ligne de code.

Limites assumées : le FALC est une aide automatique non certifiée, mes mesures portent sur un corpus synthétique. Je cherche surtout vos critiques sur le garde-fou.

#accessibilité #IA #WebGPU #RGAA

---

## 4. Reddit (anglais) — r/webdev (jeudi ou vendredi), r/accessibility, r/LocalLLaMA
Respecter les règles de chaque sous-forum (auto-promotion). Titre pour r/LocalLLaMA :
I let a real LFM2.5-1.2B (WebGPU, in-browser) rewrite page text — and added a deterministic guard that rejects any output that loses or invents facts

Corps : reprendre le premier commentaire Show HN, en insistant sur : modèle local, ~1 s sur Apple Silicon, ce que le garde-fou rejette (exemple réel), limites. Poster le lien de démo en commentaire si le sous-forum l'exige.

---

## 5. Réponses toutes prêtes
- « Pourquoi pas simplement un LLM ? » → Parce qu'un modèle peut perdre ou inventer un montant ; ici une sortie qui perd un fait est rejetée, et aucun HTML ne vient du modèle.
- « C'est un overlay d'accessibilité ? » → Non : pas de promesse de conformité RGAA/WCAG pour un site ; c'est une aide de lecture côté lecteur, et un format pour publier du contenu structuré.
- « Ça marche sur LFM3 ? » → Le catalogue accepte tout modèle ONNX lisible par transformers.js ; LFM3 sera ajouté dès qu'une version ONNX existe (non vérifié aujourd'hui).
- « Données ? » → Tout se passe dans votre navigateur ; la démo télécharge la bibliothèque (jsDelivr) et les poids (Hugging Face), votre texte n'est envoyé nulle part.
