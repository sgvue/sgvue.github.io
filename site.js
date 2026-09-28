/*
 * SGVue site. Three jobs, no tracking, no cookies, no third parties but GitHub's release API:
 *  1. the light / dark toggle (remembered in localStorage);
 *  2. point every download button at the newest release's setup .exe (cached 10 min per tab);
 *  3. ?v=<installed version> — the app's Help › Check for updates — says whether it is current.
 * Loaded in <head> so the theme is set before first paint; the rest waits for the DOM.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  /* ── 1. theme ─────────────────────────────────────────────────────────── */
  var THEME_KEY = 'sgvue.theme';
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function chosenTheme() {
    try {
      var t = window.localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : null;
    } catch (e) {
      return null;
    }
  }
  function theme() {
    return chosenTheme() || (dark && dark.matches ? 'dark' : 'light');
  }
  function labelToggle() {
    var b = document.getElementById('theme');
    if (!b) return;
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    b.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    b.title = 'Switch to ' + next + ' theme';
  }
  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    labelToggle();
  }
  applyTheme(theme());
  if (dark && dark.addEventListener) {
    dark.addEventListener('change', function () {
      if (!chosenTheme()) applyTheme(theme());
    });
  }

  /* ── 2. the newest release ────────────────────────────────────────────── */
  var API = 'https://api.github.com/repos/sgvue/releases/releases/latest';
  var LATEST_PAGE = 'https://github.com/sgvue/releases/releases/latest';
  var ALL_RELEASES = 'https://github.com/sgvue/releases/releases';
  var DOWNLOAD_PREFIX = 'https://github.com/sgvue/releases/releases/download/';
  var SETUP = /^SGVue-.*-setup\.exe$/;
  var CACHE_KEY = 'sgvue.latest.v1';
  var TTL = 10 * 60 * 1000;

  // semver.org's own pattern: MAJOR.MINOR.PATCH, optional -pre.release and +build.
  var SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

  function parse(v) {
    if (typeof v !== 'string' || v.length > 64) return null;
    var m = SEMVER.exec(v);
    return m ? { core: [m[1], m[2], m[3]], pre: m[4] ? m[4].split('.') : [] } : null;
  }
  // Digit strings with no leading zeros (the pattern guarantees it): longer is larger.
  function cmpDigits(a, b) {
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  /** -1, 0 or 1, by semver.org §11: 1.1.0-beta.4 < 1.1.0-beta.10 < 1.1.0 < 1.1.1. Build metadata is ignored. */
  function compare(a, b) {
    var c, i;
    for (i = 0; i < 3; i++) {
      c = cmpDigits(a.core[i], b.core[i]);
      if (c) return c;
    }
    if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0;
    for (i = 0; ; i++) {
      if (i === a.pre.length || i === b.pre.length) return a.pre.length === b.pre.length ? 0 : i === a.pre.length ? -1 : 1;
      var x = a.pre[i];
      var y = b.pre[i];
      var xn = /^\d+$/.test(x);
      var yn = /^\d+$/.test(y);
      if (xn && yn) c = cmpDigits(x, y);
      else if (xn || yn) c = xn ? -1 : 1;
      else c = x < y ? -1 : x > y ? 1 : 0;
      if (c) return c;
    }
  }

  // Only what the page shows is kept: never the rest of the API's answer.
  function valid(r) {
    return !!r && typeof r.v === 'string' && !!parse(r.v) && typeof r.url === 'string' &&
      r.url.indexOf(DOWNLOAD_PREFIX) === 0 && typeof r.size === 'number' && r.size >= 0;
  }
  function pick(json) {
    if (!json || typeof json.tag_name !== 'string' || !Array.isArray(json.assets)) return null;
    var v = json.tag_name.replace(/^v/, '');
    for (var i = 0; i < json.assets.length; i++) {
      var a = json.assets[i];
      if (a && typeof a.name === 'string' && SETUP.test(a.name)) {
        var r = { v: v, url: a.browser_download_url, size: typeof a.size === 'number' ? a.size : 0 };
        return valid(r) ? r : null;
      }
    }
    return null;
  }
  function cached() {
    try {
      var c = JSON.parse(window.sessionStorage.getItem(CACHE_KEY) || 'null');
      var age = c && typeof c.t === 'number' ? Date.now() - c.t : -1;
      return age >= 0 && age < TTL && valid(c.r) ? c.r : null;
    } catch (e) {
      return null;
    }
  }
  function remember(r) {
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), r: r }));
    } catch (e) {
      /* storage blocked: fine, just no cache */
    }
  }
  /** The newest release as { v, url, size }, or null — never throws. */
  function latest() {
    var hit = cached();
    if (hit) return Promise.resolve(hit);
    if (!window.fetch) return Promise.resolve(null);
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : 0;
    return window.fetch(API, { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        var r = pick(json);
        if (r) remember(r);
        return r;
      })
      .catch(function () { return null; })
      .then(function (r) {
        clearTimeout(timer);
        return r;
      });
  }

  function megabytes(bytes) {
    var mb = bytes / 1048576;
    return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + ' MB';
  }
  function each(sel, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), fn);
  }
  function showRelease(r) {
    each('[data-download]', function (a) { a.href = r.url; });
    each('[data-release]', function (el) {
      el.textContent = 'SGVue ' + r.v + (r.size ? ' · ' + megabytes(r.size) : '');
    });
  }

  /* ── 3. ?v= — the update check ────────────────────────────────────────── */
  /** The installed version from ?v=, only when it is strict semver; anything else is ignored. */
  function installed() {
    try {
      var v = new URLSearchParams(window.location.search).get('v');
      return v !== null && parse(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  var ICON_OK = 'M5 13l4.5 4.5L19 7';
  var ICON_UP = 'M12 20V8M7.5 12.5 12 8l4.5 4.5M5 4h14';
  function icon(d) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }
  function link(href, text, cls) {
    var a = el('a', cls, text);
    a.href = href;
    return a;
  }

  /** Every string here reaches the page through textContent, never as HTML. */
  function banner(kind, have, r, ahead) {
    var box = document.getElementById('update');
    if (!box) return;
    box.textContent = '';
    box.className = 'banner ' + kind;
    var msg = el('div', 'msg');
    var body = el('div');
    if (kind === 'wait') {
      body.appendChild(el('span', null, 'Checking for a newer version than SGVue ' + have + '…'));
    } else if (kind === 'ok') {
      msg.appendChild(icon(ICON_OK));
      body.appendChild(el('strong', null, 'You’re up to date — SGVue ' + have));
      if (ahead) body.appendChild(el('span', 'note', ' · newer than the latest release, ' + r.v));
    } else if (kind === 'update') {
      msg.appendChild(icon(ICON_UP));
      body.appendChild(el('strong', null, 'Update available: SGVue ' + r.v + ' (you have ' + have + ')'));
      body.appendChild(el('span', 'note', r.size ? ' · ' + megabytes(r.size) + ' · ' : ' · '));
      body.appendChild(link(LATEST_PAGE, 'What’s new'));
    } else {
      body.appendChild(el('span', 'note', 'You have SGVue ' + have + '. The newest version could not be checked just now — '));
      body.appendChild(link(ALL_RELEASES, 'see all releases'));
      body.appendChild(el('span', 'note', '.'));
    }
    msg.appendChild(body);
    box.appendChild(msg);
    if (kind === 'update') {
      var btn = link(r.url, 'Download SGVue ' + r.v, 'btn');
      btn.setAttribute('data-download', '');
      box.appendChild(btn);
    }
    box.hidden = false;
  }

  function start() {
    labelToggle();
    var toggle = document.getElementById('theme');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try {
          window.localStorage.setItem(THEME_KEY, next);
        } catch (e) {
          /* not remembered, still switched */
        }
        applyTheme(next);
      });
    }

    var have = document.getElementById('update') ? installed() : null;
    if (!have && !document.querySelector('[data-download]')) return; // e.g. the 404 page: no API call
    if (have) banner('wait', have);
    latest().then(function (r) {
      if (r) showRelease(r);
      if (!have) return;
      if (!r) return banner('unknown', have);
      var c = compare(parse(have), parse(r.v));
      banner(c < 0 ? 'update' : 'ok', have, r, c > 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
