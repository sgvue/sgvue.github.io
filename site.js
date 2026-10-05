/*
 * SGVue site — the page's own script. No tracking, no cookies, no third party but GitHub's
 * release API. Deferred: the page is complete without it, and it only adds to what is there.
 *
 *  1. the light / dark toggle (the theme itself is set by theme.js, before first paint);
 *  2. the newest release: its files for Windows and for a Mac, by name (cached 10 minutes per tab);
 *  3. the visitor's computer, and the one file for it: the download buttons, the version and
 *     size, the checksum and the command that checks it, the install steps, the title block;
 *  4. ?v=<installed version> — the app's Help › Check for updates — says whether it is current;
 *  5. the sheet's furniture: the bar, the storey ladder, the live dimensions, the backdrop;
 *  6. the tour's stage; 7. the copy buttons; 8. "Will it run on this PC?".
 *
 * Every string that comes from the network or from the browser reaches the page through
 * textContent, never as HTML. What the browser says about the computer is read here, used
 * here, and neither stored nor sent.
 */
(function () {
  'use strict';

  var S = (window.SGVue = window.SGVue || {});
  var doc = document;
  var root = doc.documentElement;

  function byId(id) {
    return doc.getElementById(id);
  }
  function each(sel, fn, scope) {
    Array.prototype.forEach.call((scope || doc).querySelectorAll(sel), fn);
  }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function still() {
    return !!(S.still && S.still());
  }
  /** `1234567` → `1 234 567`, grouped with thin spaces, as the app writes its millimetres. */
  function thin(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  S.thin = thin;

  /* ── 1. theme ─────────────────────────────────────────────────────────── */
  function labelToggle() {
    var b = byId('theme');
    if (!b || !S.theme) return;
    var next = S.theme.get() === 'dark' ? 'light' : 'dark';
    b.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    b.title = 'Switch to ' + next + ' theme';
  }
  /** A <picture> may carry a light capture: <source data-theme="light" …>. Follow the page's theme, not only the system's. */
  function themePictures() {
    if (!S.theme) return;
    var light = S.theme.get() === 'light';
    each('source[data-theme]', function (s) {
      var on = (s.getAttribute('data-theme') === 'light') === light;
      s.media = on ? 'all' : 'not all';
    });
  }

  /* ── 2. the newest release ────────────────────────────────────────────── */
  var API = 'https://api.github.com/repos/sgvue/releases/releases/latest';
  var LATEST_PAGE = 'https://github.com/sgvue/releases/releases/latest';
  var ALL_RELEASES = 'https://github.com/sgvue/releases/releases';
  // A file is offered only from GitHub's own download folder for these releases, as the browser
  // reads the address — so neither `..`, `%2e%2e` nor `\` can lead out of it (downloadUrl).
  var DOWNLOAD_ORIGIN = 'https://github.com';
  var DOWNLOAD_PATH = '/sgvue/releases/releases/download/';
  // A release's files, by the names `npm run dist:win` / `dist:mac` give them: Windows, a Mac with
  // Apple silicon, an Intel Mac, either Mac. A name goes into a command the visitor copies, so it
  // may hold nothing but these characters; a file named otherwise is not offered.
  var FILES = {
    win: /^SGVue-[0-9A-Za-z.+-]{1,40}-setup\.exe$/,
    arm: /^SGVue-[0-9A-Za-z.+-]{1,40}-arm64\.dmg$/,
    x64: /^SGVue-[0-9A-Za-z.+-]{1,40}-x64\.dmg$/,
    uni: /^SGVue-[0-9A-Za-z.+-]{1,40}-universal\.dmg$/
  };
  var HEX64 = /^[0-9a-f]{64}$/;
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  var CACHE_KEY = 'sgvue.latest.v3';
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

  function own(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }
  /** A file's address as the browser reads it, normalised — or null unless it is on GitHub's own
   *  origin (DOWNLOAD_ORIGIN), with no user name, and its path is under DOWNLOAD_PATH. */
  function downloadUrl(u) {
    var p = null;
    try {
      p = typeof u === 'string' && typeof URL === 'function' ? new URL(u) : null;
    } catch (e) {
      p = null;
    }
    return p && p.origin === DOWNLOAD_ORIGIN && !p.username && !p.password && p.pathname.indexOf(DOWNLOAD_PATH) === 0 ? p.href : null;
  }
  /** One file of a release: { name, url, size, sha? } — only under GitHub's own download address. */
  function fileOf(a, kind) {
    if (!a || typeof a.name !== 'string' || !FILES[kind].test(a.name)) return null;
    var url = downloadUrl(a.browser_download_url);
    if (!url) return null;
    var f = { name: a.name, url: url, size: typeof a.size === 'number' && a.size >= 0 ? a.size : 0 };
    // GitHub states each file's SHA-256 as `digest: "sha256:<64 hex>"`.
    var d = typeof a.digest === 'string' ? /^sha256:([0-9a-f]{64})$/.exec(a.digest) : null;
    if (d) f.sha = d[1];
    return f;
  }
  /** The API's answer, cut down to { v, date?, files: { win?, arm?, x64?, uni? } } — or null when it offers nothing. */
  function release(json) {
    if (!json || typeof json.tag_name !== 'string' || !Array.isArray(json.assets)) return null;
    var r = { v: json.tag_name.replace(/^v/, ''), files: {} };
    var day = typeof json.published_at === 'string' ? json.published_at.slice(0, 10) : '';
    if (DAY.test(day)) r.date = day;
    json.assets.forEach(function (a) {
      Object.keys(FILES).forEach(function (kind) {
        var f = r.files[kind] ? null : fileOf(a, kind);
        if (f) r.files[kind] = f;
      });
    });
    return valid(r) ? r : null;
  }
  // Only what the page shows is kept: never the rest of the API's answer. A cached copy is checked again.
  function valid(r) {
    if (!r || typeof r.v !== 'string' || !parse(r.v) || !r.files || typeof r.files !== 'object') return false;
    if (r.date !== undefined && !(typeof r.date === 'string' && DAY.test(r.date))) return false;
    var kinds = Object.keys(r.files);
    return kinds.length > 0 && kinds.every(function (kind) {
      var f = r.files[kind];
      return own(FILES, kind) && !!f && typeof f.name === 'string' && FILES[kind].test(f.name) &&
        downloadUrl(f.url) === f.url && typeof f.size === 'number' && f.size >= 0 &&
        (f.sha === undefined || (typeof f.sha === 'string' && HEX64.test(f.sha)));
    });
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
  /** The newest release (see release()), or null — never throws. */
  function latest() {
    var hit = cached();
    if (hit) return Promise.resolve(hit);
    if (!window.fetch) return Promise.resolve(null);
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : 0;
    return window.fetch(API, { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        var r = release(json);
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
  function setText(sel, text) {
    each(sel, function (n) { n.textContent = text; });
  }

  /* ── 3. the visitor's computer, and the one file for it ─────────────────── */
  /*
   * What the browser says about the computer: read once, used here, never stored or sent.
   *  · navigator.userAgentData (Chromium): the platform, a phone or not, and on request the
   *    processor — "arm" on Windows on Arm and on Apple silicon, "x86" on Intel and AMD.
   *  · the user-agent string, everywhere. A Mac's says "Intel Mac OS X" on Apple silicon too, so it
   *    never tells the chip; an iPad asks for the desktop site as "Macintosh", with a touch screen.
   *  · on a Mac whose browser has not named the processor, the WebGL renderer: Firefox names the
   *    graphics ("Apple M1, or similar"), and Apple silicon has only Apple's own; Safari says
   *    "Apple GPU" on every Mac, which tells nothing.
   */
  var signals = null;
  function readSignals() {
    if (signals) return signals;
    var nav = window.navigator || {};
    var uad = nav.userAgentData;
    var s = { ua: String(nav.userAgent || ''), platform: '', mobile: false, arch: '', bits: '', version: '', touch: Number(nav.maxTouchPoints) || 0, gpu: '' };
    var asked = Promise.resolve();
    if (uad && typeof uad === 'object') {
      if (typeof uad.platform === 'string') s.platform = uad.platform;
      s.mobile = uad.mobile === true;
      if (typeof uad.getHighEntropyValues === 'function') {
        asked = new Promise(function (ok) { ok(uad.getHighEntropyValues(['architecture', 'bitness', 'platformVersion'])); })
          .then(function (h) {
            if (!h) return;
            if (h.architecture === 'arm' || h.architecture === 'x86') s.arch = h.architecture;
            if (h.bitness === '64' || h.bitness === '32') s.bits = h.bitness;
            if (typeof h.platformVersion === 'string') s.version = h.platformVersion;
          })
          .catch(function () { /* declined: the rest still counts */ });
      }
    }
    signals = asked.then(function () {
      if (!s.arch && computer(s).os === 'mac') s.gpu = webgl('webgl').name;
      return s;
    });
    return signals;
  }

  /**
   * The computer, from those signals: { os, chip, sure }. A pure function, tested beside the page.
   *   os    'windows' · 'mac' · 'linux' · 'chromeos' · 'android' · 'ios' · 'phone' · '' (cannot tell)
   *   chip  'x86' or 'arm', for Windows and a Mac — a best guess while `sure` is false
   *   sure  whether the browser itself named the processor
   */
  function computer(s) {
    var ua = String(s.ua || '');
    var p = String(s.platform || '').toLowerCase();
    var os = '';
    if (p === 'windows' || /Windows NT/.test(ua)) os = 'windows';
    else if (p === 'android' || /Android/.test(ua)) os = 'android';
    else if (p === 'macos') os = 'mac';
    else if (p === 'ios' || /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && s.touch > 1)) os = 'ios';
    else if (/Macintosh|Mac OS X/.test(ua)) os = 'mac';
    else if (p === 'chrome os' || p === 'chromium os' || /CrOS/.test(ua)) os = 'chromeos';
    else if (p === 'linux' || /Linux|X11/.test(ua)) os = 'linux';
    // A browser that says it is on a phone is on a phone, whatever else it says.
    if (s.mobile && os !== 'android' && os !== 'ios') os = 'phone';
    var c = { os: os, chip: '', sure: false };
    if (os !== 'windows' && os !== 'mac') return c;
    var gpu = String(s.gpu || '');
    if (s.arch === 'arm' || s.arch === 'x86') {
      c.chip = s.arch;
      c.sure = true;
    } else if (os === 'windows' && /\b(ARM64|aarch64)\b/i.test(ua)) {
      c.chip = 'arm';
      c.sure = true;
    } else if (os === 'mac' && /\bApple M\d/.test(gpu)) {
      c.chip = 'arm';
      c.sure = true;
    } else if (os === 'mac' && /\b(Intel|AMD|Radeon|NVIDIA|GeForce)\b/i.test(gpu)) {
      c.chip = 'x86';
      c.sure = true;
    } else {
      // Not told. A Windows PC is most likely Intel or AMD; every Mac sold since 2023 has Apple silicon.
      c.chip = os === 'mac' ? 'arm' : 'x86';
    }
    return c;
  }

  /**
   * Which file of the release is this computer's. A pure function, tested beside the page.
   *   { kind, file, alt }  kind 'win' · 'arm' · 'x64' · 'uni'; alt, the Intel disk image when a
   *                        Mac's chip was not told
   *   { kind: '', why, want, alt }  no button. why: 'mac' (nothing for this Mac yet; want names the
   *                        kind missing when the other is out), 'desktop' (phone, tablet, Linux,
   *                        ChromeOS), 'win' (no Windows file), '' (cannot tell: the page's link stays)
   */
  function choose(files, c) {
    files = files || {};
    if (c.os === 'windows') return files.win ? { kind: 'win', file: files.win, alt: null } : { kind: '', why: 'win' };
    if (c.os === 'mac') {
      var arm = files.arm ? 'arm' : files.uni ? 'uni' : '';
      var x64 = files.x64 ? 'x64' : files.uni ? 'uni' : '';
      var kind = c.chip === 'x86' ? x64 : arm;
      var alt = !c.sure && c.chip !== 'x86' && files.x64 ? files.x64 : null;
      if (kind) return { kind: kind, file: files[kind], alt: kind === 'arm' ? alt : null };
      return { kind: '', why: 'mac', want: arm || x64 ? (c.chip === 'x86' ? 'x64' : 'arm') : '', alt: alt };
    }
    return { kind: '', why: c.os ? 'desktop' : '' };
  }
  /**
   * No answer from GitHub. The page keeps its own link to every file, which is labelled for Windows
   * — except on a Mac, where that would mislead: { kind: '', why: 'unknown' } puts a note in its
   * place, which claims nothing about what is published. null keeps the link. Pure, and tested.
   */
  function unanswered(c) {
    return c.os === 'mac' ? { kind: '', why: 'unknown' } : null;
  }
  S.platform = { computer: computer, choose: choose, unanswered: unanswered, release: release, valid: valid };

  /** A WebGL context's own name for the graphics, and then the context is let go: { ok, name }. */
  function webgl(kind) {
    var gl = null;
    try {
      gl = doc.createElement('canvas').getContext(kind);
    } catch (e) {
      gl = null;
    }
    if (!gl) return { ok: false, name: '' };
    var name = '';
    try {
      // Firefox names the card in RENDERER itself (and warns if the old extension is asked
      // for); Chromium and Safari answer "WebKit WebGL" there and keep the name in the extension.
      name = String(gl.getParameter(gl.RENDERER) || '');
      if (!name || /^(WebKit WebGL|Mozilla)$/i.test(name)) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      }
    } catch (e) {
      name = '';
    }
    try {
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) {
      /* the context goes with the canvas */
    }
    return { ok: true, name: name };
  }

  var DL = {
    win: { label: 'Download for Windows', os: 'Windows', chip: '', needs: 'Windows 10 or 11, 64-bit' },
    arm: { label: 'Download for Mac (Apple silicon)', os: 'Mac', chip: ' (Apple silicon)', needs: 'macOS 13 Ventura or later, Apple silicon' },
    x64: { label: 'Download for Mac (Intel)', os: 'Mac', chip: ' (Intel)', needs: 'macOS 13 Ventura or later, Intel' },
    uni: { label: 'Download for Mac', os: 'Mac', chip: '', needs: 'macOS 13 Ventura or later' }
  };
  function macFiles(files) {
    return [files.arm, files.x64, files.uni].filter(Boolean);
  }
  /** "Windows", "Windows and Mac": what the release has files for. */
  function systems(files) {
    var out = [];
    if (files.win) out.push('Windows');
    if (macFiles(files).length) out.push('Mac');
    return out.join(' and ') || 'Windows';
  }
  /** The one line of PowerShell that answers True or False for the published file. */
  function winCommand(f) {
    var path = '"$env:USERPROFILE\\Downloads\\' + f.name + '"';
    return f.sha
      ? '(Get-FileHash ' + path + ' -Algorithm SHA256).Hash -eq "' + f.sha.toUpperCase() + '"'
      : '(Get-FileHash ' + path + ' -Algorithm SHA256).Hash';
  }
  /** The one line for Terminal on a Mac: it prints the disk image's SHA-256. */
  function macCommand(f) {
    return 'shasum -a 256 ~/Downloads/' + f.name;
  }

  var shown = null; // what the page offers: { rel, c, pick, kind, file } — the PC check and the banner read it
  /** The newest release, for this computer: the one file for it, and the rest of the page follows
   *  that file — or the Windows file when there is no button. */
  function showRelease(rel, c) {
    var pick = choose(rel.files, c);
    var kind = pick.kind || (rel.files.win ? 'win' : '');
    var file = kind ? rel.files[kind] : null;
    var sha = file && file.sha ? file.sha : '';
    shown = { rel: rel, c: c, pick: pick, kind: kind, file: file };
    downloadArea(rel, c, pick);
    macFacts(rel.files, c);
    each('[data-os]', function (n) { n.hidden = n.getAttribute('data-os') !== (kind && kind !== 'win' ? 'mac' : 'win'); });
    // Install step 1 points at the Windows button, or — with no setup file in the release — at the releases page.
    each('[data-win-file]', function (n) { n.hidden = !rel.files.win; });
    each('[data-win-none]', function (n) { n.hidden = !!rel.files.win; });
    // GitHub has answered: the verify card shows the published SHA-256, or says it has none to compare with.
    each('[data-rel-hide]', function (n) { n.hidden = true; });
    each('[data-rel-show]', function (n) { n.hidden = !sha; });
    each('[data-rel-none]', function (n) { n.hidden = !!sha; });
    setText('[data-rel-version]', rel.v);
    if (rel.date) setText('[data-rel-date]', rel.date);
    if (rel.files.win && rel.files.win.size) setText('[data-win-size]', megabytes(rel.files.win.size));
    if (!file) return;
    if (file.size) setText('[data-rel-size]', megabytes(file.size));
    setText('[data-rel-file]', file.name);
    var cmd = byId(kind === 'win' ? 'v-cmd' : 'v-cmd-mac');
    if (cmd) cmd.textContent = kind === 'win' ? winCommand(file) : macCommand(file);
    if (sha) {
      setText('[data-rel-sha]', sha);
      setText('[data-rel-sha-short]', sha.slice(0, 16) + '…' + sha.slice(-8));
    }
  }

  /** The hero's button, the bar's, the version line under them, and the one or two lines in between.
   *  `rel` is null for unanswered()'s note, which reads nothing from it. */
  function downloadArea(rel, c, pick) {
    var cta = byId('cta');
    var note = byId('dl-note');
    var sub = byId('dl-sub');
    var meta = byId('dl-meta');
    if (!cta || !note || !sub) return;
    note.textContent = '';
    sub.textContent = '';
    if (pick.kind) {
      var d = DL[pick.kind];
      each('[data-download]', function (a) { a.href = pick.file.url; });
      setText('[data-dl-label]', d.label);
      setText('[data-dl-os]', d.os);
      setText('[data-dl-chip]', d.chip);
      setText('[data-release]', 'SGVue ' + rel.v + (pick.file.size ? ' · ' + megabytes(pick.file.size) : ''));
      if (pick.kind !== 'win') setText('[data-req-line]', d.needs);
      if (pick.kind === 'win' && c.chip === 'arm' && c.sure) {
        note.textContent = 'SGVue is built for 64-bit Intel and AMD PCs and has not been tried on Arm.';
        note.hidden = false;
      }
    } else {
      if (!pick.why) return; // the computer cannot be told: the page's own link to every file stays
      cta.hidden = true;
      if (meta) meta.hidden = true;
      each('.bar-dl, .bar-rel', function (n) { n.hidden = true; });
      var lead = pick.why === 'mac'
        ? pick.want === 'arm' ? 'SGVue for Macs with Apple silicon is not published yet.'
          : pick.want === 'x64' ? 'SGVue for Intel Macs is not published yet.'
          : 'SGVue for Mac is not published yet.'
        : pick.why === 'win' ? 'The latest release has no installer for Windows.'
        : pick.why === 'unknown' ? 'Whether there is a download for a Mac could not be checked just now.'
        : 'SGVue is a desktop app, published for ' + systems(rel.files) + '.';
      note.appendChild(el('strong', null, lead));
      note.appendChild(doc.createTextNode(' Every published version is on the '));
      note.appendChild(link(ALL_RELEASES, 'releases page'));
      note.appendChild(doc.createTextNode('.'));
      note.classList.add('is-alone');
      note.hidden = false;
    }
    // Quiet lines under the button: the Intel disk image when this Mac's chip was not told, and
    // always the latest release's page, for anyone this guessed wrong.
    if (pick.alt) {
      var intel = el('span', 'dl-line', 'Intel Mac? ');
      intel.appendChild(link(pick.alt.url, 'Download the Intel version'));
      sub.appendChild(intel);
    }
    if (pick.kind) {
      var other = el('span', 'dl-line');
      other.appendChild(link(LATEST_PAGE, 'Other downloads'));
      sub.appendChild(other);
    }
    sub.hidden = !sub.firstChild;
  }

  /** What holds once the latest release has a disk image, whoever is looking: the requirement row, its size, the FAQ, the Mac check. */
  function macFacts(files, c) {
    var mac = macFiles(files);
    if (!mac.length) return;
    each('[data-mac-only]', function (n) { n.hidden = false; });
    var on = files.uni || (files.arm && files.x64) ? 'on Apple silicon or an Intel processor'
      : files.arm ? 'on a Mac with Apple silicon' : 'on a Mac with an Intel processor';
    setText('[data-mac-needs]', 'macOS 13 Ventura or later, ' + on + '.');
    var big = Math.max.apply(null, mac.map(function (f) { return f.size || 0; }));
    if (big) setText('[data-mac-size]', megabytes(big));
    var q = byId('q-mac');
    if (q) {
      q.textContent = 'Yes, for macOS 13 Ventura or later, ' + on + '. On a Mac, the button at the top of this page offers the disk image for it, and ';
      q.appendChild(link('#install', 'Install and update'));
      q.appendChild(doc.createTextNode(' says how to open SGVue the first time.'));
    }
    if (c.os === 'mac') {
      setText('#pc-h', 'Will it run on this Mac?');
      setText('#pc-run', 'Check this Mac');
      setText('#pc-col-h', 'This Mac');
      setText('#pc-fine', 'It shows what your browser reports, and a browser cannot see everything: not your free disk space, and the memory only roughly. Safari and Firefox tell neither the version of macOS nor the memory.');
    }
  }

  /* ── 4. ?v= — the update check ────────────────────────────────────────── */
  /** The installed version from ?v=, only when it is strict semver; anything else is ignored. */
  function installed() {
    try {
      var v = new URLSearchParams(window.location.search).get('v');
      return v !== null && parse(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  var ICON_OK = 'M5 13l4.5 4.5L19 7';
  var ICON_UP = 'M12 20V8M7.5 12.5 12 8l4.5 4.5M5 4h14';
  function icon(d) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = doc.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }
  function link(href, text, cls) {
    var a = el('a', cls, text);
    a.href = href;
    return a;
  }

  /**
   * Every string here reaches the page through textContent, never as HTML. An update offers the
   * same file as the download button: the one for this computer, or none.
   */
  function banner(kind, have, r, ahead) {
    var f = kind === 'update' && shown && shown.pick.kind ? shown.pick.file : null;
    var box = byId('update');
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
      body.appendChild(el('span', 'note', f && f.size ? ' · ' + megabytes(f.size) + ' · ' : ' · '));
      body.appendChild(link(LATEST_PAGE, 'What’s new'));
    } else {
      body.appendChild(el('span', 'note', 'You have SGVue ' + have + '. The newest version could not be checked just now — '));
      body.appendChild(link(ALL_RELEASES, 'see all releases'));
      body.appendChild(el('span', 'note', '.'));
    }
    msg.appendChild(body);
    box.appendChild(msg);
    if (f) {
      var btn = link(f.url, 'Download SGVue ' + r.v, 'btn btn-s');
      btn.setAttribute('data-download', '');
      box.appendChild(btn);
    }
    box.hidden = false;
    remeasure();
  }

  /* ── 5. the sheet's furniture ─────────────────────────────────────────── */
  var levels = []; // the page's storeys: { key, top, link }
  var ctaEnd = 0;
  var ticking = false;
  var barEl = null;
  var tourEnds = null; // set by the tour, once it is on its stage

  /** `−1 240`: a level below the top of the sheet, as the app writes an elevation. */
  function elevation(px) {
    var n = Math.round(px);
    return n === 0 ? '±0' : (n > 0 ? '−' : '+') + thin(Math.abs(n));
  }
  function pageTop(node) {
    return node.getBoundingClientRect().top + window.pageYOffset;
  }
  function remeasure() {
    if (!levels.length) return;
    var datum = pageTop(levels[0].node);
    levels.forEach(function (l) {
      l.top = pageTop(l.node);
      setText('[data-elev="' + l.key + '"]', elevation(l.top - datum));
    });
    var cta = byId('cta');
    ctaEnd = cta && !cta.hidden ? pageTop(cta) + cta.offsetHeight : 0;
    each('[data-measure="stage"]', function (n) {
      var st = doc.querySelector('.stage');
      n.textContent = st ? thin(st.getBoundingClientRect().width) : '';
    });
    each('[data-measure="sheet"]', function (n) {
      n.textContent = thin(root.clientWidth) + ' × ' + thin(root.scrollHeight) + ' px';
    });
    var stage = byId('tour-stage');
    if (stage && !stage.hidden) {
      var free = window.innerHeight - stage.offsetHeight;
      stage.style.setProperty('--stage-top', Math.max(76, Math.round(free / 2) + 14) + 'px');
      // The last text needs just enough room under it for the stage to stay level with it.
      var lastText = doc.querySelector('#tour-root .feat:last-child .feat-copy');
      var host = byId('tour-root');
      if (lastText && host) host.style.setProperty('--last-min', Math.ceil((stage.offsetHeight + lastText.offsetHeight) / 2 + 8) + 'px');
    }
    onScroll();
  }
  function onScroll() {
    ticking = false;
    var y = window.pageYOffset;
    if (barEl) {
      barEl.classList.toggle('is-stuck', y > 6);
      barEl.classList.toggle('has-dl', ctaEnd > 0 && y + 56 > ctaEnd);
    }
    if (tourEnds) tourEnds();
    if (!levels.length) return;
    // The storey being read: the last one whose level line is above a third of the window.
    var line = y + Math.min(window.innerHeight * 0.34, 320);
    var on = 0;
    for (var i = 0; i < levels.length; i++) if (levels[i].top <= line) on = i;
    if (y + window.innerHeight >= doc.documentElement.scrollHeight - 4) on = levels.length - 1;
    levels.forEach(function (l, i) {
      if (!l.link) return;
      if (i === on) l.link.setAttribute('aria-current', 'location');
      else l.link.removeAttribute('aria-current');
    });
    var cur = levels[on].link;
    var list = byId('ladder');
    if (cur && list) {
      list.style.setProperty('--cut-y', cur.offsetTop + 'px');
      list.style.setProperty('--cut-on', '1');
    }
  }
  function queueScroll() {
    if (ticking) return;
    ticking = true;
    if (window.requestAnimationFrame) window.requestAnimationFrame(onScroll);
    else window.setTimeout(onScroll, 16);
  }
  function furniture() {
    barEl = doc.querySelector('.bar');
    each('[data-level]', function (node) {
      var a = doc.querySelector('.ladder a[href="#' + (node.id === 'hero' ? 'top' : node.id) + '"]');
      levels.push({ key: node.id, node: node, top: 0, link: a });
    });
    window.addEventListener('scroll', queueScroll, { passive: true });
    window.addEventListener('resize', remeasure);
    window.addEventListener('load', remeasure);
    if (doc.fonts && doc.fonts.ready && doc.fonts.ready.then) doc.fonts.ready.then(remeasure);
    if (window.ResizeObserver) {
      var main = byId('main');
      if (main) new ResizeObserver(remeasure).observe(main);
    }
    remeasure();
  }

  /** The app's landing page lets the survey grid lean after the pointer. So does this one. */
  function parallax() {
    var plane = doc.querySelector('.plane');
    var glow = doc.querySelector('.glow');
    if (!plane || !glow || !window.matchMedia || !window.matchMedia('(pointer: fine)').matches) return;
    var pending = null;
    function place() {
      var e = pending;
      pending = null;
      if (!e || still()) return;
      var nx = e.x / Math.max(1, window.innerWidth) - 0.5;
      var ny = e.y / Math.max(1, window.innerHeight) - 0.5;
      plane.style.setProperty('--bgx', (-nx * 90).toFixed(1) + 'px');
      plane.style.setProperty('--bgy', (-ny * 70).toFixed(1) + 'px');
      plane.style.setProperty('--bgz', (-24 + nx * 7).toFixed(2) + 'deg');
      glow.style.setProperty('--gx', e.x.toFixed(0) + 'px');
      glow.style.setProperty('--gy', (e.y + window.pageYOffset).toFixed(0) + 'px');
    }
    window.addEventListener('pointermove', function (e) {
      if (window.pageYOffset > 900 || e.pointerType === 'touch') return;
      var first = !pending;
      pending = { x: e.clientX, y: e.clientY };
      if (first) window.requestAnimationFrame(place);
    }, { passive: true });
  }

  /* ── 6. the tour: one stage, the captures cross-fading as the text scrolls past ───── */
  function tour() {
    var host = byId('tour-root');
    var stage = byId('tour-stage');
    var frame = byId('tour-frame');
    if (!host || !stage || !frame || !window.IntersectionObserver || !window.matchMedia) return;
    var wide = window.matchMedia('(min-width: 960px)');
    var feats = Array.prototype.slice.call(host.querySelectorAll('.feat'));
    if (!feats.length) return;
    var sources = feats.map(function (f) { return f.querySelector('.feat-shot img'); });
    var texts = feats.map(function (f) { return f.querySelector('.feat-copy') || f; });
    var copies = []; // the stage's own pictures, made when one is first shown
    var key = byId('tour-key');
    var name = byId('tour-name');
    var count = byId('tour-n');
    var on = -1;
    var inBand = [];

    function fill(i) {
      var src = sources[i];
      if (!src || i < 0 || i >= feats.length) return;
      var url = src.currentSrc || src.src;
      if (!url) return;
      if (!copies[i]) {
        copies[i] = new Image();
        copies[i].alt = '';
        copies[i].decoding = 'async';
        frame.appendChild(copies[i]);
      }
      if (copies[i].getAttribute('src') !== url) copies[i].src = url;
    }
    function show(i) {
      if (i === on) return;
      on = i;
      fill(i);
      fill(i + 1);
      fill(i - 1);
      feats.forEach(function (f, k) { f.classList.toggle('is-on', k === i); });
      copies.forEach(function (c, k) { if (c) c.classList.toggle('is-on', k === i); });
      var bub = feats[i].querySelector('.bubble');
      if (key && bub) key.textContent = bub.textContent;
      if (name) name.textContent = feats[i].getAttribute('data-name') || '';
      if (count) count.textContent = i + 1 + ' / ' + feats.length;
    }
    // A thin band across the middle of the window: the text crossing it is the one on stage.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        inBand[texts.indexOf(e.target)] = e.isIntersecting;
        if (e.isIntersecting) show(texts.indexOf(e.target));
      });
    }, { rootMargin: '-46% 0px -46% 0px', threshold: 0 });
    // With nothing in the band — between two texts, or after a jump clean past the tour — the
    // stage keeps what it shows, unless the whole tour is above or below the middle of the window.
    tourEnds = function () {
      if (host.className.indexOf('is-live') < 0 || inBand.some(Boolean)) return;
      var box = host.getBoundingClientRect();
      var mid = window.innerHeight / 2;
      if (box.top > mid) show(0);
      else if (box.bottom < mid) show(feats.length - 1);
    };

    function mode() {
      var live = wide.matches;
      host.classList.toggle('is-live', live);
      stage.hidden = !live;
      texts.forEach(function (t) {
        if (live) io.observe(t);
        else io.unobserve(t);
      });
      if (live && on < 0) show(0);
      remeasure();
    }
    if (wide.addEventListener) wide.addEventListener('change', mode);
    else if (wide.addListener) wide.addListener(mode);
    if (S.theme) {
      S.theme.onChange(function () {
        // A themed <picture> picks its file after the switch; follow it on the next frame.
        window.setTimeout(function () {
          if (on >= 0) {
            fill(on);
            fill(on + 1);
            fill(on - 1);
          }
        }, 60);
      });
    }
    mode();
  }

  /* ── 7. copy buttons: they say "Copied" only when the clipboard took the text ───── */
  function legacyCopy(text) {
    var ta = el('textarea', 'clip');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(ta);
    ta.select();
    var ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    doc.body.removeChild(ta);
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return legacyCopy(text); }
      );
    }
    return Promise.resolve(legacyCopy(text));
  }
  S.copyText = copyText;
  function selectAll(node) {
    try {
      var range = doc.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {
      /* nothing selected: the text is still there to select by hand */
    }
  }
  function flash(btn, cls, text, ms) {
    var label = btn.querySelector('span') || btn;
    if (!btn.hasAttribute('data-label')) btn.setAttribute('data-label', label.textContent);
    window.clearTimeout(btn._t);
    label.textContent = text;
    btn.classList.toggle('is-ok', cls === 'ok');
    btn._t = window.setTimeout(function () {
      label.textContent = btn.getAttribute('data-label');
      btn.classList.remove('is-ok');
    }, ms);
  }
  function copyButtons() {
    var say = byId('copy-say');
    // The keys that copy by hand: Command-C on a Mac, an iPad or an iPhone; Ctrl+C everywhere else.
    var keys = /Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent || '') ? '⌘C' : 'Ctrl+C';
    doc.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-copy]') : null;
      if (!btn) return;
      var from = byId(btn.getAttribute('data-copy'));
      if (!from) return;
      copyText(from.textContent).then(function (ok) {
        if (ok) {
          flash(btn, 'ok', 'Copied', 1400); // the app's own flash
          if (say) say.textContent = 'Copied to the clipboard.';
        } else {
          selectAll(from);
          flash(btn, 'no', 'Press ' + keys, 2600);
          if (say) say.textContent = 'Could not copy. The text is selected: press ' + keys + '.';
        }
      });
    });
  }

  /* ── 8. "Will it run on this PC?" — read here, shown here, sent nowhere, kept nowhere ───── */
  var SITE = 'https://sgvue.github.io/';
  var OTHER = {
    android: 'an Android device',
    ios: 'an iPhone or iPad',
    phone: 'a phone or a tablet',
    mac: 'a Mac',
    chromeos: 'a Chromebook',
    linux: 'a Linux computer',
    unknown: 'something other than a Windows PC'
  };

  /** Windows, from the same signals as the download area: { kind, version, bits, arm }. */
  function readOs(s, c) {
    var os = { kind: c.os || 'unknown', version: '', bits: '', arm: false };
    if (c.os !== 'windows') return os;
    var nt = /Windows NT (\d+)\.(\d+)/.exec(s.ua);
    if (nt && Number(nt[1]) < 10) os.version = 'old';
    if (/Win64|x64|WOW64/.test(s.ua)) os.bits = '64';
    // Chromium can say more when asked: Windows 11 reports platformVersion 13 or above.
    var major = parseInt(String(s.version).split('.')[0], 10);
    if (major >= 13) os.version = '11';
    else if (major > 0) os.version = '10';
    else if (major === 0) os.version = 'old';
    if (s.bits) os.bits = s.bits;
    os.arm = c.chip === 'arm' && c.sure;
    return os;
  }
  function osAnswer(os) {
    if (os.kind !== 'windows') return { state: 'warn', text: 'Not Windows', note: 'This looks like ' + (OTHER[os.kind] || OTHER.unknown) + '.' };
    if (os.version === 'old') return { state: 'warn', text: 'Windows older than 10', note: 'SGVue needs Windows 10 or 11.' };
    var name = os.version ? 'Windows ' + os.version : 'Windows 10 or 11';
    if (os.arm) return { state: 'warn', text: name + ', ARM', note: 'SGVue is built for 64-bit Intel and AMD processors.' };
    if (os.bits === '32') return { state: 'warn', text: name + ', 32-bit', note: 'SGVue needs 64-bit Windows.' };
    if (os.bits === '64') return { state: 'ok', text: name + ', 64-bit', note: os.version ? '' : 'A browser cannot always tell 10 from 11.' };
    return { state: 'ok', text: name, note: 'This browser does not say whether it is 64-bit.' };
  }
  var ABOUT_MAC = 'Apple menu › About This Mac shows it.';
  /** macOS, which only Chromium tells (its platformVersion is the real one; the user-agent string says 10.15 on every Mac). */
  function macosAnswer(s) {
    var m = /^(\d+)(?:\.(\d+))?/.exec(String(s.version || ''));
    var major = m ? Number(m[1]) : 0;
    if (!major) return { state: 'unknown', text: 'Not reported', note: 'This browser does not say which version of macOS this is. ' + ABOUT_MAC };
    var name = 'macOS ' + major + (m[2] && m[2] !== '0' ? '.' + m[2] : '');
    if (major < 13) return { state: 'warn', text: name, note: 'SGVue needs macOS 13 Ventura or later.' };
    return { state: 'ok', text: name, note: '' };
  }
  function chipAnswer(c, files) {
    if (!c.sure) return { state: 'unknown', text: 'Not reported', note: 'This browser does not say which chip this Mac has. ' + ABOUT_MAC };
    var arm = c.chip === 'arm';
    var text = arm ? 'Apple silicon' : 'Intel';
    if (arm ? files.arm || files.uni : files.x64 || files.uni) return { state: 'ok', text: text, note: '' };
    return { state: 'warn', text: text, note: 'SGVue for ' + (arm ? 'Macs with Apple silicon' : 'Intel Macs') + ' is not published yet.' };
  }
  /** Chromium rounds memory to a power of two and clamps it: at most 8 GB before Chrome 147, 32 since. */
  function memoryAnswer() {
    var gb = navigator.deviceMemory;
    if (typeof gb !== 'number' || !(gb > 0)) return { state: 'unknown', text: 'Not reported', note: 'This browser does not say how much memory there is.' };
    var rough = 'Browsers round it to a power of two, and some say no more than 8 GB.';
    if (gb >= 8) return { state: 'ok', text: 'About ' + gb + ' GB', note: rough };
    return { state: 'warn', text: 'About ' + gb + ' GB', note: 'SGVue asks for 8 GB. ' + rough };
  }
  /** `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)` → the card's own name. */
  function cardName(raw) {
    var s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    var m = /^ANGLE \(([^,]*),\s*([^,]*),/.exec(s);
    if (m) s = m[2].replace(/^ANGLE Metal Renderer:\s*/, '');
    s = s.replace(/\s*\(0x[0-9A-Fa-f]+\)/g, '').replace(/\s+Direct3D.*$/, '').replace(/\s+vs_\d.*$/, '').trim();
    return s.length > 72 ? s.slice(0, 72) + '…' : s;
  }
  function graphicsAnswer() {
    var gl = webgl('webgl2');
    if (!gl.ok) {
      return { state: 'warn', text: 'No WebGL2 in this browser', note: 'SGVue brings its own browser engine, so this is not the last word: it depends on the graphics driver.' };
    }
    var name = cardName(gl.name);
    if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(name)) {
      return { state: 'warn', text: 'WebGL2, drawn in software', note: name + ' — this browser is not using a graphics card.' };
    }
    return { state: 'ok', text: 'WebGL2 available', note: name || 'This browser does not name the graphics card.' };
  }

  var MARK = { warn: '!', unknown: '?' };
  function dot(state) {
    var d = el('span', 'dot ' + (state === 'ok' ? 'ok' : state === 'warn' ? 'warn' : ''));
    if (state === 'ok') {
      var ns = 'http://www.w3.org/2000/svg';
      var svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('width', '11');
      svg.setAttribute('height', '11');
      svg.setAttribute('aria-hidden', 'true');
      var use = doc.createElementNS(ns, 'use');
      use.setAttribute('href', '#i-check');
      svg.appendChild(use);
      d.appendChild(svg);
    } else {
      d.textContent = MARK[state];
      d.setAttribute('aria-hidden', 'true');
    }
    return d;
  }
  /** One answer in the schedule's "This PC" column; `more` adds it under the one already there. */
  function cellFor(key, a, more) {
    var td = doc.querySelector('#reqs tr[data-req="' + key + '"] td.pc-col');
    if (!td) return;
    if (!more) td.textContent = '';
    var st = el('div', 'st');
    st.appendChild(dot(a.state));
    var body = el('div');
    body.appendChild(el('span', null, a.text));
    if (a.note) body.appendChild(el('small', null, a.note));
    st.appendChild(body);
    td.appendChild(st);
  }
  function pcCheck() {
    var run = byId('pc-run');
    var rows = byId('pc-rows');
    var out = byId('pc-out');
    if (!run || !rows || !out) return;
    var busy = false;

    run.addEventListener('click', function () {
      if (busy) return;
      busy = true;
      run.disabled = true;
      out.textContent = '';
      rows.textContent = '';
      rows.hidden = false;
      each('#reqs .pc-col', function (c) { c.hidden = false; });
      each('#reqs td.pc-col', function (c) { c.textContent = ''; });

      var quick = still();
      var lines = [];
      var plan = [];
      var answers = [];
      var mac = false;
      var files = null;
      var c = null;
      function begin(i) {
        var li = el('li');
        li.appendChild(el('span', 'spin'));
        li.appendChild(el('span', null, plan[i][1] + '…'));
        rows.appendChild(li);
        lines[i] = li;
      }
      function settle(i, a) {
        var li = lines[i];
        li.textContent = '';
        li.className = 'is-done';
        li.appendChild(dot(a.state));
        li.appendChild(el('span', null, plan[i][1] + ': ' + a.text));
        cellFor(plan[i][0], a, i > 0 && plan[i - 1][0] === plan[i][0]);
      }
      function wait(ms) {
        return new Promise(function (ok) { window.setTimeout(ok, quick ? 0 : ms); });
      }
      // One row at a time, 500 ms apart — the app's own stagger for its loading rows. On a phone,
      // or on a computer SGVue is not published for, the first row says it all.
      function step(i) {
        if (i >= plan.length) return null;
        begin(i);
        answers[i] = plan[i][2]();
        return wait(i ? 500 : 420).then(function () {
          settle(i, answers[i]);
          if (i === 0 && !mac && c.os !== 'windows') return null;
          return step(i + 1);
        });
      }

      Promise.resolve(ready).then(readSignals).then(function (s) {
        c = computer(s);
        files = shown ? shown.rel.files : null;
        // A Mac is checked as a Mac once the latest release has a disk image; until then, as today.
        mac = c.os === 'mac' && !!files && macFiles(files).length > 0;
        var os = readOs(s, c);
        plan = mac
          ? [['mac', 'macOS', function () { return macosAnswer(s); }], ['mac', 'Chip', function () { return chipAnswer(c, files); }], ['mem', 'Memory', memoryAnswer], ['gpu', 'Graphics', graphicsAnswer]]
          : [['os', 'Windows', function () { return osAnswer(os); }], ['mem', 'Memory', memoryAnswer], ['gpu', 'Graphics', graphicsAnswer]];
        return step(0);
      }).then(function () {
        verdict(c, files, mac, answers);
      }).catch(function () {
        out.textContent = '';
        out.appendChild(el('p', 'pc-say warn', 'The check could not finish in this browser. What SGVue needs is in the schedule.'));
      }).then(function () {
        busy = false;
        run.disabled = false;
        run.textContent = 'Check again';
        remeasure();
      });
    });

    function verdict(c, files, mac, answers) {
      out.textContent = '';
      var box = el('div', 'pc-say');
      if (!mac && c.os !== 'windows') {
        var both = !!files && macFiles(files).length > 0;
        box.className = 'pc-say warn';
        box.appendChild(el('strong', null, 'SGVue runs on ' + (files ? systems(files) : 'Windows') + '.'));
        box.appendChild(el('span', null, 'This looks like ' + (OTHER[c.os] || OTHER.unknown) + '. Send this page to your ' + (both ? 'computer' : 'PC') + ':'));
        var send = el('div', 'pc-send');
        var copy = el('button', 'btn btn-s btn-g');
        copy.type = 'button';
        copy.appendChild(el('span', null, 'Copy the link'));
        copy.addEventListener('click', function () {
          copyText(SITE).then(function (ok) {
            flash(copy, ok ? 'ok' : 'no', ok ? 'Copied' : SITE, ok ? 1400 : 6000);
          });
        });
        send.appendChild(copy);
        if (navigator.share) {
          var share = el('button', 'btn btn-s btn-g', 'Share…');
          share.type = 'button';
          share.addEventListener('click', function () {
            try {
              var p = navigator.share({ title: 'SGVue', url: SITE });
              if (p && p.catch) p.catch(function () { /* the visitor closed the sheet */ });
            } catch (e) {
              /* sharing is not available after all */
            }
          });
          send.appendChild(share);
        }
        box.appendChild(send);
      } else if (answers.some(function (a) { return a.state === 'warn'; })) {
        box.className = 'pc-say warn';
        box.appendChild(el('strong', null, 'Not everything matches.'));
        box.appendChild(el('span', null, 'Compare the two columns of the schedule: one or more answers fall short of what SGVue asks for.'));
      } else if (mac && answers.filter(function (a) { return a.state === 'unknown'; }).length > 1) {
        // Safari and Firefox tell neither the version of macOS nor the memory: say so, not "ready".
        box.className = 'pc-say unsure';
        box.appendChild(el('strong', null, 'This browser cannot tell much about this Mac.'));
        box.appendChild(el('span', null, 'Nothing it can see falls short. For the rest, Apple menu › About This Mac shows the version of macOS, the chip and the memory.'));
      } else {
        box.appendChild(el('strong', null, mac ? 'This Mac looks ready.' : 'This PC looks ready.'));
        box.appendChild(el('span', null, 'As far as a browser can tell, it has what SGVue asks for.'));
      }
      out.appendChild(box);
    }
  }

  /* ── start ─────────────────────────────────────────────────────────────── */
  var ready = null; // settles once the release and the computer are known, or known to be unknown
  function start() {
    labelToggle();
    themePictures();
    if (S.theme) {
      S.theme.onChange(function () {
        labelToggle();
        themePictures();
      });
    }
    var toggle = byId('theme');
    if (toggle && S.theme) {
      toggle.addEventListener('click', function () {
        S.theme.set(S.theme.get() === 'dark' ? 'light' : 'dark');
      });
    }

    furniture();
    parallax();
    tour();
    copyButtons();
    pcCheck();

    var have = byId('update') ? installed() : null;
    if (!have && !doc.querySelector('[data-download]')) return; // e.g. the 404 page: no API call
    if (have) banner('wait', have);
    ready = Promise.all([latest(), readSignals()]).then(function (got) {
      var r = got[0];
      var c = computer(got[1]);
      // Without an answer from GitHub nothing is offered but the page's own link to every file —
      // and on a Mac not even that: a note says what could not be checked (unanswered()).
      if (r) showRelease(r, c);
      else if (unanswered(c)) downloadArea(null, c, unanswered(c));
      if (have) {
        if (!r) banner('unknown', have);
        else {
          var cmp = compare(parse(have), parse(r.v));
          banner(cmp < 0 ? 'update' : 'ok', have, r, cmp > 0);
        }
      }
      remeasure();
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})();
