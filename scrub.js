/*
 * SGVue site — the hero: scrub the section.
 *
 * A flipbook of the app's own captures, one for each height of a level cut (shots.js), moved by
 * a storey ladder drawn to scale beside the stage. Underneath the ladder is an ordinary
 * <input type="range">: the keyboard and a screen reader work it natively, and it says where
 * the cut is ("Level L2, 1 200 mm above"). The control is labelled the way the app's Section
 * card labels a plane — a level's chip, an offset in millimetres, −500 and +500.
 *
 * Without this script the stage is one picture, and complete. Frames other than the first are
 * fetched only after the page has loaded — a few for one opening sweep, the rest when the
 * visitor reaches for the control — and nothing is fetched ahead, and nothing sweeps, under
 * Save-Data or reduced motion.
 */
(function () {
  'use strict';

  var S = window.SGVue;
  var cut = S && S.shots && S.shots.cut;
  if (!cut) return;

  function byId(id) {
    return document.getElementById(id);
  }
  var host = byId('scrub');
  var base = byId('cut-img');
  var ladder = byId('cut-ladder');
  var range = byId('cut-range');
  var ticks = byId('cut-ticks');
  var handle = byId('cut-handle');
  var read = byId('cut-read');
  var card = byId('cut-card');
  var chipBox = byId('cut-chips');
  var off = byId('cut-off');
  var sum = byId('cut-sum');
  var down = byId('cut-down');
  var up = byId('cut-up');
  if (!host || !base || !ladder || !range || !ticks || !handle || !read || !card || !chipBox || !off || !sum || !down || !up) return;
  var stage = base.closest ? base.closest('.stage') : null;
  if (!stage) return;

  var thin = S.thin || function (n) { return String(Math.round(n)); };
  var MINUS = '−';

  /* ── the frames ── */
  var frames = [];
  for (var z = cut.from; z <= cut.to; z += cut.step) frames.push(z);
  var last = frames.length - 1;
  function indexOf(zz) {
    return Math.max(0, Math.min(last, Math.round((zz - cut.from) / cut.step)));
  }
  var startI = indexOf(cut.start);
  var restI = indexOf(cut.rest);
  var storeys = cut.storeys;
  var zLo = Math.min(storeys[0][1], cut.from);
  var zHi = cut.to;
  function along(zz) {
    return (zHi - zz) / (zHi - zLo); // 0 at the top of the ladder, 1 at its foot
  }
  /** The highest storey at or below a height: the level a dragged cut is named after. */
  function storeyAt(zz) {
    var k = 0;
    for (var i = 0; i < storeys.length; i++) if (storeys[i][1] <= zz) k = i;
    return k;
  }
  function signed(mm) {
    return (mm >= 0 ? '+' : MINUS) + thin(Math.abs(mm));
  }
  /** `+12.200` — metres to three places, as the app's spot level tag. */
  function metres(mm) {
    return (mm < 0 ? MINUS : '+') + (Math.abs(mm) / 1000).toFixed(3);
  }

  var state = { i: startI, level: storeyAt(cut.start) };

  /* ── which file ── */
  function themeDir() {
    var t = S.theme ? S.theme.get() : 'dark';
    return cut.themes.indexOf(t) >= 0 ? t : cut.themes[0];
  }
  var width = cut.widths[cut.widths.length - 1];
  /**
   * One width for every frame: the one the browser itself chose for the page's own picture
   * (from its `srcset` and `sizes`), so the first frame is never fetched twice. Failing that,
   * the smallest that fills the stage.
   */
  function chooseWidth() {
    var m = /-(\d+)\.[a-z0-9]+$/i.exec(base.currentSrc || '');
    if (m && cut.widths.indexOf(Number(m[1])) >= 0) {
      width = Number(m[1]);
      return;
    }
    var need = stage.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2) * 0.8;
    width = cut.widths[cut.widths.length - 1];
    for (var i = 0; i < cut.widths.length; i++) {
      if (cut.widths[i] >= need) {
        width = cut.widths[i];
        break;
      }
    }
  }
  function urlOf(i) {
    return cut.file.replace('{theme}', themeDir()).replace('{z}', String(frames[i])).replace('{w}', String(width));
  }

  /* ── loading: a frame is shown only once it has arrived ── */
  var ready = {}; // url → true
  var asked = {}; // url → [callbacks]
  /** Fetch a frame; `then(true)` once it has arrived, `then(false)` if it cannot be had. */
  function load(url, then) {
    if (ready[url]) {
      if (then) then(true);
      return;
    }
    if (asked[url]) {
      if (then) asked[url].push(then);
      return;
    }
    asked[url] = then ? [then] : [];
    var im = new Image();
    im.decoding = 'async';
    function settle(ok) {
      if (ok) ready[url] = true;
      var list = asked[url] || [];
      delete asked[url];
      list.forEach(function (fn) { fn(ok); });
    }
    im.onload = function () { settle(true); };
    im.onerror = function () { settle(false); }; // a missing frame is never shown; the one before it stays
    im.src = url;
  }

  /* ── the two layers over the page's own picture ── */
  function layer() {
    var im = new Image();
    im.className = 'over';
    im.alt = '';
    im.setAttribute('aria-hidden', 'true');
    im.decoding = 'async';
    return im;
  }
  var under = layer();
  var over = layer();
  var shown = ''; // the url on screen; '' while it is the page's own picture
  function paint(url, fade) {
    if (url === shown) return;
    if (shown) {
      under.src = shown;
      under.className = 'over is-now';
      if (!under.parentNode) stage.insertBefore(under, over.parentNode ? over : null);
    }
    over.className = 'over';
    over.src = url;
    if (!over.parentNode) stage.appendChild(over);
    void over.offsetWidth; // the change above is taken before the fade begins
    over.className = fade && !(S.still && S.still()) ? 'over is-in' : 'over is-now';
    shown = url;
  }

  /* ── what is said and shown about the cut ── */
  function describe() {
    var zz = frames[state.i];
    var st = storeys[state.level];
    var offset = zz - st[1];
    var where = 'Level ' + st[0] + ', ' + thin(Math.abs(offset)) + ' mm ' + (offset < 0 ? 'below' : 'above');
    var clear = typeof cut.clear === 'number' && zz >= cut.clear;
    return { z: zz, name: st[0], offset: offset, where: where, clear: clear };
  }
  var chips = [];
  var labels = [];
  // The page's own description of its first picture: the plane above the roof, nothing cut.
  var firstAlt = base.alt;
  function render(fade) {
    var d = describe();
    range.value = String(state.i);
    range.setAttribute('aria-valuetext', d.where + (d.clear ? '. Above the building: nothing is cut yet.' : '.'));
    handle.style.setProperty('--p', along(d.z).toFixed(5));
    read.lastChild.textContent = metres(d.z);
    off.textContent = (d.offset < 0 ? MINUS : '') + thin(Math.abs(d.offset));
    sum.textContent = 'offset mm · level ' + d.name + ' · cut';
    down.disabled = state.i <= 0;
    up.disabled = state.i >= last;
    chips.forEach(function (c, k) { c.setAttribute('aria-pressed', k === state.level ? 'true' : 'false'); });
    labels.forEach(function (l, k) { l.classList.toggle('is-on', k === state.level); });
    if (cut.alt) base.alt = d.clear ? firstAlt : cut.alt.replace('{where}', d.where.charAt(0).toLowerCase() + d.where.slice(1));

    var url = urlOf(state.i);
    var want = state.i;
    load(url, function (ok) {
      if (ok && state.i === want) paint(url, fade);
    });
  }
  function go(i, level, fade) {
    i = Math.max(0, Math.min(last, i));
    state.i = i;
    state.level = level === null ? storeyAt(frames[i]) : level;
    render(fade);
  }

  /* ── build the ladder and the card from the manifest ── */
  storeys.forEach(function (st, k) {
    var p = along(st[1]).toFixed(5);
    var tick = document.createElement('i');
    tick.style.setProperty('--p', p);
    var label = document.createElement('b');
    label.style.setProperty('--p', p);
    label.appendChild(document.createTextNode(st[0]));
    var elev = document.createElement('span');
    elev.textContent = signed(st[1]);
    label.appendChild(elev);
    // On a phone the ladder lies flat and the lowest two labels would touch: the lowest goes.
    if (k === 0 && storeys.length > 1 && along(st[1]) - along(storeys[1][1]) < 0.09) label.className = 'is-low';
    ticks.appendChild(tick);
    ticks.appendChild(label);
    labels.push(label);

    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = st[0];
    chip.setAttribute('aria-pressed', 'false');
    chip.setAttribute('aria-label', 'Cut at level ' + st[0]);
    chip.addEventListener('click', function () {
      interacted();
      go(indexOf(st[1] + cut.chip), k, true);
    });
    chipBox.appendChild(chip);
    chips.push(chip);
  });
  (function () {
    var tri = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tri.setAttribute('class', 'tri');
    tri.setAttribute('width', '10');
    tri.setAttribute('height', '9');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-tri');
    tri.appendChild(use);
    read.appendChild(tri);
    read.appendChild(document.createTextNode(''));
  })();
  range.min = '0';
  range.max = String(last);
  range.step = '1';

  /* ── input: the range (keyboard, assistive technology), the ladder (pointer, touch), the card ── */
  var touched = false;
  var sweep = 0;
  function interacted() {
    touched = true;
    if (sweep) {
      window.clearTimeout(sweep);
      sweep = 0;
    }
  }
  range.addEventListener('input', function () {
    interacted();
    go(parseInt(range.value, 10) || 0, null, true);
  });
  range.addEventListener('keydown', interacted);
  down.addEventListener('click', function () {
    interacted();
    go(state.i - 1, state.level, true);
  });
  up.addEventListener('click', function () {
    interacted();
    go(state.i + 1, state.level, true);
  });

  var dragging = false;
  function fromPointer(e) {
    var r = ladder.getBoundingClientRect();
    var pad = parseFloat(window.getComputedStyle(ladder).getPropertyValue('--pad')) || 24;
    var upright = r.height > r.width;
    var t = upright ? (e.clientY - r.top - pad) / Math.max(1, r.height - 2 * pad) : 1 - (e.clientX - r.left - pad) / Math.max(1, r.width - 2 * pad);
    var zz = zHi - Math.max(0, Math.min(1, t)) * (zHi - zLo);
    go(indexOf(zz), null, false);
  }
  ladder.addEventListener('pointerdown', function (e) {
    if (e.button) return;
    interacted();
    dragging = true;
    ladder.classList.add('is-drag');
    try {
      ladder.setPointerCapture(e.pointerId);
    } catch (err) {
      /* no capture: the drag still follows while the pointer stays over the ladder */
    }
    fromPointer(e);
    try {
      range.focus({ preventScroll: true });
    } catch (err) {
      range.focus();
    }
    e.preventDefault();
  });
  ladder.addEventListener('pointermove', function (e) {
    if (dragging) fromPointer(e);
  });
  function drop() {
    dragging = false;
    ladder.classList.remove('is-drag');
  }
  ladder.addEventListener('pointerup', drop);
  ladder.addEventListener('pointercancel', drop);
  ladder.addEventListener('lostpointercapture', drop);

  /* ── switch it on ── */
  chooseWidth();
  ladder.hidden = false;
  card.hidden = false;
  host.classList.add('is-live');
  render(false);

  if (S.theme) {
    S.theme.onChange(function () {
      // Only when the other theme has captures of its own does anything change.
      if (cut.themes.length > 1) {
        shown = '';
        under.className = 'over';
        over.className = 'over';
        render(false);
      }
    });
  }

  /* ── the other frames: some after the page has loaded, for one sweep; the rest on demand ──
   *
   * Nothing but the first frame is fetched while the page loads. Once it has, and only when
   * the stage is in view, the frames of the opening sweep arrive (every `sweep`-th frame from
   * `start` down to `rest`) and the sweep runs once. Every other frame waits until the visitor
   * reaches for the control. Under Save-Data, on a 2G connection, or under reduced motion,
   * nothing is fetched ahead at all and there is no sweep.
   */
  var conn = navigator.connection;
  var thrifty = !!(conn && (conn.saveData || /(^|-)2g$/.test(String(conn.effectiveType || ''))));
  var stride = Math.max(1, cut.sweep || 1);

  function fetchAll(order, done) {
    var at = 0;
    var open = 0;
    function next() {
      while (open < 3 && at < order.length) {
        open++;
        load(urlOf(order[at++]), function () {
          open--;
          next();
        });
      }
      if (at >= order.length && open === 0 && done) {
        var d = done;
        done = null;
        d();
      }
    }
    next();
  }
  var sweepFrames = [];
  for (var f = startI - stride; f > restI; f -= stride) sweepFrames.push(f);
  if (restI < startI) sweepFrames.push(restI);

  function runSweep() {
    if (touched || (S.still && S.still()) || state.i !== startI) return;
    var n = 0;
    function step() {
      if (touched) return;
      var i = sweepFrames[n++];
      go(i, null, true);
      sweep = n < sweepFrames.length ? window.setTimeout(step, 240) : 0;
    }
    sweep = window.setTimeout(step, 600);
  }
  var wanted = false;
  function fetchRest() {
    if (wanted) return;
    wanted = true;
    var rest = [];
    for (var d = 1; d <= last; d++) {
      if (state.i - d >= 0) rest.push(state.i - d);
      if (state.i + d <= last) rest.push(state.i + d);
    }
    fetchAll(rest, null); // nearest to where the cut stands first
  }
  ['pointerenter', 'touchstart', 'focusin'].forEach(function (type) {
    host.addEventListener(type, fetchRest, { passive: true });
  });

  function afterLoad() {
    if (thrifty || !sweepFrames.length || (S.still && S.still())) return;
    var seen = false;
    var loaded = false;
    function maybe() {
      if (seen && loaded) runSweep();
    }
    function begin() {
      seen = true;
      var idle = window.requestIdleCallback ? function (fn) { window.requestIdleCallback(fn, { timeout: 2500 }); } : function (fn) { window.setTimeout(fn, 600); };
      idle(function () {
        fetchAll(sweepFrames, function () {
          loaded = true;
          maybe();
        });
      });
    }
    if (!window.IntersectionObserver) return begin();
    var io = new IntersectionObserver(function (entries) {
      if (entries[0] && entries[0].isIntersecting) {
        io.disconnect();
        begin();
      }
    }, { threshold: 0.5 });
    io.observe(stage);
  }
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad);

  var resizeT = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(chooseWidth, 200);
  });
})();
