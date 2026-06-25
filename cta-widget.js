/* ============================================================
   prepamedecine.fr - Widget CTA partage (lead generation)
   Injecte un bouton flottant "Etre rappele gratuitement" + un
   modal avec le formulaire HubSpot, identique a la page d'accueil.
   Expose window.openModal() pour que tout bouton/lien existant
   puisse declencher le modal. Reconnecte automatiquement les CTA
   "Etre rappele" des landing pages (qui renvoyaient vers /#prepas).
   ============================================================ */
(function () {
  if (window.__ctawLoaded) return;
  window.__ctawLoaded = true;

  var DIPLOMA_FORM_ID = 'prepamedecine-fr-contact-hs21ba39';

  /* ---------- 1. Styles (auto-suffisants, couleurs en dur) ---------- */
  var css = '' +
    '.ctaw-fab{position:fixed;bottom:24px;right:24px;z-index:9000;background:#059669;color:#fff;border-radius:50px;display:flex;align-items:center;gap:8px;cursor:pointer;box-shadow:0 4px 20px rgba(5,150,105,.35);transition:all .3s;border:none;padding:16px 24px;font-size:15px;font-weight:700;font-family:Inter,system-ui,sans-serif;animation:ctaw-pulse 2.5s ease-in-out infinite}' +
    '.ctaw-fab:hover{transform:scale(1.05);box-shadow:0 6px 28px rgba(5,150,105,.45)}' +
    '.ctaw-fab svg{flex-shrink:0}' +
    '@keyframes ctaw-pulse{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}' +
    '@media(max-width:600px){.ctaw-fab span{display:none}.ctaw-fab{padding:16px;border-radius:50%;width:56px;height:56px;justify-content:center}}' +
    '.ctaw-overlay{display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);backdrop-filter:blur(4px);z-index:9100;align-items:center;justify-content:center;padding:24px}' +
    '.ctaw-overlay.active{display:flex}' +
    '.ctaw-modal{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;font-family:Inter,system-ui,sans-serif}' +
    '.ctaw-head{padding:28px 32px 0;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}' +
    '.ctaw-head h2{font-size:22px;font-weight:800;color:#0f172a;margin:0 0 4px;display:flex;align-items:center;gap:8px}' +
    '.ctaw-head p{font-size:14px;color:#64748b;margin:0}' +
    '.ctaw-close{width:36px;height:36px;border-radius:50%;border:none;background:#f1f5f9;cursor:pointer;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center;transition:background .2s;flex-shrink:0;color:#64748b}' +
    '.ctaw-close:hover{background:#e2e8f0;color:#0f172a}' +
    '.ctaw-body{padding:24px 32px 32px}' +
    '.ctaw-trust{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:16px;font-size:12px;color:#64748b;flex-wrap:wrap}' +
    '.ctaw-trust span{display:flex;align-items:center;gap:4px}' +
    '.ctaw-trust svg{stroke:#10b981}' +
    /* Form Diploma : herite de la typo du site + masque le titre interne du form */
    '.ctaw-modal [data-diploma-form] form,.ctaw-modal [data-diploma-form] form *{font-family:inherit!important}' +
    '.ctaw-modal .diploma-form__title{display:none!important}' +
    '@media(max-width:600px){.ctaw-body{padding:20px 24px 28px}.ctaw-head{padding:24px 24px 0}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- 3. Markup (icones SVG inline) ---------- */
  var phone = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var shield = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>';
  var zap = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
  var users = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

  var fab = document.createElement('button');
  fab.className = 'ctaw-fab';
  fab.setAttribute('aria-label', 'Etre rappele gratuitement');
  fab.innerHTML = phone + '<span>Etre rappele</span>';

  var overlay = document.createElement('div');
  overlay.className = 'ctaw-overlay';
  overlay.innerHTML =
    '<div class="ctaw-modal" role="dialog" aria-modal="true">' +
      '<div class="ctaw-head">' +
        '<div>' +
          '<h2>' + phone + ' Demande de rappel gratuit</h2>' +
          '<p>Un conseiller te recontacte sous 24h pour t\u2019aider dans ton choix.</p>' +
        '</div>' +
        '<button class="ctaw-close" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="ctaw-body">' +
        '<div data-diploma-form="' + DIPLOMA_FORM_ID + '"></div>' +
        '<div class="ctaw-trust">' +
          '<span>' + shield + ' 100% gratuit</span>' +
          '<span>' + zap + ' R\u00e9ponse sous 24h</span>' +
          '<span>' + users + ' Sans engagement</span>' +
        '</div>' +
      '</div>' +
    '</div>';

  function mount() {
    if (!document.body) { document.addEventListener('DOMContentLoaded', mount); return; }
    document.body.appendChild(fab);
    document.body.appendChild(overlay);
    rewire();
  }

  /* ---------- 4. Logique modal + formulaire (embed Diploma) ---------- */
  var formLoaded = false;
  function loadForm() {
    if (formLoaded) return;
    formLoaded = true;
    // Le script embed Diploma scanne le DOM et remplit tous les [data-diploma-form].
    // On reutilise le meme id que les autres pages pour ne jamais le charger deux fois.
    if (!document.getElementById('diploma-embed-script')) {
      var s = document.createElement('script');
      s.id = 'diploma-embed-script';
      s.async = true;
      s.src = 'https://hub.diploma-sante.fr/api/forms/' + DIPLOMA_FORM_ID + '/embed.js';
      document.head.appendChild(s);
    }
  }
  function open() {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    loadForm();
  }
  function close() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  fab.addEventListener('click', open);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  overlay.querySelector('.ctaw-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  /* Expose globalement (ne pas ecraser un openModal existant). */
  window.ctawOpen = open;
  window.ctawClose = close;
  if (typeof window.openModal !== 'function') window.openModal = open;

  /* ---------- 5. Reconnecte les CTA "rappel/conseiller" existants ---------- */
  function rewire() {
    var sel = 'a[href="/#prepas"], a[href="#prepas"], a.cta-btn, a.footer-cta-btn, a.cta-green, button.cta-green';
    var nodes = document.querySelectorAll(sel);
    nodes.forEach(function (el) {
      var t = (el.textContent || '').toLowerCase();
      if (/rappel|rappele|conseiller|conseil gratuit|parler/.test(t)) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          open();
        });
        el.style.cursor = 'pointer';
      }
    });
  }

  mount();
})();
