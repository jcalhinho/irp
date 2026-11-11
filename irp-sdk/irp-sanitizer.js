/*!
 * irp-sanitizer.js — Assainisseur HTML/CSS par liste blanche pour IRP (v1.0.0)
 *
 * Fichier canonique : irp-sdk/irp-sanitizer.js
 * Copies identiques : irp-client/sanitizer.js, irp-extension/irp-sanitizer.js
 *                     (scripts/sync-sanitizer.sh ; identité vérifiée par les tests)
 *
 * Principe : le HTML produit par un modèle (donc NON FIABLE) est parsé dans un
 * document inerte (DOMParser : aucun script exécuté, aucune ressource chargée),
 * puis RECONSTRUIT nœud par nœud en ne copiant que les éléments, attributs et
 * valeurs autorisés. Le résultat n'est jamais re-sérialisé puis re-parsé
 * (évite les mutations de type mXSS). Sont supprimés : <script>, handlers on*,
 * iframes/objets, URL javascript:/data:, images distantes (placeholder),
 * formulaires pointant vers l'extérieur, CSS chargeant des ressources externes.
 *
 * Usage :
 *   IRPSanitizer.mount(element, html)                  // remplace le contenu
 *   IRPSanitizer.sanitizeToFragment(html, document)    // -> DocumentFragment
 *
 * Limites connues (voir AGENTS.md) : le CSS autorisé est global à la page
 * (pas d'isolation Shadow DOM) et les attributs id/class ne sont pas préfixés.
 *
 * NB : ce fichier n'utilise volontairement aucune séquence d'échappement Unicode
 * littérale ; les plages de caractères sont construites à l'exécution.
 */
(function (root) {
  'use strict';

  const VERSION = '1.0.0';
  const HTML_NS = 'http://www.w3.org/1999/xhtml';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const LIMITS = {
    maxInput: 2000000,   // caractères de HTML en entrée
    maxDepth: 64,        // profondeur d'imbrication
    maxNodes: 20000,     // nombre de nœuds parcourus
    maxCss: 500000,      // taille d'une feuille de style
    maxAttr: 20000,      // taille d'une valeur d'attribut
    maxDataUrl: 500000,  // taille d'une image data:
  };

  const set = (s) => new Set(s.split(/\s+/).filter(Boolean));

  // Classe de caractères construite à l'exécution : cls([[0x00, 0x20], [0xad]])
  const cc = (n) => '\\u' + ('0000' + n.toString(16)).slice(-4);
  const cls = (ranges) => '[' + ranges.map((r) => cc(r[0]) + (r.length > 1 ? '-' + cc(r[1]) : '')).join('') + ']';
  // Espaces, contrôles et caractères invisibles (contournements de type "java<TAB>script:")
  const INVISIBLE = new RegExp(cls([[0x00, 0x20], [0x7f, 0x9f], [0xad], [0x200b, 0x200f], [0x2028, 0x2029], [0xfeff]]), 'g');
  const CTRL_SPACE = new RegExp(cls([[0x00, 0x20]]), 'g');
  const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
  const FRAME_PICTURE = String.fromCodePoint(0x1f5bc, 0xfe0f);

  // Supprimés AVEC leur contenu (dans tout namespace)
  const DROP = set(`script iframe frame frameset object embed applet link meta base template noscript
    noembed noframes math foreignobject head audio video source track canvas portal
    animate set use image animatemotion mpath switch`);
  // Supprimés avec leur contenu uniquement en HTML (le <title> SVG est conservé : accessibilité)
  const DROP_HTML = set('title');

  const HTML_TAGS = set(`a abbr address article aside b bdi bdo blockquote br button caption cite code col
    colgroup data dd del details dfn div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6
    header hgroup hr i img input ins kbd label legend li main mark menu meter nav ol optgroup option output
    p pre progress q s samp section select small span strong sub summary sup table tbody td textarea tfoot
    th thead time tr u ul var wbr`);

  const SVG_TAGS = set(`svg g path circle ellipse rect line polyline polygon text tspan defs lineargradient
    radialgradient stop clippath mask pattern symbol desc title animatetransform`);

  const GLOBAL_ATTRS = set('class id lang dir title role tabindex hidden');

  const ATTRS_BY_TAG = {
    a: set('href target'),
    img: set('src alt width height'),
    input: set(`type name value placeholder required disabled checked readonly min max step maxlength
      minlength pattern autocomplete size multiple accept`),
    textarea: set('name placeholder rows cols required disabled readonly maxlength minlength wrap'),
    select: set('name required disabled multiple size'),
    option: set('value selected disabled label'),
    optgroup: set('label disabled'),
    button: set('type name value disabled'),
    form: set('action method novalidate autocomplete'),
    label: set('for'),
    fieldset: set('disabled'),
    td: set('colspan rowspan headers'),
    th: set('colspan rowspan headers scope abbr'),
    col: set('span'),
    colgroup: set('span'),
    ol: set('start reversed type'),
    li: set('value'),
    details: set('open'),
    progress: set('value max'),
    meter: set('value min max low high optimum'),
    time: set('datetime'),
    data: set('value'),
    output: set('for name'),
  };

  const SVG_ATTRS = set(`viewbox width height x y x1 x2 y1 y2 cx cy r rx ry fx fy d points transform fill
    fill-opacity fill-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray
    stroke-dashoffset stroke-opacity stroke-miterlimit opacity offset stop-color stop-opacity
    gradientunits gradienttransform clip-rule clip-path mask preserveaspectratio text-anchor
    dominant-baseline font-family font-size font-weight letter-spacing dx dy textlength lengthadjust
    patternunits patterntransform spreadmethod vector-effect shape-rendering focusable
    type from to dur repeatcount begin end values keytimes calcmode additive keysplines attributetype
    clippathunits maskunits maskcontentunits patterncontentunits`);

  const INPUT_TYPES = set(`text email tel url number password search date time datetime-local month week
    color range checkbox radio hidden submit reset button file`);
  const BUTTON_TYPES = set('submit button reset');

  // ─── URL ──────────────────────────────────────────────────────────────────

  const stripUrl = (v) => String(v).replace(INVISIBLE, '');
  const SCHEME = /^([a-z][a-z0-9+.\-]*):/i;

  function safeHref(value) {
    const v = stripUrl(value);
    if (!v) return null;
    if (v[0] === '#') return v;
    const m = SCHEME.exec(v);
    if (!m) return value.trim(); // relatif : /chemin, page, ?q=1, //hote
    return /^(https?|mailto|tel)$/i.test(m[1]) ? value.trim() : null;
  }

  // Un formulaire ne peut soumettre que vers le même site (jamais vers un hôte externe)
  function safeAction(value) {
    const v = stripUrl(value);
    if (!v || SCHEME.test(v) || v.slice(0, 2) === '//') return null;
    return value.trim();
  }

  // ─── CSS ──────────────────────────────────────────────────────────────────

  function decodeCssEscapes(s) {
    return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (m, hex, ch) => {
      if (hex) {
        const cp = parseInt(hex, 16);
        try { return String.fromCodePoint(cp || 0xfffd); } catch (e) { return REPLACEMENT_CHAR; }
      }
      return ch;
    });
  }

  const CSS_FORBIDDEN = new RegExp(
    '@import|@namespace|@charset|@font-face|@document|@-moz-document|expression\\s*\\(|behavior\\s*:|' +
    '-moz-binding|javascript\\s*:|vbscript\\s*:|livescript\\s*:|image-set\\s*\\(|cross-fade\\s*\\(|' +
    'element\\s*\\(|\\bsrc\\s*\\(', 'i');

  // Seules les références locales (#id) et les images data: sont tolérées dans url(...)
  function cssUrlsSafe(decoded) {
    const re = /url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
    let found = 0;
    let m;
    while ((m = re.exec(decoded))) {
      found++;
      const arg = (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] || '').replace(CTRL_SPACE, '');
      if (!(arg[0] === '#' || /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(arg))) return false;
    }
    const total = (decoded.match(/url\s*\(/gi) || []).length;
    return found === total; // un "url(" non terminé est refusé
  }

  function valueIsSafe(value) {
    const dec = decodeCssEscapes(value.replace(/\/\*[\s\S]*?\*\//g, ''));
    return !CSS_FORBIDDEN.test(dec) && cssUrlsSafe(dec);
  }

  // Fail-closed : au moindre élément douteux, toute la feuille/déclaration est supprimée
  function sanitizeCSS(css) {
    css = String(css == null ? '' : css);
    if (css.length > LIMITS.maxCss) return '';
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    if (!valueIsSafe(css)) return '';
    return css.trim();
  }

  // ─── Attributs ────────────────────────────────────────────────────────────

  function cleanAttr(lname, value, tag, isSvg) {
    if (value.length > LIMITS.maxAttr) return null;
    if (lname === 'style') return sanitizeCSS(value) || null;
    if (/^aria-[a-z-]+$/.test(lname) || /^data-[a-z0-9_.\-]+$/.test(lname)) return value;
    if (lname === 'tabindex') return /^-?\d{1,3}$/.test(value.trim()) ? value.trim() : null;

    if (isSvg) {
      if (lname === 'href') return value.trim()[0] === '#' ? value.trim() : null; // références locales seulement
      if (lname === 'attributename') return value === 'transform' ? value : null;
      if (!SVG_ATTRS.has(lname) && !GLOBAL_ATTRS.has(lname)) return null;
      return valueIsSafe(value) ? value : null;
    }

    const own = ATTRS_BY_TAG[tag];
    if (!GLOBAL_ATTRS.has(lname) && !(own && own.has(lname))) return null;

    switch (lname) {
      case 'href': return safeHref(value);
      case 'action': return safeAction(value);
      case 'src': return null; // géré par cleanImg
      case 'target': return value === '_blank' || value === '_self' ? value : null;
      case 'method': return /^(get|post)$/i.test(value) ? value.toLowerCase() : null;
      case 'width':
      case 'height': return /^\d{1,5}(px|%)?$/.test(value.trim()) ? value.trim() : null;
      case 'type':
        if (tag === 'input') return INPUT_TYPES.has(value.toLowerCase()) ? value.toLowerCase() : null;
        if (tag === 'button') return BUTTON_TYPES.has(value.toLowerCase()) ? value.toLowerCase() : null;
        if (tag === 'ol') return /^[1aAiI]$/.test(value) ? value : null;
        return null;
      default: return value;
    }
  }

  function copyAttrs(src, el, tag, isSvg) {
    for (const a of Array.from(src.attributes)) {
      const lname = a.name.toLowerCase();
      if (lname.indexOf('on') === 0) continue; // handlers d'événements : jamais
      const v = cleanAttr(lname, a.value, tag, isSvg);
      if (v === null) continue;
      try { el.setAttribute(isSvg ? a.name : lname, v); } catch (e) { /* nom d'attribut invalide */ }
    }
    if (!isSvg && tag === 'a' && el.hasAttribute('href')) {
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }

  // ─── Images ───────────────────────────────────────────────────────────────

  // Les images distantes sont remplacées par un placeholder accessible (pas de pistage, pas de fuite d'IP)
  function cleanImg(n, doc) {
    const raw = n.getAttribute('src') || '';
    const v = stripUrl(raw);
    let src = null;
    if (v) {
      if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(v) && v.length <= LIMITS.maxDataUrl) src = v;
      else if (!SCHEME.test(v) && v.slice(0, 2) !== '//') src = raw.trim();
    }
    if (src !== null) {
      const img = doc.createElement('img');
      copyAttrs(n, img, 'img', false);
      img.setAttribute('src', src);
      return img;
    }
    const ph = doc.createElement('div');
    ph.setAttribute('role', 'img');
    const alt = n.getAttribute('alt');
    if (alt) ph.setAttribute('aria-label', alt.slice(0, 500));
    const klass = n.getAttribute('class');
    if (klass) ph.setAttribute('class', klass);
    ph.setAttribute('style', 'min-height:120px;display:flex;align-items:center;justify-content:center;' +
      'background:#1a1a2e;border-radius:8px;color:#888;');
    const s = doc.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    s.textContent = FRAME_PICTURE;
    ph.appendChild(s);
    return ph;
  }

  // ─── Parcours ─────────────────────────────────────────────────────────────

  function cleanChildren(src, dst, doc, state, depth) {
    for (let n = src.firstChild; n; n = n.nextSibling) {
      if (++state.nodes > LIMITS.maxNodes) return;
      if (n.nodeType === 3) { dst.appendChild(doc.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue; // commentaires, instructions de traitement, CDATA : ignorés

      const ns = n.namespaceURI;
      if (ns !== HTML_NS && ns !== SVG_NS) continue; // MathML et autres : supprimés avec leur contenu
      const isSvg = ns === SVG_NS;
      const name = n.localName.toLowerCase();

      if (name === 'style') {
        if (!isSvg) {
          const css = sanitizeCSS(n.textContent);
          if (css) {
            const s = doc.createElement('style');
            s.textContent = css;
            dst.appendChild(s);
          }
        }
        continue;
      }
      if (DROP.has(name) || (!isSvg && DROP_HTML.has(name))) continue;
      if (depth >= LIMITS.maxDepth) continue;

      if (!(isSvg ? SVG_TAGS : HTML_TAGS).has(name)) { // balise inconnue : on garde le contenu, pas la balise
        cleanChildren(n, dst, doc, state, depth + 1);
        continue;
      }
      if (!isSvg && name === 'img') { dst.appendChild(cleanImg(n, doc)); continue; }

      const el = isSvg ? doc.createElementNS(SVG_NS, n.localName) : doc.createElement(name);
      copyAttrs(n, el, name, isSvg);
      cleanChildren(n, el, doc, state, depth + 1);
      dst.appendChild(el);
    }
  }

  // ─── API ──────────────────────────────────────────────────────────────────

  function sanitizeToFragment(html, doc) {
    doc = doc || root.document;
    const frag = doc.createDocumentFragment();
    if (typeof html !== 'string' || !html) return frag;
    if (html.length > LIMITS.maxInput) html = html.slice(0, LIMITS.maxInput);
    const parsed = new root.DOMParser().parseFromString('<!doctype html><html><body>' + html, 'text/html');
    cleanChildren(parsed.body, frag, doc, { nodes: 0 }, 0);
    return frag;
  }

  function mount(el, html) {
    el.replaceChildren(sanitizeToFragment(html, el.ownerDocument || root.document));
  }

  // Version chaîne (cache, tests). Préférer sanitizeToFragment/mount : ne pas re-parser ce résultat.
  function sanitizeHTML(html, doc) {
    doc = doc || root.document;
    const div = doc.createElement('div');
    div.appendChild(sanitizeToFragment(html, doc));
    return div.innerHTML;
  }

  root.IRPSanitizer = Object.freeze({ version: VERSION, sanitizeToFragment, sanitizeHTML, sanitizeCSS, mount });
})(typeof self !== 'undefined' ? self : globalThis);
