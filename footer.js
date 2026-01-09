/* =========================
   Util: normalizza path + onReady
   ========================= */
function onlNormalizePath(p){
  return (p || "").replace(/\/+$/, "") || "/";
}
function onlOnReady(fn){
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

/* =========================
   Tooltip sharebar: box nero + triangolino – NERO PIENO
   ========================= */
onlOnReady(() => {
  if (document.getElementById('onl-share-tooltip-style')) return;

  const style = document.createElement('style');
  style.id = 'onl-share-tooltip-style';
  style.textContent = `
    @media (hover:hover) and (pointer:fine){
      .onl-sharebar__btn[data-label]::after{
        content: attr(data-label);
        position:absolute;
        left:50%;
        bottom: calc(100% + 12px);
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: 11.5px;
        line-height: 1;
        padding: 6px 8px;
        border-radius: 8px;
        background: #000;
        color:#fff;
        opacity:0;
        pointer-events:none;
        transition: opacity .12s ease, transform .12s ease;
        transform-origin: bottom center;
        box-shadow: 0 10px 26px rgba(0,0,0,.18);
      }
      .onl-sharebar__btn[data-label]::before{
        content:"";
        position:absolute;
        left:50%;
        bottom: calc(100% + 6px);
        transform: translateX(-50%);
        width:0; height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:6px solid #000;
        opacity:0;
        pointer-events:none;
        transition: opacity .12s ease, transform .12s ease;
      }
      .onl-sharebar__btn[data-label]:hover::after{
        opacity:1;
        transform: translateX(-50%) translateY(-2px);
      }
      .onl-sharebar__btn[data-label]:hover::before{
        opacity:1;
        transform: translateX(-50%) translateY(-2px);
      }
    }
  `;
  document.head.appendChild(style);
});

/* =========================
   Link esterni: apri in nuova scheda (target=_blank)
   ========================= */
onlOnReady(() => {
  document.querySelectorAll('a[href]').forEach((a) => {
    if (a.getAttribute('target')) return;

    const href = (a.getAttribute('href') || '').trim();
    if (!href) return;

    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) return;

    try{
      const url = new URL(href, window.location.href);
      if (url.hostname !== window.location.hostname) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    } catch(e){}
  });
});

/* =========================
   LINK PREVIEW (sovraimpressione)
   - SOLO link interni + wikipedia
   - SOLO dentro .gh-content (NO menu, NO footer)
   ========================= */
onlOnReady(() => {
  try {
    if (document.querySelector('.onl-linkpreview')) return;

    const cache = new Map();

    const preview = document.createElement('div');
    preview.className = 'onl-linkpreview';
    preview.innerHTML = `
      <p class="onl-linkpreview__title"></p>
      <p class="onl-linkpreview__desc"></p>
    `;
    document.body.appendChild(preview);

    const titleEl = preview.querySelector('.onl-linkpreview__title');
    const descEl  = preview.querySelector('.onl-linkpreview__desc');

    let timer = null;
    let active = null;

    const isWiki = (u) =>
      u.hostname.endsWith('wikipedia.org') &&
      (u.pathname.startsWith('/wiki/') || u.pathname.startsWith('/w/index.php'));

    const eligible = (a) => {
      if (!a || !a.getAttribute) return false;
      if (!a.closest('.gh-content')) return false;

      const href = (a.getAttribute('href') || '').trim();
      if (!href) return false;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
      if (a.classList && a.classList.contains('post-lightbox')) return false;

      return true;
    };

    function place(a) {
      const r = a.getBoundingClientRect();
      const pad = 12;

      preview.style.left = '-9999px';
      preview.style.top  = '-9999px';
      preview.classList.add('is-visible');

      const w = preview.offsetWidth || 360;
      const h = preview.offsetHeight || 80;

      let x = Math.min(r.left, window.innerWidth - w - pad);
      x = Math.max(pad, x);

      let y = r.bottom + 8;
      if (y + h > window.innerHeight - pad) y = r.top - h - 8;
      y = Math.max(pad, y);

      preview.style.left = x + 'px';
      preview.style.top  = y + 'px';
    }

    async function fetchInternal(url) {
      const res = await fetch(url, { credentials: 'omit' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return {
        title: doc.querySelector('meta[property="og:title"]')?.content || doc.title || '',
        desc:  doc.querySelector('meta[property="og:description"]')?.content
            || doc.querySelector('meta[name="description"]')?.content
            || ''
      };
    }

    async function fetchWikipedia(u) {
      const lang = (u.hostname.split('.')[0] || 'en').toLowerCase();

      let title = '';
      if (u.pathname.startsWith('/wiki/')) {
        title = decodeURIComponent(u.pathname.slice('/wiki/'.length)).replace(/_/g, ' ');
      } else {
        title = u.searchParams.get('title') || '';
      }
      if (!title) return { title: 'Wikipedia', desc: '' };

      const api = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(api, { headers: { 'Accept': 'application/json' } });
      const j = await res.json();

      return { title: j.title || title || 'Wikipedia', desc: j.extract || '' };
    }

    async function getData(url, internal, wiki, uObj) {
      if (cache.has(url)) return cache.get(url);

      let data = { title: '', desc: '' };
      if (internal) data = await fetchInternal(url);
      else if (wiki) data = await fetchWikipedia(uObj);

      cache.set(url, data);
      return data;
    }

    function hide() {
      preview.classList.remove('is-visible');
      active = null;
    }

    document.addEventListener('mouseover', (e) => {
      const a = e.target.closest && e.target.closest('a');
      if (!eligible(a)) return;

      const u = new URL(a.href, window.location.href);
      const internal = (u.hostname === window.location.hostname);
      const wiki = isWiki(u);

      if (!internal && !wiki) return;

      clearTimeout(timer);
      timer = setTimeout(async () => {
        active = a;

        titleEl.textContent = '';
        descEl.textContent  = '';
        place(a);

        try {
          const data = await getData(u.href, internal, wiki, u);
          if (active !== a) return;

          if (!(data.title || data.desc)) { hide(); return; }

          titleEl.textContent = data.title || '';
          descEl.textContent  = data.desc || '';
          place(a);
        } catch (_) {
          hide();
        }
      }, 180);
    });

    document.addEventListener('mouseout', (e) => {
      const a = e.target.closest && e.target.closest('a');
      if (a && a === active) {
        clearTimeout(timer);
        hide();
      }
    });

    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);

  } catch (err) {
    console.error('ONlettering preview error:', err);
  }
});

/* =========================
   Header: traduzioni (Sign in / Subscribe)
   ========================= */
onlOnReady(() => {
  const LABEL_SIGNIN = 'Accedi';
  const LABEL_SUB = 'Iscriviti alla newsletter';

  function ensureText(el, label) {
    if (!el) return;
    const raw = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (raw.length) return;

    if (!el.querySelector('.onl-auth-label')) {
      const span = document.createElement('span');
      span.className = 'onl-auth-label';
      span.textContent = label;
      el.appendChild(span);
    } else {
      el.querySelector('.onl-auth-label').textContent = label;
    }
  }

  function translateAuthLabels() {
    document.querySelectorAll(
      '.gh-head-members .gh-head-link, a[href*="#/portal/signin"], a[href*="#/signin"], a[data-portal="signin"]'
    ).forEach(a => {
      const t = (a.textContent || '').trim().toLowerCase();
      if (t === 'sign in') a.textContent = LABEL_SIGNIN;
      ensureText(a, LABEL_SIGNIN);
      a.classList.remove('nav-link-active');
    });

    const subscribeCandidates = document.querySelectorAll(
      '.gh-head-members .gh-head-btn, .gh-head-members .gh-primary-btn, a[href*="#/portal/signup"], a[href*="#/signup"], a[data-portal="signup"], button[data-portal="signup"]'
    );

    subscribeCandidates.forEach(el => {
      const textNow = (el.textContent || '').trim().toLowerCase();
      const looksLikeSubscribe =
        el.matches('.gh-head-btn, .gh-primary-btn') ||
        (el.getAttribute('href') || '').includes('/#/portal/signup') ||
        el.getAttribute('data-portal') === 'signup';

      if (!looksLikeSubscribe) return;

      if (textNow === 'subscribe') el.textContent = LABEL_SUB;
      ensureText(el, LABEL_SUB);
      el.classList.remove('nav-link-active');
    });
  }

  translateAuthLabels();

  function retryBurst(){
    let n = 0;
    const id = setInterval(() => {
      translateAuthLabels();
      if (++n >= 14) clearInterval(id);
    }, 150);
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.gh-burger, .gh-head-menu-button, .gh-head-menu-toggle, button.gh-burger')) {
      setTimeout(translateAuthLabels, 30);
      setTimeout(translateAuthLabels, 120);
      setTimeout(translateAuthLabels, 260);
      retryBurst();
    }
  });

  window.addEventListener('pageshow', () => {
    setTimeout(translateAuthLabels, 50);
    setTimeout(translateAuthLabels, 250);
  });

  const observer = new MutationObserver(() => translateAuthLabels());
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
});

/* =========================
   "You might also like" -> "Potrebbe interessarti..."
   ========================= */
onlOnReady(() => {
  const from = 'you might also like';
  const to = 'Potrebbe interessarti...';

  const candidates = document.querySelectorAll('h2, h3, .read-next-title, .related-title, .gh-related-title, .post-related-title, .related-posts-title');
  candidates.forEach(el => {
    const t = (el.textContent || '').trim();
    if (t && t.toLowerCase().startsWith(from)) el.textContent = to;
  });

  if (![...candidates].some(el => (el.textContent || '').trim() === to)) {
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const t = (el.textContent || '').trim();
      if (t && t.toLowerCase().startsWith(from)) { el.textContent = to; break; }
    }
  }
});

/* =========================
   Evidenzia voce menu attiva (header)
   ========================= */
(function () {
  function normalize(path) { return onlNormalizePath(path || ""); }
  var currentPath = normalize(window.location.pathname);

  var menuLinks = document.querySelectorAll(
    'header a[href], nav a[href], .gh-head a[href], .gh-navigation a[href]'
  );

  menuLinks.forEach(function (link) {
    try {
      var url = new URL(link.getAttribute('href'), window.location.origin);
      var linkPath = normalize(url.pathname);
      if (linkPath && linkPath === currentPath) link.classList.add('nav-link-active');
    } catch (e) {}
  });

  if (document.body.classList.contains('post-template')) {
    var tagSlugs = [];
    (document.body.className || '').split(/\s+/).forEach(function (c) {
      if (c.indexOf('tag-') === 0 && c.length > 4) tagSlugs.push(c.slice(4));
    });

    if (tagSlugs.length) {
      menuLinks.forEach(function (link) {
        try {
          var url = new URL(link.getAttribute('href'), window.location.origin);
          var p = normalize(url.pathname);

          tagSlugs.forEach(function(slug){
            if (p === normalize('/tag/' + slug + '/')) {
              link.classList.add('nav-link-active');
            }
          });
        } catch (e) {}
      });
    }
  }
})();

/* =========================
   Rende "ONlettering" link alla home
   ========================= */
onlOnReady(() => {
  const TARGET = "ONlettering";

  const alreadyLinked = Array.from(document.querySelectorAll("a")).some(a =>
    (a.textContent || "").trim() === TARGET
  );
  if (alreadyLinked) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName.toLowerCase();
      if (["script", "style", "noscript"].includes(tag)) return NodeFilter.FILTER_REJECT;

      return node.nodeValue.includes(TARGET) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const node = nodes[0];
  if (!node) return;

  const text = node.nodeValue;
  const index = text.indexOf(TARGET);

  const before = document.createTextNode(text.slice(0, index));
  const after  = document.createTextNode(text.slice(index + TARGET.length));

  const link = document.createElement("a");
  link.href = "/";
  link.textContent = TARGET;
  link.className = "footer-home-link";
  link.removeAttribute("title");

  const parent = node.parentNode;
  parent.insertBefore(before, node);
  parent.insertBefore(link, node);
  parent.insertBefore(after, node);
  parent.removeChild(node);
});

/* =========================
   DESCRIZIONI HOME + TAG (sotto header)
   - HOME: testo fisso (centrato)
   - TAG: desktop centrato sotto header + mobile inline a bandiera (come ora)
   ========================= */
onlOnReady(() => {

  const HOME_TEXT = "Appunti su lettering, fumetto e cultura visiva";

  const TAG_INFO = {
    "autori": { text: "Ritratti e approfondimenti su artisti, letteristi e designer." },
    "dentro-il-logo": { text: "Indagini sui loghi più significativi della storia del fumetto e oltre." },
    "focus": { text: "Approfondimenti tra tecnica, storia e cultura del lettering." },
    "tesori": { text: "Lettering selezionati per qualità e rilevanza." }
  };

  function getHead(){
    return document.querySelector("#gh-head") || document.querySelector(".gh-head") || document.querySelector("header");
  }

  function insertUnderHead(kind, text){
    if (!text) return;

    const id = kind === "home" ? "onl-home-underhead" : "onl-tag-underhead";
    if (document.getElementById(id)) return;

    const head = getHead();
    if (!head) return;

    const box = document.createElement("div");
    box.id = id;
    box.className = `onl-underhead-desc onl-underhead-desc--${kind}`;
    box.innerHTML = `<p class="onl-underhead-desc__text"></p>`;
    box.querySelector("p").textContent = text;

    // IMPORTANT: lo mettiamo subito dopo l'header (sotto la riga stacked)
    head.insertAdjacentElement("afterend", box);
  }

  // ---------- HOME ----------
  const isHome =
    document.body.classList.contains("home-template") ||
    document.body.classList.contains("index-template") ||
    window.location.pathname === "/" ||
    window.location.pathname === "";

  if (isHome) {
    insertUnderHead("home", HOME_TEXT);
  }

  // ---------- TAG ----------
  const m = window.location.pathname.match(/^\/tag\/([^\/]+)\/?$/);
  if (!m) return;

  const slug = m[1];
  const info = TAG_INFO[slug];
  if (!info) return;

  const isMobile = window.matchMedia("(max-width: 900px)").matches;

  // Desktop: centrato sotto header
  if (!isMobile) {
    insertUnderHead("tag", info.text);
    return;
  }

  // Mobile: inline a bandiera (come già facevi)
  if (document.querySelector(".onl-tagdesc-inline")) return;

  const box = document.createElement("div");
  box.className = "onl-tagdesc-inline";
  box.innerHTML = `<p class="onl-tagdesc-inline__text"></p>`;
  box.querySelector(".onl-tagdesc-inline__text").textContent = info.text;

  const feed =
    document.querySelector(".post-feed") ||
    document.querySelector(".gh-feed") ||
    document.querySelector(".gh-postfeed") ||
    document.querySelector(".gh-posts") ||
    document.querySelector(".post-list");

  const anchor =
    document.querySelector("main") ||
    document.querySelector(".gh-main") ||
    document.querySelector(".site-content") ||
    document.querySelector(".content") ||
    document.querySelector("body");

  if (feed && feed.parentNode) {
    feed.parentNode.insertBefore(box, feed);
  } else if (anchor) {
    if (anchor.firstChild) anchor.insertBefore(box, anchor.firstChild);
    else anchor.appendChild(box);
  }
});


/* =========================
   Click immagine: apre link SOLO se alt="link:..."
   ========================= */
onlOnReady(() => {
  function resetHoverZoom(img) {
    img.style.transform = 'none';
    img.style.boxShadow = 'none';
    requestAnimationFrame(() => {
      img.style.transform = '';
      img.style.boxShadow = '';
    });
  }

  document.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('.gh-content figure img, .gh-content img');
    if (!img) return;

    if (img.closest('a')) return;

    const alt = (img.getAttribute('alt') || '').trim();
    const match = alt.match(/^link:\s*(https?:\/\/\S+)/i);
    if (!match) return;

    e.preventDefault();
    e.stopPropagation();

    resetHoverZoom(img);
    window.open(match[1], '_blank', 'noopener,noreferrer');
  }, true);
});

/* =========================================================
   SHAREBAR – micro ottimizzazione
   ========================================================= */
(function () {
  function getShareSvgs(){
    return {
      Facebook: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.9981 11.9991C23.9981 5.37216 18.626 0 11.9991 0C5.37216 0 0 5.37216 0 11.9991C0 17.9882 4.38789 22.9522 10.1242 23.8524V15.4676H7.07758V11.9991H10.1242V9.35553C10.1242 6.34826 11.9156 4.68714 14.6564 4.68714C15.9692 4.68714 17.3424 4.92149 17.3424 4.92149V7.87439H15.8294C14.3388 7.87439 13.8739 8.79933 13.8739 9.74824V11.9991H17.2018L16.6698 15.4676H13.8739V23.8524C19.6103 22.9522 23.9981 17.9882 23.9981 11.9991Z"/></svg>`,
      X: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.4l-5-6.5L6 22H2.8l7.3-8.4L.8 2h6.6l4.5 5.9L18.9 2zm-1.1 18h1.7L7.5 3.9H5.7L17.8 20z"/></svg>`,
      LinkedIn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`,
      WhatsApp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>`,
      Telegram: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.91 3.79L20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73z"/></svg>`,
      Bluesky: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.6c.8-1.6 3-4.8 5-6.3 1.9-1.4 3.9-1.5 4.5-.6.6 1 .2 3-1.2 4.8-1.3 1.7-3.2 3.2-5.1 4.1 1.9.9 3.8 2.4 5.1 4.1 1.4 1.8 1.8 3.8 1.2 4.8-.6.9-2.6.8-4.5-.6-2-1.5-4.2-4.7-5-6.3-.8 1.6-3 4.8-5 6.3-1.9 1.4-3.9 1.5-4.5.6-.6-1-.2-3 1.2-4.8 1.3-1.7 3.2-3.2 5.1-4.1-1.9-.9-3.8-2.4-5.1-4.1C1.8 8.8 1.4 6.8 2 5.8c.6-.9 2.6-.8 4.5.6 2 1.5 4.2 4.7 5 6.3z"/></svg>`,
      Pinterest: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg>`,
      Copy: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H6c-1.1 0-2 .9-2 2v12h2V3h10V1zm3 4H10c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H10V7h9v14z"/></svg>`
    };
  }

  function getShareEndpoints(url, title, shareText){
    return [
      { name: 'Facebook',  href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
      { name: 'X',         href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
      { name: 'LinkedIn',  href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
      { name: 'WhatsApp',  href: `https://wa.me/?text=${encodeURIComponent(shareText)}` },
      { name: 'Telegram',  href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}` },
      { name: 'Bluesky',   href: `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}` },
      { name: 'Pinterest', href: `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}` }
    ];
  }

  function makeIconLink(item, svgMap){
    const a = document.createElement('a');
    a.className = 'onl-sharebar__btn';
    a.href = item.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', `Condividi su ${item.name}`);
    a.setAttribute('data-label', item.name);
    a.innerHTML = svgMap[item.name] || '';
    return a;
  }

  function buildShareBar(contentEl, opts){
    const url = opts.url;
    const title = opts.title;
    const shareText = opts.shareText;

    const useNativeShare =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      window.matchMedia('(max-width: 768px)').matches;

    const wrap = document.createElement('section');
    wrap.className = 'onl-sharebar';
    wrap.setAttribute('aria-label', 'Condividi questo articolo');

    if (useNativeShare) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'onl-sharebar__native';
      btn.textContent = 'Condividi';
      btn.addEventListener('click', async () => {
        try { await navigator.share({ title, text: title, url }); } catch (_) {}
      });
      wrap.appendChild(btn);
      contentEl.appendChild(wrap);
      return wrap;
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'onl-sharebar__label';
    labelEl.textContent = 'Condividi';
    wrap.appendChild(labelEl);

    const svgMap = getShareSvgs();
    const endpoints = getShareEndpoints(url, title, shareText); /* ✅ fix bug */

    endpoints.forEach(item => wrap.appendChild(makeIconLink(item, svgMap)));

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'onl-sharebar__btn';
    copyBtn.setAttribute('aria-label', 'Copia il link');
    copyBtn.setAttribute('data-label', 'Copia link');
    copyBtn.innerHTML = svgMap.Copy;

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.style.transform = 'scale(0.95)';
        setTimeout(() => (copyBtn.style.transform = ''), 120);
      } catch {
        prompt('Copia questo link:', url);
      }
    });

    wrap.appendChild(copyBtn);
    contentEl.appendChild(wrap);
    return wrap;
  }

  window.ONL_buildShareBar = buildShareBar;
})();

/* =========================
   Share: SOLO POST (no pagine tipo Info)
   ========================= */
onlOnReady(() => {
  if (document.querySelector('.onl-sharebar')) return;
  if (!document.body.classList.contains('post-template')) return;

  const content =
    document.querySelector('.gh-content') ||
    document.querySelector('.post-content') ||
    document.querySelector('.content') ||
    document.querySelector('.gh-article') ||
    document.querySelector('article');

  if (!content) return;

  const url = window.location.href;
  const title =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title ||
    '';

  const shareText = `${title} ${url}`.trim();

  window.ONL_buildShareBar(content, { url, title, shareText });
});

/* =========================
   Safety: ripristina overflow (utile con back/forward)
   ========================= */
window.addEventListener('pageshow', () => { document.body.style.overflow = ''; });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) document.body.style.overflow = '';
});

/* =========================
   MINI PLAYER AUDIO – SOLO MOBILE
   ========================= */
onlOnReady(() => {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  if (!isMobile) return;

  const root =
    document.querySelector('.gh-content') ||
    document.querySelector('article') ||
    document.querySelector('main') ||
    document.body;

  const audios = Array.from(root.querySelectorAll('audio'));
  if (!audios.length || document.querySelector('.onl-audio-mini')) return;

  let activeAudio = null;
  let rafId = null;
  let isScrubbing = false;
  let userInteracted = false;

  const RATE_KEY = 'onl_audio_rate_v4';
  const rates = [0.75, 1, 1.25, 1.5, 2];
  let rate = Number(localStorage.getItem(RATE_KEY)) || 1;
  if (!rates.includes(rate)) rate = 1;

  const bar = document.createElement('div');
  bar.className = 'onl-audio-mini';
  bar.innerHTML = `
    <div class="onl-audio-mini__top">
      <div class="onl-audio-mini__controls">

        <button class="onl-audio-mini__btn" data-act="back" aria-label="Indietro 15 secondi">
          <svg viewBox="0 0 24 24">
            <text x="12" y="12.5" text-anchor="middle" dominant-baseline="middle">−15</text>
          </svg>
        </button>

        <button class="onl-audio-mini__btn" data-act="toggle" aria-label="Play/Pausa">
          <span data-icon="play">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </span>
          <span data-icon="pause" style="display:none">
            <svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
          </span>
        </button>

        <button class="onl-audio-mini__btn" data-act="fwd" aria-label="Avanti 15 secondi">
          <svg viewBox="0 0 24 24">
            <text x="12" y="12.5" text-anchor="middle" dominant-baseline="middle">+15</text>
          </svg>
        </button>

      </div>

      <button class="onl-audio-mini__speed" data-act="speed">1×</button>

      <button class="onl-audio-mini__btn" data-act="close" aria-label="Chiudi player">
        <svg viewBox="0 0 24 24">
          <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/>
        </svg>
      </button>
    </div>

    <div class="onl-audio-mini__title" id="onlTitle">Riproduzione audio</div>

    <div class="onl-audio-mini__seekrow">
      <span class="onl-audio-mini__time" id="onlTime">0:00</span>
      <input type="range" min="0" max="1000" value="0" class="onl-audio-mini__seek" id="onlSeek">
      <span class="onl-audio-mini__time" id="onlDur">0:00</span>
    </div>
  `;
  document.body.appendChild(bar);

  const titleEl = bar.querySelector('#onlTitle');
  const timeEl  = bar.querySelector('#onlTime');
  const durEl   = bar.querySelector('#onlDur');
  const seekEl  = bar.querySelector('#onlSeek');
  const speedBtn = bar.querySelector('[data-act="speed"]');
  const playIcon = bar.querySelector('[data-icon="play"]');
  const pauseIcon = bar.querySelector('[data-icon="pause"]');

  const fmt = t => `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;

  function sync(){
    if (!activeAudio) return;
    timeEl.textContent = fmt(activeAudio.currentTime || 0);
    durEl.textContent  = fmt(activeAudio.duration || 0);
    if (!isScrubbing && activeAudio.duration){
      seekEl.value = Math.round(activeAudio.currentTime / activeAudio.duration * 1000);
    }
    playIcon.style.display = activeAudio.paused ? '' : 'none';
    pauseIcon.style.display = activeAudio.paused ? 'none' : '';
    rafId = requestAnimationFrame(sync);
  }

  function activate(a){
    activeAudio = a;
    titleEl.textContent = a.getAttribute('data-title') || 'Riproduzione audio';
    audios.forEach(x => x.playbackRate = rate);
    speedBtn.textContent = rate + '×';
    bar.classList.add('is-visible');
    document.body.classList.add('onl-audio-mini-open');
    cancelAnimationFrame(rafId);
    sync();
  }

  audios.forEach((a,i) => {
    a.addEventListener('play', () => {
      userInteracted = true;
      audios.forEach(o => o !== a && o.pause());
      activate(a);
    });
    a.addEventListener('ended', () => {
      if (userInteracted && audios[i+1]) audios[i+1].play();
    });
  });

  seekEl.addEventListener('input', () => isScrubbing = true);
  seekEl.addEventListener('change', () => {
    if (activeAudio?.duration){
      activeAudio.currentTime = seekEl.value / 1000 * activeAudio.duration;
    }
    isScrubbing = false;
  });

  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;

    if (!activeAudio && audios[0]) activate(audios[0]);
    if (!activeAudio) return;

    const act = b.dataset.act;

    if (act === 'toggle') activeAudio.paused ? activeAudio.play() : activeAudio.pause();
    if (act === 'back') activeAudio.currentTime = Math.max(0, activeAudio.currentTime - 15);
    if (act === 'fwd') activeAudio.currentTime += 15;

    if (act === 'speed'){
      rate = rates[(rates.indexOf(rate)+1)%rates.length];
      localStorage.setItem(RATE_KEY, rate);
      audios.forEach(a => a.playbackRate = rate);
      speedBtn.textContent = rate + '×';
    }

    if (act === 'close'){
      activeAudio.pause();
      bar.classList.remove('is-visible');
      document.body.classList.remove('onl-audio-mini-open');
      cancelAnimationFrame(rafId);
    }
  });
});

/* =========================
   Footer nav: clona menu principale e lo inserisce sopra “ONlettering © …”
   + FIX SOLO QUI: "Libri" -> Amazon shop (nuova scheda)
   ========================= */
onlOnReady(() => {
  if (document.querySelector('.onl-footer-nav')) return;

  const AMAZON_SHOP_URL = 'https://www.amazon.it/shop/officine.lettering';

  const headerLinks = Array.from(document.querySelectorAll(
    'header a[href], nav a[href], .gh-head a[href], .gh-navigation a[href]'
  ))
  .filter(a => {
    const href = (a.getAttribute('href') || '').trim();
    if (!href) return false;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
    if (href.includes('#/portal') || href.includes('#/signin') || href.includes('#/signup')) return false;
    if (a.matches('.gh-head-btn, .gh-primary-btn')) return false;
    return true;
  });

  if (!headerLinks.length) return;

  const seen = new Set();
  const items = [];

  headerLinks.forEach(a => {
    try{
      const label = (a.textContent || '').replace(/\s+/g,' ').trim();
      if (!label) return;

      if (label.toLowerCase() === 'libri') {
        const key = 'libri-amazon';
        if (seen.has(key)) return;
        seen.add(key);

        items.push({
          href: AMAZON_SHOP_URL,
          label,
          external: true
        });
        return;
      }

      const u = new URL(a.getAttribute('href'), window.location.origin);
      const p = (u.pathname || '').replace(/\/+$/,'') || '/';
      if (seen.has(p)) return;
      seen.add(p);

      items.push({
        href: u.pathname + (u.search || '') + (u.hash || ''),
        label,
        external: false
      });
    } catch(e){}
  });

  if (!items.length) return;

  const nav = document.createElement('nav');
  nav.className = 'onl-footer-nav';
  nav.setAttribute('aria-label', 'Menu');

  const ul = document.createElement('ul');
  ul.className = 'onl-footer-nav__list';

  items.forEach(it => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = it.href;
    link.textContent = it.label;

    if (it.external) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }

    li.appendChild(link);
    ul.appendChild(li);
  });

  nav.appendChild(ul);

  const onlHomeLink = Array.from(document.querySelectorAll('footer a.footer-home-link'))
    .find(a => (a.textContent || '').trim() === 'ONlettering');

  const footer = document.querySelector('footer') || document.body;

  if (onlHomeLink && onlHomeLink.parentNode) {
    onlHomeLink.parentNode.insertBefore(nav, onlHomeLink.parentNode.firstChild);
  } else {
    footer.insertBefore(nav, footer.firstChild);
  }

  function normalize(path){ return (path || '').replace(/\/+$/, '') || '/'; }
  const currentPath = normalize(window.location.pathname);

  nav.querySelectorAll('a[href]').forEach(a => {
    try{
      const u = new URL(a.getAttribute('href'), window.location.origin);
      if (u.hostname === window.location.hostname &&
          normalize(u.pathname) === currentPath) {
        a.classList.add('nav-link-active');
      }
    }catch(e){}
  });

  if (document.body.classList.contains('post-template')) {
    const tagSlugs = [];
    (document.body.className || '').split(/\s+/).forEach(c => {
      if (c.indexOf('tag-') === 0 && c.length > 4) tagSlugs.push(c.slice(4));
    });

    if (tagSlugs.length) {
      nav.querySelectorAll('a[href]').forEach(a => {
        try{
          const u = new URL(a.getAttribute('href'), window.location.origin);
          if (u.hostname !== window.location.hostname) return;

          const p = normalize(u.pathname);
          tagSlugs.forEach(slug => {
            if (p === normalize('/tag/' + slug + '/')) {
              a.classList.add('nav-link-active');
            }
          });
        }catch(e){}
      });
    }
  }
});



onlOnReady(() => {
  if (document.querySelector('.onl-footer-cookie')) return;

  const footer = document.querySelector('footer');
  if (!footer) return;

  // cerca la riga "ONlettering © 2026"
  const copyright = Array.from(
    footer.querySelectorAll('p, span, div')
  ).find(el =>
    (el.textContent || '').includes('ONlettering')
  );

  if (!copyright) return;

  const cookieNote = document.createElement('p');
  cookieNote.className = 'onl-footer-cookie';
  cookieNote.textContent =
    'Questo sito utilizza esclusivamente cookie tecnici necessari al suo funzionamento. Nessuna profilazione o tracciamento.';

  // inserisce SUBITO DOPO il copyright
  copyright.insertAdjacentElement('afterend', cookieNote);
});




/* =========================================================
   ONLETTERING – SEARCH overlay (versione affinata)
   ========================================================= */
onlOnReady(() => {
  if (window.__ONL_SEARCH_INITED__) return;
  window.__ONL_SEARCH_INITED__ = true;

  (function () {
    const cfg = window.__ONLETTERING_SEARCH__;
    if (!cfg || !cfg.siteUrl || !cfg.contentApiKey) return;
    cfg.siteUrl = String(cfg.siteUrl).replace(/\/+$/, "");

    const MIN_SUGGEST_LEN = 3;
    const MAX_SUGGEST = 20;

    if (!document.getElementById("ol-search-style")) {
      const style = document.createElement("style");
      style.id = "ol-search-style";
      style.textContent = `
      .ol-search-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:none;}
      .ol-search-panel{max-width:820px;margin:6vh auto 0;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.25);}
      .ol-search-header{padding:16px 18px;border-bottom:1px solid rgba(0,0,0,.08);display:flex;gap:12px;align-items:center;}
      .ol-search-input{width:100%;font-size:18px;padding:12px 14px;border:1px solid rgba(0,0,0,.15);border-radius:12px;outline:none;}
      .ol-search-close{border:0;background:transparent;font-size:22px;cursor:pointer;opacity:.7;padding:6px 8px;}

      .ol-suggest-wrap{padding:10px 18px 0; display:none;}
      .ol-suggest-title{font-size:12px;opacity:.7;margin:0 0 8px;}
      .ol-suggest-list{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0 0 10px;list-style:none;}
      .ol-suggest-list button{
        border:1px solid rgba(0,0,0,.12);
        background:rgba(0,0,0,.03);
        padding:6px 10px;
        border-radius:999px;
        cursor:pointer;
        font-size:13px;
      }
      .ol-suggest-list button:hover{background:rgba(0,0,0,.06);}

      .ol-search-meta{padding:10px 18px;font-size:13px;opacity:.75; min-height: 1.2em;}
      .ol-search-results{list-style:none;margin:0;padding:0 6px 12px;max-height:62vh;overflow:auto;}
      .ol-search-results li a{display:block;padding:12px 12px;margin:0 12px;border-radius:12px;text-decoration:none;color:inherit;}
      .ol-search-title{font-weight:700;display:block;margin-bottom:4px;}
      .ol-search-snippet{font-size:14px;opacity:.8;}

      mark.ol-hl{padding:0 .15em;border-radius:.25em;}
      mark.ol-hit{padding:0 .12em;border-radius:.25em;}

      @media (prefers-color-scheme: dark){
        .ol-search-panel{background:#111;color:#fff;}
        .ol-search-input{background:#0b0b0b;color:#fff;border-color:rgba(255,255,255,.18);}
        .ol-search-header{border-bottom-color:rgba(255,255,255,.12);}
        .ol-suggest-list button{border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;}
        .ol-suggest-list button:hover{background:rgba(255,255,255,.10);}
      }`;
      document.head.appendChild(style);
    }

    let overlay = document.querySelector(".ol-search-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "ol-search-overlay";
      overlay.innerHTML = `
        <div class="ol-search-panel" role="dialog" aria-modal="true" aria-label="Cerca nel sito">
          <div class="ol-search-header">
            <input class="ol-search-input" id="olSearchInput" type="search" placeholder="Cerca nei contenuti…" autocomplete="off" />
            <button class="ol-search-close" id="olSearchClose" aria-label="Chiudi">×</button>
          </div>

          <div class="ol-suggest-wrap" id="olSuggestWrap">
            <p class="ol-suggest-title" id="olSuggestTitle">Suggerimenti</p>
            <ul class="ol-suggest-list" id="olSuggestList"></ul>
          </div>

          <div class="ol-search-meta" id="olSearchStatus"></div>
          <ul class="ol-search-results" id="olSearchResults"></ul>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const $input = overlay.querySelector("#olSearchInput");
    const $close = overlay.querySelector("#olSearchClose");
    const $status = overlay.querySelector("#olSearchStatus");
    const $results = overlay.querySelector("#olSearchResults");
    const $sWrap = overlay.querySelector("#olSuggestWrap");
    const $sList = overlay.querySelector("#olSuggestList");
    const $sTitle = overlay.querySelector("#olSuggestTitle");

    function openOverlay() {
      overlay.style.display = "block";
      document.documentElement.style.overflow = "hidden";
      setTimeout(() => $input.focus(), 0);
    }
    function closeOverlay() {
      overlay.style.display = "none";
      document.documentElement.style.overflow = "";
      $results.innerHTML = "";
      $input.value = "";
      hideSuggestions();
      $status.textContent = "";
    }

    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeOverlay(); });
    $close.addEventListener("click", closeOverlay);
    document.addEventListener("keydown", (e) => { if (overlay.style.display === "block" && e.key === "Escape") closeOverlay(); });

    const strip = (html="") => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const escapeHtml = (s="") => s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
    const setStatus = (msg) => { $status.textContent = msg || ""; };

    function normalizeToken(s) {
      return (s || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "");
    }

    function extractTokens(text) {
      return (text || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/g)
        .map(t => t.trim())
        .filter(t => t.length >= MIN_SUGGEST_LEN);
    }

    function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    function highlightText(text, query) {
      const tokens = Array.from(new Set((query || "").trim().split(/\s+/).filter(t => t.length >= 2)));
      if (!tokens.length) return escapeHtml(text);

      const re = new RegExp(tokens.map(escapeRegExp).join("|"), "gi");
      const safe = escapeHtml(text);
      return safe.replace(re, (m) => `<mark class="ol-hit">${m}</mark>`);
    }

    async function loadLunrIfNeeded() {
      if (window.lunr) return;
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/lunr/lunr.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      if (!window.lunr) throw new Error("Lunr non disponibile");
    }

    let indexReady = false;
    let idx = null;
    let postsCache = [];
    let byId = new Map();
    let indexingPromise = null;

    let vocab = [];
    let vocabSet = new Set();

    async function fetchPosts(limitTotal) {
      const out = [];
      let page = 1;
      const perPage = 50;

      while (out.length < limitTotal) {
        const url =
          `${cfg.siteUrl}/ghost/api/content/posts/` +
          `?key=${encodeURIComponent(cfg.contentApiKey)}` +
          `&limit=${perPage}&page=${page}` +
          `&fields=title,slug,excerpt,html`;

        const res = await fetch(url, { credentials: "omit" });
        if (!res.ok) throw new Error(`Errore Content API: HTTP ${res.status}`);

        const data = await res.json();
        const posts = data?.posts || [];
        if (!posts.length) break;

        for (const p of posts) {
          out.push({
            id: p.slug,
            title: p.title || "",
            excerpt: p.excerpt || "",
            body: strip(p.html || ""),
            url: `${cfg.siteUrl}/${p.slug}/`
          });
          if (out.length >= limitTotal) break;
        }
        page += 1;
        if (page > 200) break;
      }
      return out;
    }

    function buildVocab(posts) {
      vocabSet = new Set();
      for (const p of posts) {
        const all = `${p.title}\n${p.excerpt}\n${p.body}`;
        for (const t of extractTokens(all)) vocabSet.add(t);
      }
      vocab = Array.from(vocabSet).sort();
    }

    async function ensureIndex() {
      if (indexReady) return;
      if (indexingPromise) return indexingPromise;

      indexingPromise = (async () => {
        try {
          setStatus("Carico motore di ricerca…");
          await loadLunrIfNeeded();

          setStatus("Carico articoli…");
          postsCache = await fetchPosts(cfg.maxPosts || 300);
          byId = new Map(postsCache.map(p => [p.id, p]));

          setStatus("Creo indice…");
          idx = lunr(function () {
            this.ref("id");
            this.field("title", { boost: 10 });
            this.field("excerpt");
            this.field("body");
            this.pipeline.remove(lunr.stemmer);
            postsCache.forEach(p => this.add(p));
          });

          buildVocab(postsCache);

          indexReady = true;
          setStatus("");
        } catch (e) {
          setStatus(`Errore: ${e.message}`);
          console.error("[ONLETTERING SEARCH]", e);
        }
      })();

      return indexingPromise;
    }

    function hideSuggestions() {
      $sWrap.style.display = "none";
      $sList.innerHTML = "";
    }

    function showSuggestions(prefix, suggestions) {
      if (!suggestions.length) return hideSuggestions();
      $sTitle.textContent = `Suggerimenti per “${prefix}”`;
      $sList.innerHTML = suggestions.map(w =>
        `<li><button type="button" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button></li>`
      ).join("");
      $sWrap.style.display = "block";
    }

    function getSuggestionsForQuery(q) {
      const parts = (q || "").trim().split(/\s+/);
      const last = parts[parts.length - 1] || "";
      const lastNorm = normalizeToken(last);

      if (lastNorm.length < MIN_SUGGEST_LEN) return { prefix: last, list: [] };

      const list = [];
      for (const w of vocab) {
        if (w.startsWith(lastNorm)) {
          list.push(w);
          if (list.length >= MAX_SUGGEST) break;
        }
      }
      return { prefix: last, list };
    }

    $sList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-word]");
      if (!btn) return;
      const chosen = btn.getAttribute("data-word");
      if (!chosen) return;

      const parts = ($input.value || "").trim().split(/\s+/);
      parts[parts.length - 1] = chosen;
      $input.value = parts.join(" ") + " ";
      $input.dispatchEvent(new Event("input"));
      $input.focus();
    });

    function searchPosts(q) {
      const tokens = (q || "").trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) return [];

      try {
        const hits = idx.query(function (qb) {
          tokens.forEach(t => {
            const tt = normalizeToken(t);
            if (!tt) return;

            qb.term(tt, { fields:["title"], boost:10, wildcard: tt.length >= 3 ? lunr.Query.wildcard.TRAILING : lunr.Query.wildcard.NONE });
            qb.term(tt, { fields:["excerpt","body"], boost:1, wildcard: tt.length >= 3 ? lunr.Query.wildcard.TRAILING : lunr.Query.wildcard.NONE });
          });
        });
        return hits.map(h => byId.get(h.ref)).filter(Boolean);
      } catch {
        return [];
      }
    }

    function renderResults(items, q) {
      $results.innerHTML = "";
      if (!q) return;

      const hlParam = encodeURIComponent(q);
      const top = items.slice(0, 20);

      $results.innerHTML = top.map((p) => {
        const snippetRaw = (p.excerpt || (p.body ? (p.body.slice(0, 160) + (p.body.length > 160 ? "…" : "")) : ""));
        const url = `${p.url}?hl=${hlParam}`;

        const titleHtml = highlightText(p.title, q);
        const snippetHtml = highlightText(snippetRaw, q);

        return `
          <li>
            <a href="${url}">
              <span class="ol-search-title">${titleHtml}</span>
              <span class="ol-search-snippet">${snippetHtml}</span>
            </a>
          </li>`;
      }).join("");
    }

    function openFirstResult() {
      const first = $results.querySelector("a[href]");
      if (first) first.click();
    }

    let t = null;
    $input.addEventListener("input", () => {
      clearTimeout(t);
      const q = $input.value.trim();

      t = setTimeout(() => {
        if (!indexReady || !idx) return;

        const sug = getSuggestionsForQuery(q);
        showSuggestions(sug.prefix, sug.list);

        if (!q) {
          $results.innerHTML = "";
          setStatus("");
          return;
        }

        const items = searchPosts(q);
        renderResults(items, q);
        setStatus("");
      }, 120);
    });

    $input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        openFirstResult();
      }
    });

    document.addEventListener("click", async function (e) {
      const trigger = e.target.closest(
        ".gh-search-icon, [data-ghost-search], a[href='#/search'], a[href*='#/search'], a[href='/search/'], a[href='/search'], button[aria-label*='Search'], button[aria-label*='Cerca']"
      );
      if (!trigger) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      openOverlay();
      await ensureIndex();

      hideSuggestions();
      $results.innerHTML = "";
      $input.value = "";
      setStatus("");
    }, true);

    document.addEventListener("keydown", async function (e) {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrl && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openOverlay();
        await ensureIndex();
        hideSuggestions();
        $results.innerHTML = "";
        $input.value = "";
        setStatus("");
      }
    });

    (function highlightFromQueryParam(){
      const params = new URLSearchParams(location.search);
      const hl = (params.get("hl") || "").trim();
      if (!hl) return;

      const rawTokens = hl.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2);
      const tokens = Array.from(new Set(rawTokens));
      if (!tokens.length) return;

      function escapeRegExp2(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
      const re = new RegExp(tokens.map(escapeRegExp2).join("|"), "gi");

      const root = document.querySelector(".gh-content") ||
                   document.querySelector("article") ||
                   document.querySelector("main") ||
                   document.body;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue || node.nodeValue.trim().length === 0) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (p.closest("script, style, noscript, textarea, input, button, select, pre, code")) return NodeFilter.FILTER_REJECT;
          if (!re.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
          re.lastIndex = 0;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let firstMark = null;
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);

      nodes.forEach(node => {
        const text = node.nodeValue;
        re.lastIndex = 0;

        let last = 0;
        let match;
        const frag = document.createDocumentFragment();

        while ((match = re.exec(text)) !== null) {
          const before = text.slice(last, match.index);
          if (before) frag.appendChild(document.createTextNode(before));

          const mark = document.createElement("mark");
          mark.className = "ol-hl";
          mark.textContent = match[0];
          frag.appendChild(mark);

          if (!firstMark) firstMark = mark;
          last = match.index + match[0].length;
        }

        const after = text.slice(last);
        if (after) frag.appendChild(document.createTextNode(after));

        node.parentNode.replaceChild(frag, node);
      });

      if (firstMark) setTimeout(() => firstMark.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    })();

  })();
});

/* =========================================================
   Ghost Portal (MODAL iframe) — ONLETTERING FINAL SAFE (FIX RIGA)
   ========================================================= */
onlOnReady(() => {

  const CFG = {
    signup: {
      titleHtml: "<em>la</em> Newslettering",
      titleText: "la Newslettering",
      description:
        "Una volta al mese, appunti su lettering e fumetto tra letture, osservazioni e lavoro editoriale.",
      subDescription:
        "Iscrivendoti alla newsletter potrai commentare i post e accedere alle risorse di ONlettering.",
      emailPlaceholder: "ciao@onlettering.com"
    },
    signin: {
      titleText: "Accedi",
      description:
        "Inserisci la tua email per commentare i post e accedere alle risorse di ONlettering.",
      emailPlaceholder: "ciao@onlettering.com"
    }
  };

  function findPortalIframe(){
    return Array.from(document.querySelectorAll('iframe')).find(f => {
      const t = (f.getAttribute('title') || '').toLowerCase();
      const c = (f.className || '').toLowerCase();
      return t.includes('portal') || c.includes('gh-portal');
    });
  }

  function hashMode(){
    const h = (location.hash || '').toLowerCase();
    if (h.includes('signin')) return 'signin';
    if (h.includes('signup')) return 'signup';
    return null;
  }

  function getMode(doc){
    if (window.__ONL_PORTAL_WANTED_MODE__) return window.__ONL_PORTAL_WANTED_MODE__;
    const hm = hashMode();
    if (hm) return hm;
    try{
      if (doc.querySelector('input[type="password"]')) return 'signin';
    }catch(_){}
    return 'signup';
  }

  function setModeClass(doc, mode){
    try{
      doc.body.classList.toggle('onl-portal-is-signup', mode === 'signup');
      doc.body.classList.toggle('onl-portal-is-signin', mode === 'signin');
    }catch(_){}
  }

  function hideSignupSigninRow(doc){
    if (!doc || !doc.querySelector) return false;

    let hiddenAny = false;

    const linkCandidates = Array.from(
      doc.querySelectorAll('a[href*="signin"], a[data-portal="signin"]')
    );

    if (!linkCandidates.length) {
      doc.querySelectorAll('a').forEach(a => {
        const txt = (a.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
        if (txt === 'accedi') linkCandidates.push(a);
      });
    }

    const pickRow = (el) => {
      if (!el) return null;
      let row =
        el.closest('p') ||
        el.closest('div') ||
        el.closest('footer') ||
        el.parentElement;

      if (!row) return null;

      const dangerous = (node) =>
        !!node.querySelector?.('input[type="email"], input[name="email"], button[type="submit"], button[data-portal-button]');

      if (dangerous(row)) {
        const up = row.parentElement;
        if (up && !dangerous(up)) row = up;
        else return null;
      }
      return row;
    };

    for (const a of linkCandidates) {
      const row = pickRow(a);
      if (!row) continue;
      if (row.getAttribute('data-onl-hidden') === 'signup-signin-row') continue;

      row.style.setProperty('display', 'none', 'important');
      row.setAttribute('data-onl-hidden', 'signup-signin-row');
      hiddenAny = true;
    }

    const re = /sei\s+gi[aà]\s+iscritto/i;
    const textBlocks = Array.from(doc.querySelectorAll('p, .gh-portal-content p, footer, .gh-portal-content footer, div'));

    for (const el of textBlocks) {
      const t = (el.textContent || '').replace(/\s+/g,' ').trim();
      if (!t) continue;
      if (!re.test(t)) continue;

      if (el.querySelector && el.querySelector('input[type="email"], button[type="submit"], button[data-portal-button]')) continue;

      const row = pickRow(el) || el;
      if (!row) continue;

      if (row.querySelector && row.querySelector('input[type="email"], button[type="submit"], button[data-portal-button]')) continue;

      row.style.setProperty('display', 'none', 'important');
      row.setAttribute('data-onl-hidden', 'signup-signin-row-text');
      hiddenAny = true;
    }

    return hiddenAny;
  }

  function ensureIframeObserver(doc){
    if (!doc || !doc.documentElement) return;
    if (doc.__onl_signup_observer_attached) return;
    doc.__onl_signup_observer_attached = true;

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        try{
          if (getMode(doc) === 'signup') hideSignupSigninRow(doc);
        }catch(_){}
      });
    };

    const mo = new MutationObserver(() => schedule());
    try{
      mo.observe(doc.documentElement, { childList: true, subtree: true });
      doc.__onl_signup_observer = mo;
    }catch(_){}

    setTimeout(() => {
      try{ mo.disconnect(); }catch(_){}
      doc.__onl_signup_observer = null;
      doc.__onl_signup_observer_attached = false;
    }, 8000);
  }

  function apply(doc){
    if (!doc || !doc.documentElement) return;

    const mode = getMode(doc);
    const C = CFG[mode] || CFG.signup;

    setModeClass(doc, mode);

    if (!doc.getElementById('onl-portal-style')) {
      const st = doc.createElement('style');
      st.id = 'onl-portal-style';
      st.textContent = `
        .gh-portal-content,
        .gh-portal-content * {
          text-align: left !important;
        }

        .onl-portal-desc{
          margin:16px 0 0;
          line-height:1.45;
          opacity:.88;
        }

        .onl-portal-subdesc{
          margin:8px 0 0;
          opacity:.45;
          font-style:italic;
        }

        .gh-powered-by, a.gh-powered-by, .powered-by-ghost{
          display:none !important;
        }
      `;
      doc.head.appendChild(st);
    }

    const title =
      doc.querySelector('.gh-portal-content h1') ||
      doc.querySelector('.gh-portal-content h2') ||
      doc.querySelector('h1') ||
      doc.querySelector('h2');

    if (title) {
      if (mode === 'signup') title.innerHTML = C.titleHtml;
      else title.textContent = C.titleText || '';
      title.style.setProperty('text-align', 'left', 'important');
      title.style.setProperty('width', '100%', 'important');
    }

    const email =
      doc.querySelector('input[type="email"]') ||
      doc.querySelector('input[name="email"]') ||
      doc.querySelector('input[autocomplete="email"]') ||
      doc.querySelector('input[inputmode="email"]');

    if (email && C.emailPlaceholder) email.placeholder = C.emailPlaceholder;

    let desc = doc.querySelector('.onl-portal-desc');
    if (!desc && title) {
      desc = doc.createElement('p');
      desc.className = 'onl-portal-desc';
      title.insertAdjacentElement('afterend', desc);
    }
    if (desc) desc.textContent = C.description || '';

    if (mode === 'signup') {
      let sub = doc.querySelector('.onl-portal-subdesc');
      if (!sub && desc) {
        sub = doc.createElement('p');
        sub.className = 'onl-portal-subdesc';
        desc.insertAdjacentElement('afterend', sub);
      }
      if (sub) sub.textContent = C.subDescription || '';

      hideSignupSigninRow(doc);
      ensureIframeObserver(doc);
    } else {
      doc.querySelectorAll('.onl-portal-subdesc').forEach(e => e.remove());
    }
  }

  function run(){
    let n = 0;
    const id = setInterval(() => {
      n++;
      const iframe = findPortalIframe();
      if (iframe?.contentDocument) apply(iframe.contentDocument);
      if (iframe || n > 80) clearInterval(id);
    }, 100);
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-portal],a[href*="signin"],a[href*="signup"],a[href*="#/portal/"]');
    if (!t) return;

    const h = (t.getAttribute('href') || '').toLowerCase();
    const d = (t.getAttribute('data-portal') || '').toLowerCase();

    window.__ONL_PORTAL_WANTED_MODE__ =
      (h.includes('signin') || d === 'signin') ? 'signin' :
      (h.includes('signup') || d === 'signup') ? 'signup' : null;

    setTimeout(run, 30);
  }, true);

  window.addEventListener('hashchange', run);
  window.addEventListener('pageshow', run);

});

/* =========================
   EDGE (v1.0.0) — Nascondi "Accedi" in header (desktop + mobile)
   ========================= */
onlOnReady(() => {

  const SIGNIN_SELECTORS = [
    'a[data-portal="signin"]',
    'button[data-portal="signin"]',
    'a[href*="#/portal/signin"]',
    'a[href*="#/signin"]'
  ].join(',');

  function hideEl(el){
    if (!el) return;

    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('tabindex', '-1');

    const wrap = el.closest('li, .gh-head-member, .gh-head-link');
    if (wrap && wrap !== el) {
      wrap.style.setProperty('display', 'none', 'important');
      wrap.setAttribute('aria-hidden', 'true');
    }
  }

  function run(){
    document.querySelectorAll(SIGNIN_SELECTORS).forEach(hideEl);

    document.querySelectorAll('.gh-head-members a, .gh-head-members button').forEach(el => {
      const txt = (el.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
      const dp = (el.getAttribute('data-portal') || '').toLowerCase();
      const href = (el.getAttribute('href') || '').toLowerCase();

      const isSignin =
        txt === 'accedi' ||
        txt === 'sign in' ||
        dp === 'signin' ||
        href.includes('#/portal/signin') ||
        href.includes('#/signin');

      const isSignup =
        dp === 'signup' ||
        href.includes('#/portal/signup') ||
        href.includes('#/signup');

      if (isSignin && !isSignup) hideEl(el);
    });
  }

  run();

  let n = 0;
  const burst = setInterval(() => {
    run();
    if (++n >= 25) clearInterval(burst);
  }, 200);

  const mo = new MutationObserver(() => run());
  mo.observe(document.body, { childList: true, subtree: true });

});

/* =========================================================
   Ghost Portal — FIX robusto (2° click/3° click)
   - NON blocca click Ghost (così la modale si apre sempre)
   - Applica custom ogni volta che l'iframe Portal appare/si aggiorna
   - Forza la view desiderata cliccando i pulsanti interni (signin-switch / signup-switch)
   ========================================================= */
(function () {
  const onReady = (fn) => {
    if (typeof window.onlOnReady === "function") return window.onlOnReady(fn);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  };

  onReady(() => {
    const CFG = {
      signup: {
        titleHtml: "<em>la</em> Newslettering",
        description:
          "Una volta al mese, appunti su lettering e fumetto tra letture, osservazioni e lavoro editoriale.",
        subDescription:
          "Iscrivendoti alla newsletter potrai commentare i post e accedere alle risorse di ONlettering.",
        emailPlaceholder: "ciao@onlettering.com"
      },
      signin: {
        titleText: "Accedi",
        description:
          "Inserisci la tua email per commentare i post e accedere alle risorse di ONlettering.",
        emailPlaceholder: "ciao@onlettering.com"
      }
    };

    // quale pannello vogliamo aprire quando l'utente clicca
    // - newsletter trigger => signup
    // - eventuali link "Accedi" => signin
    window.__ONL_PORTAL_WANTED_MODE__ = window.__ONL_PORTAL_WANTED_MODE__ || null;

    function isPortalIframe(f) {
      const t = (f.getAttribute("title") || "").toLowerCase();
      const c = String(f.className || "").toLowerCase();
      const testid = String(f.dataset?.testid || "").toLowerCase();
      // escludi il trigger frame se mai fosse un iframe
      if (t.includes("portal-trigger") || c.includes("triggerbtn") || testid.includes("portal-trigger")) return false;
      return t.includes("portal") || c.includes("gh-portal") || testid.includes("portal");
    }

    function findPortalDocs() {
      const out = [];
      const iframes = Array.from(document.querySelectorAll("iframe")).filter(isPortalIframe);
      for (const f of iframes) {
        try {
          const doc = f.contentDocument || f.contentWindow?.document;
          if (!doc || !doc.documentElement) continue;
          if (!doc.querySelector(".gh-portal-content")) continue;
          out.push({ iframe: f, doc });
        } catch (_) {}
      }
      return out;
    }

    function detectMode(doc) {
      const root = doc.querySelector(".gh-portal-content");
      if (!root) return "signup";
      if (root.classList.contains("signin")) return "signin";
      if (root.classList.contains("signup")) return "signup";
      // fallback: in signin di solito appare password/oppure testi diversi
      if (doc.querySelector('input[type="password"], input[name="password"]')) return "signin";
      return "signup";
    }

    function ensureStyle(doc) {
      if (doc.getElementById("onl-portal-style")) return;
      const st = doc.createElement("style");
      st.id = "onl-portal-style";
      st.textContent = `
        .gh-portal-content,
        .gh-portal-content * { text-align:left !important; }

        .onl-portal-desc{ margin:16px 0 0; line-height:1.45; opacity:.88; }
        .onl-portal-subdesc{ margin:8px 0 0; opacity:.45; font-style:italic; }

        .gh-powered-by, a.gh-powered-by, .powered-by-ghost{ display:none !important; }
      `;
      doc.head.appendChild(st);
    }

    function hideSignupBottomRow(doc) {
      // il markup che mi hai incollato è: .gh-portal-signup-message
      const msg = doc.querySelector(".gh-portal-signup-message");
      if (msg) msg.style.setProperty("display", "none", "important");
    }

    function applyCustom(doc) {
      ensureStyle(doc);

      const mode = detectMode(doc);
      const C = CFG[mode] || CFG.signup;

      const title =
        doc.querySelector(".gh-portal-content h1") ||
        doc.querySelector(".gh-portal-content h2") ||
        doc.querySelector("h1") ||
        doc.querySelector("h2");

      if (title) {
        if (mode === "signup") title.innerHTML = CFG.signup.titleHtml;
        else title.textContent = CFG.signin.titleText;
        title.style.setProperty("text-align", "left", "important");
        title.style.setProperty("width", "100%", "important");
      }

      const email =
        doc.querySelector('input[type="email"]') ||
        doc.querySelector('input[name="email"]') ||
        doc.querySelector('input[autocomplete="email"]');

      if (email) email.placeholder = C.emailPlaceholder || "";

      let desc = doc.querySelector(".onl-portal-desc");
      if (!desc && title) {
        desc = doc.createElement("p");
        desc.className = "onl-portal-desc";
        title.insertAdjacentElement("afterend", desc);
      }
      if (desc) desc.textContent = C.description || "";

      if (mode === "signup") {
        let sub = doc.querySelector(".onl-portal-subdesc");
        if (!sub && desc) {
          sub = doc.createElement("p");
          sub.className = "onl-portal-subdesc";
          desc.insertAdjacentElement("afterend", sub);
        }
        if (sub) sub.textContent = CFG.signup.subDescription || "";
        hideSignupBottomRow(doc);
      } else {
        doc.querySelectorAll(".onl-portal-subdesc").forEach((e) => e.remove());
      }
    }

    function forceModeInsideIframe(doc, wanted) {
      const current = detectMode(doc);
      if (!wanted || current === wanted) return;

      // Se siamo su signup e vogliamo signin: clicca signin-switch
      if (wanted === "signin") {
        const btn =
          doc.querySelector('button[data-testid="signin-switch"]') ||
          doc.querySelector('button[data-test-button="signin-switch"]') ||
          Array.from(doc.querySelectorAll("button, a")).find((el) =>
            (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() === "accedi"
          );
        if (btn) btn.click();
        return;
      }

      // Se siamo su signin e vogliamo signup: clicca signup-switch (il gemello, di solito esiste)
      if (wanted === "signup") {
        const btn =
          doc.querySelector('button[data-testid="signup-switch"]') ||
          doc.querySelector('button[data-test-button="signup-switch"]') ||
          Array.from(doc.querySelectorAll("button, a")).find((el) => {
            const t = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            return t.includes("iscriviti");
          });
        if (btn) btn.click();
        return;
      }
    }

    // observer leggero sul documento principale: quando Ghost aggiunge/rimuove iframe, ri-applica
    let mainScheduled = false;
    const mainMO = new MutationObserver(() => {
      if (mainScheduled) return;
      mainScheduled = true;
      requestAnimationFrame(() => {
        mainScheduled = false;
        runBurst();
      });
    });
    mainMO.observe(document.body, { childList: true, subtree: true });

    // observer per singolo iframe doc (per i rerender interni)
    function attachIframeObserver(doc) {
      if (doc.__onlPortalObs) return;
      let scheduled = false;
      const mo = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          try {
            const wanted = window.__ONL_PORTAL_WANTED_MODE__ || "signup";
            forceModeInsideIframe(doc, wanted);
            applyCustom(doc);
          } catch (_) {}
        });
      });
      try {
        mo.observe(doc.documentElement, { childList: true, subtree: true });
        doc.__onlPortalObs = mo;
      } catch (_) {}
    }

    function runBurst() {
      let n = 0;
      const wanted = window.__ONL_PORTAL_WANTED_MODE__ || "signup";

      const id = setInterval(() => {
        n++;

        const docs = findPortalDocs();
        for (const { doc } of docs) {
          try {
            // 1) forza mode corretto (se Ghost ha aperto la view sbagliata)
            forceModeInsideIframe(doc, wanted);
            // 2) applica custom
            applyCustom(doc);
            // 3) osserva rerender interni
            attachIframeObserver(doc);
          } catch (_) {}
        }

        if (n >= 40) clearInterval(id); // ~4s
      }, 100);
    }

    // 👇 CLICK ROUTING: decidiamo SOLO "wanted mode", poi Ghost apre, poi noi sistemiamo
    document.addEventListener(
      "click",
      (e) => {
        const el = e.target.closest?.(
          ".gh-portal-triggerbtn-container[data-testid='portal-trigger-button'], " +
            "a[data-portal], button[data-portal], " +
            "a[href*='#/portal/'], a[href*='#/signin'], a[href*='#/signup']"
        );
        if (!el) return;

        const dp = (el.getAttribute("data-portal") || "").toLowerCase();
        const href = (el.getAttribute("href") || "").toLowerCase();
        const txt = (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

        const wantsSignin =
          dp === "signin" ||
          href.includes("signin") ||
          txt === "accedi";

        const wantsSignup =
          dp === "signup" ||
          href.includes("signup") ||
          el.matches(".gh-portal-triggerbtn-container") ||
          txt.includes("iscriviti");

        if (wantsSignin) window.__ONL_PORTAL_WANTED_MODE__ = "signin";
        else if (wantsSignup) window.__ONL_PORTAL_WANTED_MODE__ = "signup";
        else window.__ONL_PORTAL_WANTED_MODE__ = "signup";

        // lascia che Ghost faccia il suo, poi noi “aggiustiamo”
        setTimeout(runBurst, 30);
        setTimeout(runBurst, 200);
      },
      true
    );

    // extra: quando cambia hash / pageshow
    window.addEventListener("hashchange", () => setTimeout(runBurst, 30));
    window.addEventListener("pageshow", () => setTimeout(runBurst, 30));

    // init
    runBurst();
  });
})();




(function () {
  const MAP = {
  "pompeo": "https://www.instagram.com/p/DQPGypfjoKU/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "the-spirit": "https://www.instagram.com/p/DQNGp7kFRN2/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "chris-ware": "https://www.instagram.com/p/DQI6BWZiLBJ/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "stampare-un-fumetto": "https://www.instagram.com/p/DQHEdwSDG9I/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "logo-superman": "https://www.instagram.com/p/DQDwxflDe6p/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "habibi": "https://www.instagram.com/p/DP8QFIRDR52/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "todd-klein": "https://www.instagram.com/p/DP5hdttjqhr/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "guida-ames": "https://www.instagram.com/p/DP3pV8UjZ74/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "balloon-dinamici": "https://www.instagram.com/reel/DPos58eE7qH/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "logo-vertigo": "https://www.instagram.com/p/DP0a6IlkRzg/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "dark-knight-returns": "https://www.instagram.com/p/DPqw1qPAUg-/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "love-comic-sans": "https://www.instagram.com/p/DPk3KppFR_p/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "font-hand-lettered": "https://www.instagram.com/p/DPiY5LZCKQV/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "real-crossbusters": "https://www.instagram.com/p/DPftu-kgjzG/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "fontastici-4": "https://www.instagram.com/p/DPS1lgDk4w3/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "creare-una-pipetta": "https://www.instagram.com/reel/DPv7viiDoSn/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "3-graphic-designer": "https://www.instagram.com/p/DPx7DZZji5H/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==",
  "asterios-polyp": "https://www.instagram.com/p/DPY6UxBiDks/?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA=="
};

  const IGNORE_SEL = '[data-portal], .gh-portal-trigger, [class*="newsletter"], [class*="subscribe"], [class*="members"], form, input, button, textarea, select';

  function normalizePath(href) {
    try {
      const u = new URL(href, location.origin);
      if (u.origin !== location.origin) return null;
      let p = u.pathname;
      if (!p.endsWith("/")) p += "/";
      return p;
    } catch {
      return null;
    }
  }

  function installForSlug(slug, igUrl) {
    const wanted = "/" + slug.replace(/^\/|\/$/g, "") + "/";

    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter(a => normalizePath(a.getAttribute("href")) === wanted);

    links.forEach(a => {
      // Prova a sistemare anche il link
      a.setAttribute("href", igUrl);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");

      // Overlay-safe: aggancia al contenitore card
      const card = a.closest("article");
      if (!card) return;

      if (card.dataset.outboundInstalled === slug) return;
      card.dataset.outboundInstalled = slug;

      card.style.cursor = "pointer";

      card.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest(IGNORE_SEL)) return;

        const clickedLink = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (clickedLink) {
          const p = normalizePath(clickedLink.getAttribute("href"));
          if (p && p !== wanted) return;
        }

        e.preventDefault();
        e.stopPropagation();
        window.open(igUrl, "_blank", "noopener,noreferrer");
      }, true);
    });

     
  }

  function run() {
    Object.entries(MAP).forEach(([slug, ig]) => installForSlug(slug, ig));
  }

  // molto importante con defer: DOMContentLoaded può già essere passato
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();



(function () {
  "use strict";

  const DESKTOP_MQ = "(min-width: 769px)";

  function qs(sel, root = document) { return root.querySelector(sel); }

  function getHead() {
    return qs("#gh-head") || qs(".gh-head");
  }

  function getActions(head) {
    return qs(".gh-head-actions", head) || qs(".gh-head-right", head) || head;
  }

  function getNavList(head) {
    const nav =
      qs("nav.gh-head-menu", head) ||
      qs(".gh-head-menu", head) ||
      qs(".gh-head-nav", head) ||
      qs("nav", head);
    return nav ? qs("ul", nav) : null;
  }

  // ----- SEARCH + NEWSLETTER move (solo desktop) -----
  function findSearchTrigger(head) {
    return (
      qs('button[aria-label*="earch" i]', head) ||
      qs('a[aria-label*="earch" i]', head) ||
      qs(".gh-search", head) ||
      qs(".gh-head-search", head) ||
      qs(".gh-search-toggle", head) ||
      qs(".gh-head-search-toggle", head)
    );
  }

  function findNewsletterTrigger(head) {
    return (
      qs('a[href*="subscribe"]', head) ||
      qs('a[href*="newsletter"]', head) ||
      qs('button[aria-label*="subscribe" i]', head) ||
      qs('button[aria-label*="newsletter" i]', head) ||
      qs(".gh-head-btn", head) ||
      qs(".gh-btn", head)
    );
  }

  function ensureLi(ul, key) {
    let li = qs(`li[data-${key}="1"]`, ul);
    if (!li) {
      li = document.createElement("li");
      li.setAttribute(`data-${key}`, "1");
    }
    return li;
  }

  function moveIntoMenuDesktop(head) {
    const ul = getNavList(head);
    if (!ul) return;

    const search = findSearchTrigger(head);
    if (search) {
      const liS = ensureLi(ul, "nav-search");
      liS.appendChild(search);
      ul.appendChild(liS);
    }

    const news = findNewsletterTrigger(head);
    if (news) {
      const liN = ensureLi(ul, "nav-newsletter");
      const searchLi = qs('li[data-nav-search="1"]', ul);
      if (searchLi && searchLi.nextSibling) ul.insertBefore(liN, searchLi.nextSibling);
      else ul.appendChild(liN);
      liN.appendChild(news);
    }
  }

  function restoreOnMobile(head) {
    const ul = getNavList(head);
    if (!ul) return;

    const actions = getActions(head);

    const movedSearch = qs('li[data-nav-search="1"] *', ul);
    const movedNews   = qs('li[data-nav-newsletter="1"] *', ul);

    if (movedSearch) actions.appendChild(movedSearch);
    if (movedNews) actions.appendChild(movedNews);

    const liS = qs('li[data-nav-search="1"]', ul);
    const liN = qs('li[data-nav-newsletter="1"]', ul);
    if (liS) liS.remove();
    if (liN) liN.remove();
  }

  // ----- APPLY (solo Search + Newsletter; niente sottotitolo accanto al logo) -----
  function applyAll() {
    const head = getHead();
    if (!head) return;

    const isDesktop = window.matchMedia(DESKTOP_MQ).matches;
    if (isDesktop) moveIntoMenuDesktop(head);
    else restoreOnMobile(head);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyAll);
  } else {
    applyAll();
  }

  setTimeout(applyAll, 300);
  setTimeout(applyAll, 1200);
  window.addEventListener("resize", applyAll);
})();



