// widget.js — IRP « Lecture adaptée » : un bouton à installer en UNE ligne sur n'importe quel site.
//   <script src="https://VOTRE-SERVEUR/widget.js" defer></script>      (option : data-profile="dyslexie", data-label="…")
// Rien n'est chargé tant que le visiteur ne clique pas. Aucun cookie, aucune donnée envoyée : tout se passe dans son navigateur.
// Le contenu est ré-affiché par un rendu déterministe (pas d'innerHTML) dans un Shadow DOM fermé.
(function () {
  'use strict';
  var me = document.currentScript;
  if (!me || window.__irpWidget) return;
  window.__irpWidget = true;
  var base = new URL(me.src).origin;
  window.__IRP_BASE = base;
  var profile = me.getAttribute('data-profile') || undefined;
  var label = me.getAttribute('data-label') || 'Lecture adaptée';
  var loading = null;

  function load() {
    return (loading = loading || new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = base + '/reader.js'; s.onload = ok; s.onerror = function () { loading = null; ko(new Error('reader indisponible')); };
      document.head.appendChild(s);
    }));
  }
  function toggle() { load().then(function () { if (window.__irpReaderToggle) window.__irpReaderToggle(profile); }).catch(function () {}); }

  function mount() {
    var host = document.createElement('div');
    var root = host.attachShadow({ mode: 'closed' });
    var st = document.createElement('style');
    st.textContent = ':host{all:initial}button{position:fixed;right:16px;bottom:16px;z-index:2147483000;min-height:44px;padding:.5rem 1rem;'
      + 'font:600 15px system-ui,sans-serif;border-radius:999px;border:2px solid #fff;background:#111;color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35)}'
      + 'button:focus-visible{outline:3px solid #ffd400;outline-offset:2px}';
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = '\u{1F441} ' + label; b.setAttribute('aria-label', label + ' (Alt+Maj+L)');
    b.addEventListener('click', toggle);
    root.append(st, b);
    document.body.appendChild(host);
  }
  document.addEventListener('keydown', function (e) { if (e.altKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); toggle(); } });
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
