/**
 * Génère un corpus de 20 pages HTML « réalistes et imparfaites » (français) + manifest.json
 * (vérité terrain `must_show` : les faits qu'un lecteur ne doit JAMAIS perdre).
 * Le corpus est synthétique mais reproduit les défauts courants : bruit (menus, cookies, pubs),
 * images sans alt, titres qui sautent de niveau, tableaux de mise en page, liens « cliquez ici »,
 * absence de lang, phrases administratives très longues.
 *   node make-fixtures.mjs          → écrit bench/pages/*.html et bench/manifest.json
 * Pour mesurer des pages réelles : voir README.md (--dir).
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = path.join(here, 'pages');
fs.mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const PAGES = [
  // ── Mairies / administration ─────────────────────────────────────────────
  { id: 'mairie-cni', kind: 'admin', layout: 'semantic', title: "Carte nationale d'identité", must: ['25 €', '15 mars 2027', '3 semaines', '04 72 10 30 30'],
    paras: ["Afin de bénéficier d'une carte nationale d'identité, le demandeur doit s'acquitter d'un timbre fiscal de 25 € auprès du service concerné, mais il convient de procéder au dépôt des pièces justificatives avant le 15 mars 2027, car le dossier sera sinon classé sans suite.",
      "Le délai de fabrication est d'environ 3 semaines à compter du dépôt complet du dossier, toutefois il peut être allongé durant les périodes de forte affluence.",
      "Pour toute question, vous pouvez joindre le service au 04 72 10 30 30 du lundi au vendredi."], list: ['Ancienne carte ou déclaration de perte', 'Photo d’identité récente', 'Justificatif de domicile de moins de 6 mois'], table: [['Lundi', '9h-12h'], ['Mercredi', '14h-17h']] },
  { id: 'mairie-cantine', kind: 'admin', layout: 'divsoup', title: 'Inscription à la cantine scolaire', must: ['4,20 €', '30 juin 2027', 'cantine@ville-test.fr'],
    paras: ["L'inscription à la restauration scolaire s'effectue ultérieurement à la validation du dossier famille, lorsque l'ensemble des pièces a été transmis au service enfance, et le tarif applicable est calculé au titre du quotient familial.",
      "Le tarif maximal est fixé à 4,20 € par repas pour l'année scolaire en cours, et les demandes doivent parvenir avant le 30 juin 2027 sans exception.",
      "En cas de difficulté, écrivez à cantine@ville-test.fr en précisant le nom de l'enfant."], list: ['Livret de famille', 'Avis d’imposition', 'Attestation de la caisse d’allocations'] },
  { id: 'mairie-urbanisme', kind: 'admin', layout: 'tablelayout', title: "Permis de construire : démarches", must: ['2 mois', '15 jours', 'Service urbanisme'],
    paras: ["Le dossier de permis de construire est déposé en mairie, et l'instruction dure 2 mois à compter de la réception d'un dossier complet, sauf si l'avis d'un architecte des bâtiments de France est requis auquel cas ce délai est prolongé.",
      "Après affichage sur le terrain, les tiers disposent de 15 jours pour contester la décision, et le bénéficiaire doit s'assurer que le panneau demeure visible durant toute la durée des travaux.",
      "Contact : Service urbanisme, bureau 12."], list: ['Formulaire Cerfa signé', 'Plan de situation', 'Plan de masse'] },
  { id: 'mairie-etatcivil', kind: 'admin', layout: 'semantic', title: "Acte de naissance : comment l'obtenir", must: ['gratuit', '48 heures', 'état civil'],
    paras: ["La copie intégrale d'un acte de naissance est gratuite et peut être sollicitée en ligne, par courrier ou au guichet de l'état civil, mais le demandeur doit être en mesure de justifier de son identité.",
      "La délivrance intervient sous 48 heures lorsque la demande est complète, cependant un délai supplémentaire est possible pour les actes antérieurs à 1950."], list: ['Nom et prénoms', 'Date et lieu de naissance', 'Noms des parents'] },
  // ── E-commerce ───────────────────────────────────────────────────────────
  { id: 'shop-casque', kind: 'shop', layout: 'divsoup', title: 'Casque audio sans fil Aria', must: ['129,90 €', '30 heures', '2 ans', 'En stock'],
    paras: ["Le casque Aria offre une autonomie de 30 heures et une réduction de bruit active efficace dans les transports.", "Livraison offerte dès 50 € d'achat. Garantie 2 ans. Retour gratuit sous 14 jours."], list: ['Bluetooth 5.3', 'Réduction de bruit active', 'Micro intégré'], table: [['Poids', '250 g'], ['Autonomie', '30 heures'], ['Stock', 'En stock']], price: '129,90 €' },
  { id: 'shop-velo', kind: 'shop', layout: 'semantic', title: 'Vélo de ville Cadence 7 vitesses', must: ['449 €', '18 kg', '5 ans', 'Rupture de stock'],
    paras: ["Le vélo Cadence est conçu pour la ville : cadre aluminium, garde-boue, porte-bagages et éclairage intégré.", "Le modèle bleu est actuellement en Rupture de stock, réapprovisionnement prévu en mai."], list: ['7 vitesses Shimano', 'Cadre aluminium', 'Éclairage intégré'], table: [['Poids', '18 kg'], ['Garantie cadre', '5 ans']], price: '449 €' },
  { id: 'shop-cafetiere', kind: 'shop', layout: 'tablelayout', title: 'Cafetière filtre Matin 1,2 L', must: ['59 €', '1,2 L', '1 an'],
    paras: ["La cafetière Matin prépare jusqu'à 10 tasses et garde le café chaud pendant 2 heures grâce à sa plaque chauffante.", "Pièces détachées disponibles. Garantie 1 an."], list: ['Capacité 1,2 L', 'Arrêt automatique', 'Filtre permanent'], price: '59 €' },
  { id: 'shop-livre', kind: 'shop', layout: 'divsoup', title: 'Roman « Les Heures claires » — édition poche', must: ['8,90 €', '312 pages', 'ISBN 978-2-0000-1234-5'],
    paras: ["Un roman choral sur trois générations d'une famille de pêcheurs bretons, entre mer et silence.", "Format poche, 312 pages. ISBN 978-2-0000-1234-5."], list: ['Format poche', '312 pages', 'Parution 2026'], price: '8,90 €' },
  // ── Presse / articles ────────────────────────────────────────────────────
  { id: 'news-transport', kind: 'article', layout: 'article', title: 'Le tramway prolongé jusqu’à la gare en 2028', must: ['18 millions d’euros', 'mars 2028', 'Marie Durand'],
    paras: ["Le conseil métropolitain a voté hier le prolongement de la ligne T2 jusqu'à la gare, un chantier estimé à 18 millions d'euros qui devrait s'achever en mars 2028, selon la présidente Marie Durand.", "Les riverains seront consultés durant l'été, puis les travaux débuteront à l'automne, ce qui entraînera des déviations de bus sur plusieurs quartiers.", "L'opposition regrette toutefois que le calendrier n'ait pas été présenté plus tôt et demande une enquête publique complète."] },
  { id: 'news-ecole', kind: 'article', layout: 'article', title: 'Rentrée : dix écoles passent à la semaine de quatre jours', must: ['dix écoles', '2 septembre', 'Paul Martin'],
    paras: ["Dix écoles de la commune adopteront la semaine de quatre jours dès le 2 septembre, a annoncé l'adjoint à l'éducation, Paul Martin, lors du conseil municipal de lundi.", "La décision fait suite à une consultation des familles qui a recueilli une large majorité en faveur du changement, mais certains parents craignent des journées trop longues pour les plus jeunes."] },
  { id: 'news-sante', kind: 'article', layout: 'article', title: 'Grippe : la vaccination ouverte à tous dès octobre', must: ['octobre', '70 %', 'Agence régionale de santé'],
    paras: ["L'Agence régionale de santé élargit la campagne de vaccination contre la grippe, désormais ouverte à toute la population à partir d'octobre, avec un objectif de couverture de 70 % chez les personnes à risque.", "Les pharmaciens pourront procéder aux injections sans ordonnance préalable, ce qui devrait faciliter l'accès à la vaccination dans les zones rurales."] },
  // ── Juridique ────────────────────────────────────────────────────────────
  { id: 'legal-cgu', kind: 'legal', layout: 'semantic', title: "Conditions générales d'utilisation", must: ['30 jours', 'contact@exemple-test.fr', '1er janvier 2027'],
    paras: ["Les présentes conditions entrent en vigueur le 1er janvier 2027 et s'appliquent à tout utilisateur du service, lequel reconnaît en avoir pris connaissance préalablement à toute utilisation.", "L'utilisateur peut résilier son compte à tout moment moyennant un préavis de 30 jours, et toute réclamation doit être adressée à contact@exemple-test.fr.", "Le service se réserve le droit de modifier les présentes dès lors que la loi l'exige, sans que cela ouvre droit à indemnité."] },
  { id: 'legal-rgpd', kind: 'legal', layout: 'divsoup', title: 'Politique de confidentialité', must: ['3 ans', 'dpo@exemple-test.fr', 'droit d’accès'],
    paras: ["Les données personnelles collectées sont conservées durant 3 ans à compter du dernier contact, puis supprimées, conformément au règlement général sur la protection des données.", "Vous disposez d'un droit d’accès, de rectification et d'effacement que vous pouvez exercer en écrivant à dpo@exemple-test.fr."] },
  // ── Santé ────────────────────────────────────────────────────────────────
  { id: 'sante-urgences', kind: 'health', layout: 'semantic', title: 'Centre hospitalier : urgences et consultations', must: ['24h/24', '15', '04 78 00 00 00'],
    paras: ["Le service des urgences est ouvert 24h/24. En cas de danger vital, composez le 15 (SAMU) sans attendre.", "Les consultations externes ont lieu sur rendez-vous au 04 78 00 00 00, du lundi au vendredi, et les patients sont invités à se munir de leur carte Vitale."], list: ['Carte Vitale', 'Pièce d’identité', 'Ordonnance en cours'], table: [['Consultations', '8h-17h'], ['Urgences', '24h/24']] },
  { id: 'sante-vaccins', kind: 'health', layout: 'divsoup', title: 'Centre de vaccination : horaires et tarifs', must: ['mardi', '11 €', '10h-16h'],
    paras: ["Le centre propose des vaccinations sans rendez-vous le mardi de 10h-16h, moyennant un forfait de 11 € pour les vaccins non obligatoires.", "Les mineurs doivent être accompagnés d'un responsable légal muni d'une pièce d'identité."], table: [['Mardi', '10h-16h'], ['Jeudi', 'Sur rendez-vous']] },
  // ── Éducation ────────────────────────────────────────────────────────────
  { id: 'ecole-inscription', kind: 'edu', layout: 'tablelayout', title: "Inscription à l'université : calendrier", must: ['1er mars', '15 avril', '170 €'],
    paras: ["Les candidatures sont ouvertes à compter du 1er mars et doivent être finalisées avant le 15 avril, date à laquelle les dossiers incomplets seront écartés.", "Les droits d'inscription s'élèvent à 170 € pour l'année, et les étudiants boursiers en sont exonérés sur présentation d'une attestation."], list: ['Relevés de notes', 'Lettre de motivation', 'Attestation de bourse'] },
  { id: 'ecole-bourses', kind: 'edu', layout: 'semantic', title: 'Aides financières pour étudiants', must: ['1 200 €', '31 octobre', 'dossier social étudiant'],
    paras: ["Une aide annuelle pouvant atteindre 1 200 € est attribuée sous conditions de ressources, après constitution du dossier social étudiant avant le 31 octobre.", "Les étudiants qui bénéficient déjà d'une bourse doivent néanmoins renouveler leur demande chaque année."] },
  // ── Banque / transport ───────────────────────────────────────────────────
  { id: 'banque-faq', kind: 'faq', layout: 'divsoup', title: 'Questions fréquentes : carte bancaire', must: ['0892 00 00 00', '48 heures', '3 000 €'],
    paras: ["En cas de perte ou de vol, faites opposition immédiatement au 0892 00 00 00, service ouvert 24h/24.", "Le plafond de paiement est de 3 000 € par mois, et une demande de relèvement est traitée sous 48 heures, sous réserve de l'accord préalable du conseiller."] },
  { id: 'transport-ter', kind: 'transport', layout: 'tablelayout', title: 'TER Lyon – Grenoble : horaires et tarifs', must: ['7h42', '18,50 €', '1h35'],
    paras: ["Le premier train part à 7h42 et le trajet dure 1h35. Le billet plein tarif coûte 18,50 €, avec des réductions pour les moins de 26 ans.", "En cas de perturbation, les voyageurs sont invités à consulter l'application avant de se rendre en gare."], table: [['Lyon Part-Dieu', '7h42'], ['Grenoble', '9h17']] },
  { id: 'transport-velo', kind: 'transport', layout: 'semantic', title: 'Abonnement vélos en libre-service', must: ['35 €', '30 minutes', '12 mois'],
    paras: ["L'abonnement annuel coûte 35 € pour 12 mois, et les trajets de moins de 30 minutes sont gratuits, au-delà un supplément est facturé.", "Le dépôt d'une caution est requis lors de la souscription."] },
];

const NAV = '<nav class="menu"><ul><li><a href="/">Accueil</a></li><li><a href="/services">Services</a></li><li><a href="/contact">Contact</a></li><li><a href="/plan">Plan du site</a></li></ul></nav>';
const COOKIE = '<div class="cookie-banner" style="position:fixed;bottom:0;background:#333;color:#aaa">Nous utilisons des cookies. <button>Accepter</button> <a href="/cookies">En savoir plus</a></div>';
const AD = '<aside class="ad sponsor"><a href="https://pub.example/x"><img src="/pub.gif"></a><p>Offre spéciale — cliquez ici !</p></aside>';
const FOOT = '<footer><p>© 2026 Organisation de test — <a href="/mentions">Mentions légales</a> — <a href="/rgpd">Données</a></p></footer>';
const SCRIPT = '<script>window.dataLayer=[];function track(){}</script>';

function body(p) {
  const paras = p.paras.map((t) => `<p>${esc(t)}</p>`).join('\n');
  const list = p.list ? `<h4>À fournir</h4><ul>${p.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';   // h4 sans h2/h3 : saut de niveau
  const price = p.price ? `<div class="price" style="color:#aaa">${esc(p.price)}</div>` : '';
  const hasTh = p.layout === 'semantic';
  const table = p.table ? (hasTh
    ? `<table><tr><th>Élément</th><th>Valeur</th></tr>${p.table.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`
    : `<table>${p.table.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>`) : '';
  const imgs = '<img src="/hero.jpg"><img src="/spacer.gif" alt=""><img src="/photo.jpg" alt="photo">';
  const links = '<p>Pour en savoir plus, <a href="/plus">cliquez ici</a>. <a href="/pdf"><img src="/pdf.png"></a></p>';
  switch (p.layout) {
    case 'semantic':
      return `<header><a href="/">Logo</a></header>${NAV}<main><h1>${esc(p.title)}</h1>${imgs}${price}${paras}${list}${table}${links}</main>${AD}${FOOT}`;
    case 'divsoup':
      return `<div class="top">${NAV}</div><div class="content"><div class="title" style="font-size:28px;font-weight:bold">${esc(p.title)}</div>${imgs}${price}<div class="txt">${paras}</div>${list}${table}${links}</div><div class="side">${AD}</div>${FOOT}`;
    case 'tablelayout':
      return `<table width="100%"><tr><td width="20%">${NAV}${AD}</td><td><h1>${esc(p.title)}</h1>${imgs}${price}${paras}${list}${table}${links}</td></tr></table>${FOOT}`;
    case 'article':
      return `${NAV}<article><h1>${esc(p.title)}</h1><p class="byline">Par la rédaction — 10 novembre 2026</p>${imgs}${paras}${links}</article>${AD}<div class="comments"><h3>Commentaires</h3><p>Soyez le premier à commenter cet article très intéressant et partagé.</p></div>${FOOT}`;
  }
}

const manifest = [];
for (const p of PAGES) {
  const html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${esc(p.title)} | Site de test</title></head><body>${COOKIE}${SCRIPT}\n${body(p)}\n</body></html>\n`;
  fs.writeFileSync(path.join(out, p.id + '.html'), html);
  manifest.push({ id: p.id, kind: p.kind, layout: p.layout, title: p.title, must_show: p.must });
}
fs.writeFileSync(path.join(here, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`${PAGES.length} pages écrites dans ${out}`);
