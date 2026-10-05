/*
 * SGVue site — "Meet Vee": a replay of what the Ask Vee panel shows while a question is
 * answered. It is a replay, and says so; nothing here talks to an assistant.
 *
 * The choreography is the app's own (the owner's "Ask Vee" handoff): the typed line lifts into
 * the transcript, "Thinking" shimmers, a one-line ticker rolls through Reading, Filtering and
 * Checking over a matrix of the model's elements, and the answer arrives with a row per level.
 * The numbers are the demo building's: 4 models, 412 elements, 80 walls, 24 of them with no
 * thermal transmittance — five on each of L1 to L4, four on the roof.
 *
 * Everything on screen is a pure function of one number, the time T in seconds, so the replay
 * can be played, paused and stepped. Without this script the panel shows its last frame as
 * ordinary text. Under reduced motion nothing plays by itself and each step shows the end of
 * its phase.
 */
(function () {
  'use strict';

  var S = window.SGVue;
  var rp = document.getElementById('rp');
  if (!S || !rp || !window.requestAnimationFrame) return;

  function part(name) {
    return rp.querySelector('[data-r="' + name + '"]');
  }
  var thread = document.getElementById('rp-thread');
  var scroller = document.getElementById('rp-scroll');
  var E = {
    you: part('you'), youLabel: part('you-label'), youBubble: part('you-bubble'), q: part('q'),
    ans: part('ans'), ansLabel: part('ans-label'), thinking: part('thinking'), status: part('status'),
    bubble: part('bubble'), mx: part('mx'), ticker: part('ticker'), text: part('text'), rule: part('rule'),
    rows: part('rows'), chip: part('chip'), lift: part('lift'), input: part('input'), ph: part('ph'),
    typed: part('typed'), caret: part('caret'), send: part('send'), arrow: part('arrow'), stop: part('stop')
  };
  for (var name in E) if (!E[name]) return;
  if (!thread || !scroller) return;
  var veeCanvas = document.getElementById('rp-vee');
  var bigVee = document.getElementById('vee-big');
  var ctx = E.mx.getContext ? E.mx.getContext('2d') : null;
  if (!ctx) return;

  /* ── time ── */
  var C = { open: 0, send: 2.6, think: 3.6, read: 5.0, filter: 6.8, check: 8.4, answer: 10.8, end: 14.2 };
  // Where each of the eight steps is held: the instants of the handoff's own stills …
  var STEPS = [1.75, C.send + 0.45, C.send + 1.9, C.read + 1.3, C.filter + 1.1, C.check + 1.35, C.answer + 0.6, C.end];
  // … and, under reduced motion, the end of each phase.
  var ENDS = [C.send - 0.01, C.think - 0.01, C.read - 0.01, C.filter - 0.01, C.check - 0.01, C.answer - 0.01, C.end, C.end];
  var STARTS = [0, C.send, C.think, C.read, C.filter, C.check, C.answer, C.answer + 2];

  /* ── the three motion curves, and nothing else ── */
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  var enter = function (t) { return 1 - Math.pow(1 - t, 4); };
  var glide = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var pop = function (t) { return 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2); };
  function p(T, s, d, ease) {
    return T <= s ? 0 : T >= s + d ? 1 : ease((T - s) / d);
  }
  function lin(T, s, d) {
    return clamp((T - s) / d, 0, 1);
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function rgb(h) {
    var s = h.replace('#', '');
    if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
  }
  function mix(a, b, t) {
    t = clamp(t, 0, 1);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function still() {
    return !!(S.still && S.still());
  }

  /* ── the demo building's 412 elements, in the federation's own order ──
   * ARC 140 · STR 244 · SIT 20 · MEP 8. A cell is one element; four rows, so a model is a
   * whole number of columns (35 · 61 · 5 · 2). `k` is a wall's place among the 80 walls and
   * `f` its place among the 24 with no thermal transmittance.
   */
  var MODELS = [140, 244, 20, 8];
  var WALLS = 80;
  var COLS = 103;
  var cells = [];
  var flagged = []; // by f: { level, slot }
  (function () {
    var wallAt = {}; // federation index → k
    var k = 0;
    var floor, j;
    // Architecture: 14 external walls a floor (every other element), the corridor wall and
    // partition B; then four parapets on the roof.
    for (floor = 0; floor < 4; floor++) {
      for (j = 0; j < 14; j++) wallAt[34 * floor + 2 * j] = k++;
      wallAt[34 * floor + 29] = k++;
      wallAt[34 * floor + 32] = k++;
    }
    for (j = 136; j < 140; j++) wallAt[j] = k++;
    // Structure: three core walls a floor.
    for (floor = 0; floor < 4; floor++) {
      var first = 140 + 21 + 56 * floor + (floor === 3 ? 51 : 52);
      for (j = 0; j < 3; j++) wallAt[first + j] = k++;
    }
    // No thermal transmittance: the partitions, the parapets and the core walls.
    var levelOf = {};
    for (floor = 0; floor < 4; floor++) {
      levelOf[16 * floor + 14] = floor;
      levelOf[16 * floor + 15] = floor;
      for (j = 0; j < 3; j++) levelOf[68 + 3 * floor + j] = floor;
    }
    for (j = 64; j < 68; j++) levelOf[j] = 4;
    var slots = [0, 0, 0, 0, 0];
    var f = 0;
    var byK = [];
    for (var i = 0; i < 412; i++) {
      var g = 0;
      var acc = 0;
      while (i >= acc + MODELS[g]) acc += MODELS[g++];
      var cell = { col: Math.floor(i / 4), row: i % 4, g: g, k: -1, f: -1 };
      if (wallAt[i] !== undefined) {
        cell.k = wallAt[i];
        byK[cell.k] = cell;
      }
      cells.push(cell);
    }
    for (k = 0; k < WALLS; k++) {
      if (levelOf[k] === undefined) continue;
      byK[k].f = f++;
      flagged.push({ level: levelOf[k], slot: slots[levelOf[k]]++, k: k });
    }
  })();

  /* ── the answer's words, and the ticker's three lines ── */
  var words = [];
  (function () {
    function wrap(node, host) {
      var bits = node.nodeValue.split(/(\s+)/);
      bits.forEach(function (b) {
        if (!b) return;
        if (/^\s+$/.test(b)) {
          host.appendChild(document.createTextNode(' '));
          return;
        }
        var w = document.createElement('span');
        w.className = 'w';
        w.textContent = b;
        host.appendChild(w);
        words.push(w);
      });
    }
    var kids = Array.prototype.slice.call(E.text.childNodes);
    E.text.textContent = '';
    kids.forEach(function (n) {
      if (n.nodeType === 3) wrap(n, E.text);
      else if (n.nodeType === 1) {
        var shell = document.createElement(n.tagName.toLowerCase());
        E.text.appendChild(shell);
        Array.prototype.forEach.call(n.childNodes, function (m) {
          if (m.nodeType === 3) wrap(m, shell);
        });
      }
    });
  })();

  function line(label, mono, unit) {
    var d = document.createElement('div');
    var l = document.createElement('span');
    l.className = 'lbl';
    l.appendChild(document.createTextNode(label));
    if (mono) {
      var c = document.createElement('code');
      c.textContent = mono;
      l.appendChild(c);
    }
    var cnt = document.createElement('span');
    cnt.className = 'cnt';
    var n = document.createElement('b');
    n.textContent = '0';
    cnt.appendChild(n);
    cnt.appendChild(document.createTextNode(' ' + unit));
    d.appendChild(l);
    d.appendChild(cnt);
    E.ticker.appendChild(d);
    return { el: d, n: n, cnt: cnt };
  }
  var tick = [line('Reading 4 models', '', 'elements'), line('Filtering ', 'IfcWall', 'walls'), line('Checking Thermal Transmittance', '', 'missing')];
  var rowEls = Array.prototype.slice.call(E.rows.children);

  var QUESTION = E.q.textContent;
  // When each character lands: uneven, as typing is, and the same on every run.
  var TYPE = (function () {
    var seed = 5;
    function rnd() {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    }
    var d = [];
    var sum = 0;
    for (var i = 0; i < QUESTION.length; i++) {
      d.push(0.6 + rnd());
      sum += d[i];
    }
    var acc = 0;
    return d.map(function (v) { return (acc += (v / sum) * 1.55); });
  })();

  /* ── measured layout (CSS px), renewed whenever the panel changes size ── */
  var L = null;
  var colour = null;
  function measure() {
    var dpr = window.devicePixelRatio || 1;
    // Measured as it stands at rest: scrolled to the top, the reply at its full height, and
    // nothing mid-move (a scaled bubble or a shifted row would be measured where it is not).
    rp.classList.add('is-live');
    scroller.style.setProperty('--scroll', '0px');
    E.bubble.style.removeProperty('height');
    E.youBubble.style.transform = 'none';
    rowEls.forEach(function (li) { li.style.transform = 'none'; });
    E.lift.style.width = '';
    var box = rp.getBoundingClientRect();
    var bub = E.bubble.getBoundingClientRect();
    var qr = E.q.getBoundingClientRect();
    var inp = E.input.getBoundingClientRect();
    var cs = window.getComputedStyle(E.bubble);
    var padX = parseFloat(cs.paddingLeft) || 13;
    var lineH = parseFloat(window.getComputedStyle(E.q).lineHeight) || 22;
    var W = bub.width;
    var inner = W - 2 * padX;
    var snap = function (v) { return Math.round(v * dpr) / dpr; };

    // The read grid: four rows, one column of cells for every four elements, a gap between models.
    var gap = snap(3.3);
    var pitchA = Math.max(2 / dpr, Math.floor(((inner - 3 * gap) / COLS) * dpr) / dpr);
    var sizeA = Math.max(1 / dpr, Math.min(snap(2.7), pitchA - 1 / dpr));
    var rowA = Math.max(pitchA, snap(4.3));
    // The filter grid: the 80 walls in two rows of forty.
    var pitchB = Math.floor((inner / (WALLS / 2)) * dpr) / dpr;
    var sizeB = Math.max(2 / dpr, snap(pitchB * 0.7));
    var rowB = snap(sizeB + 2.5);
    var top = 37;

    // Where each of the 24 lands: the squares the finished answer draws in its rows.
    var slots = [];
    rowEls.forEach(function (li, lv) {
      var sq = li.querySelectorAll('.rp-cells i');
      slots[lv] = Array.prototype.map.call(sq, function (s) {
        var r = s.getBoundingClientRect();
        return { x: r.left - bub.left, y: r.top - bub.top, size: r.width };
      });
    });

    L = {
      dpr: dpr, W: W, H: bub.height, padX: padX, inner: inner,
      hThink: Math.round(top + 4 * rowA + 11),
      gap: gap, pitchA: pitchA, sizeA: sizeA, rowA: rowA, pitchB: pitchB, sizeB: sizeB, rowB: rowB, top: top,
      slots: slots,
      threadH: thread.clientHeight,
      yYou: E.you.offsetTop, hYou: E.you.offsetHeight,
      hLabel: E.ansLabel.offsetHeight,
      hChip: E.chip.offsetHeight + (parseFloat(window.getComputedStyle(E.chip).marginTop) || 0),
      rowGap: parseFloat(window.getComputedStyle(E.you).marginTop) || 14,
      bubGap: parseFloat(cs.marginTop) || 6,
      padB: parseFloat(window.getComputedStyle(scroller).paddingBottom) || 14,
      from: { x: inp.left - box.left + (parseFloat(window.getComputedStyle(E.input).paddingLeft) || 12) + 1, y: inp.top - box.top + (inp.height - lineH) / 2 },
      to: { x: qr.left - box.left, y: qr.top - box.top },
      qW: Math.ceil(qr.width) + 1
    };

    E.mx.width = Math.max(2, Math.round(W * dpr));
    E.mx.height = Math.max(2, Math.round(L.H * dpr));
    E.mx.style.width = W + 'px';
    E.mx.style.height = L.H + 'px';
    E.lift.style.width = L.qW + 'px';

    var rootCs = window.getComputedStyle(rp);
    var tok = function (n, d) { return rgb((rootCs.getPropertyValue(n) || d).trim() || d); };
    colour = {
      cell: tok('--cell', '#354544'), flash: tok('--cell-flash', '#7E9693'), mid: tok('--cell-mid', '#405351'),
      dim: tok('--cell-dim', '#2D3B3A'), accent: tok('--accent', '#35C4B6')
    };
  }

  /* ── one frame ── */
  var T = C.end;
  function beamAt(xc) {
    var m = L.inner * 0.014;
    return C.check + 0.3 + ((xc + m) / (L.inner + 2 * m)) * 1.7;
  }
  function square(x, y, size, scale, alpha, fill) {
    if (alpha <= 0.004 || scale <= 0.004) return;
    var d = L.dpr;
    var s = size * scale;
    var px = Math.round((L.padX + x + (size - s) / 2) * d);
    var py = Math.round((y + (size - s) / 2) * d);
    var ps = Math.max(1, Math.round(s * d));
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.fillStyle = fill;
    if (ps < 5) {
      ctx.fillRect(px, py, ps, ps);
      return;
    }
    var r = ps * 0.24;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + ps, py, px + ps, py + ps, r);
    ctx.arcTo(px + ps, py + ps, px, py + ps, r);
    ctx.arcTo(px, py + ps, px, py, r);
    ctx.arcTo(px, py, px + ps, py, r);
    ctx.closePath();
    ctx.fill();
  }
  function matrix() {
    var d = L.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, E.mx.width, E.mx.height);
    if (T < C.read) return;
    var accent = mix(colour.accent, colour.accent, 0);
    var found = 0;
    var rings = [];

    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var ta = C.read + 0.35 + (c.col / COLS) * 1.0;
      var sp = p(T, ta, 0.3, pop);
      var x = c.col * L.pitchA + c.g * L.gap + (L.pitchA - L.sizeA) / 2;
      var y = L.top + c.row * L.rowA;
      var size = L.sizeA;
      var scale = sp;
      var op = clamp(sp, 0, 1);
      var fill = mix(colour.flash, colour.cell, lin(T, ta + 0.08, 0.45));
      if (c.k < 0) {
        var out = p(T, C.filter + 0.1 + (c.col / COLS) * 0.45, 0.3, enter);
        scale *= 1 - out;
        op *= 1 - out;
      } else {
        var m = p(T, C.filter + 0.35 + (c.k / WALLS) * 0.35, 0.7, glide);
        var xB = Math.floor(c.k / 2) * L.pitchB + (L.pitchB - L.sizeB) / 2;
        var yB = L.top + 1 + (c.k % 2) * L.rowB;
        x = lerp(x, xB, m);
        y = lerp(y, yB, m);
        size = lerp(L.sizeA, L.sizeB, m);
        var tb = beamAt(xB + L.sizeB / 2);
        if (c.f < 0) {
          fill = T < tb ? mix(colour.cell, colour.mid, m) : mix(colour.dim, colour.flash, 1 - lin(T, tb, 0.4));
          var gone = p(T, C.answer + 0.05 + (c.k / WALLS) * 0.25, 0.28, enter);
          scale *= 1 - gone;
          op *= 1 - gone;
        } else {
          if (T >= tb) {
            found++;
            fill = accent;
            scale = lerp(0.45, 1, p(T, tb, 0.45, pop));
            var rr = p(T, tb, 0.6, enter);
            if (rr < 1) rings.push({ x: x, y: y, size: size, rr: rr });
          } else fill = mix(colour.cell, colour.mid, m);
          var fl = flagged[c.f];
          var slot = L.slots[fl.level] && L.slots[fl.level][fl.slot];
          if (slot) {
            var tf = C.answer + 0.5 + c.f * 0.03;
            var fx = p(T, tf, 0.75, glide);
            var fy = p(T, tf, 0.75, enter);
            x = lerp(x, slot.x - L.padX, fx);
            y = lerp(y, slot.y, fy);
            size = lerp(size, slot.size, fx);
          }
        }
      }
      square(x, y, size, scale, op, fill);
    }

    // The rings thrown by a cell the beam has just found.
    ctx.lineWidth = Math.max(1, 1.2 * d);
    ctx.strokeStyle = accent;
    rings.forEach(function (r) {
      var grow = 1 + r.rr * 1.6;
      var s = (r.size + 3) * grow;
      ctx.globalAlpha = 0.8 * (1 - r.rr);
      ctx.strokeRect((L.padX + r.x + r.size / 2 - s / 2) * d, (r.y + r.size / 2 - s / 2) * d, s * d, s * d);
    });

    // The beam: a bright line with a glow, and a trail fading out behind it.
    var on = p(T, C.check + 0.2, 0.2, enter) * (1 - p(T, C.check + 1.9, 0.25, enter));
    if (on > 0.004) {
      var mgn = L.inner * 0.014;
      var bx = (L.padX + lerp(-mgn, L.inner + mgn, lin(T, C.check + 0.3, 1.7))) * d;
      var y0 = (L.top - 4) * d;
      var hh = (2 * L.rowB + L.sizeB + 6) * d;
      var trail = ctx.createLinearGradient(bx - 38 * d, 0, bx, 0);
      trail.addColorStop(0, 'rgba(' + colour.accent.join(',') + ',0)');
      trail.addColorStop(1, 'rgba(' + colour.accent.join(',') + ',.18)');
      ctx.globalAlpha = on * 0.9;
      ctx.fillStyle = trail;
      ctx.fillRect(bx - 38 * d, y0, 38 * d, hh);
      ctx.globalAlpha = on;
      ctx.shadowColor = 'rgba(' + colour.accent.join(',') + ',.55)';
      ctx.shadowBlur = 10 * d;
      ctx.fillStyle = accent;
      ctx.fillRect(Math.round(bx - d), y0 - 2 * d, Math.max(1, Math.round(2 * d)), hh + 4 * d);
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
    ctx.globalAlpha = 1;
    return found;
  }

  function roll(node, tin, tout, h) {
    var a = p(T, tin, 0.42, enter);
    var b = tout === null ? 0 : p(T, tout, 0.32, enter);
    if (a <= 0 || b >= 1) {
      node.style.opacity = '0';
      return;
    }
    node.style.opacity = String(a * (1 - b));
    node.style.transform = 'translateY(' + ((1 - a) * h - b * h).toFixed(2) + 'px)';
  }
  var lastTyped = -1;
  var lastNums = ['', '', ''];
  function frame() {
    if (!L) return;
    var quiet = still();

    /* the composer */
    var typedN = 0;
    if (T >= C.open + 0.7 && T < C.send) for (var i = 0; i < TYPE.length; i++) if (T >= C.open + 0.7 + TYPE[i]) typedN++;
    if (typedN !== lastTyped) {
      E.typed.textContent = QUESTION.slice(0, typedN);
      lastTyped = typedN;
    }
    var typing = typedN > 0 && typedN < QUESTION.length;
    var caret = !quiet && T >= C.open + 0.3 && T < C.send && (typing || (T * 1.9) % 1 < 0.55);
    E.caret.style.opacity = caret ? '1' : '0';
    E.ph.style.opacity = String(typedN === 0 && T < C.send ? 1 : p(T, C.send + 0.5, 0.4, enter));
    E.input.classList.toggle('is-focus', T >= C.open + 0.3 && T < C.send + 0.1);
    var busy = p(T, C.send + 0.25, 0.3, enter) * (1 - p(T, C.answer + 0.1, 0.3, enter));
    E.send.style.transform = 'scale(' + (T < C.send ? 1 : lerp(0.9, 1, p(T, C.send, 0.32, pop))).toFixed(3) + ')';
    E.arrow.style.opacity = String(1 - busy);
    E.arrow.style.transform = 'scale(' + lerp(1, 0.5, busy).toFixed(3) + ')';
    E.stop.style.opacity = String(busy);
    E.stop.style.transform = 'scale(' + lerp(0.4, 1, busy).toFixed(3) + ')';

    /* the question: lifted out of the composer, straight up, into its bubble */
    var lift = p(T, C.send + 0.05, 0.7, glide);
    var lifting = T >= C.send && lift < 1;
    E.lift.style.opacity = lifting ? '1' : '0';
    if (lifting) E.lift.style.transform = 'translate(' + lerp(L.from.x, L.to.x, lift).toFixed(2) + 'px,' + lerp(L.from.y, L.to.y, lift).toFixed(2) + 'px)';
    var youIn = p(T, C.send + 0.4, 0.4, enter);
    E.youBubble.style.opacity = String(youIn);
    E.youBubble.style.transform = 'scale(' + lerp(0.94, 1, youIn).toFixed(4) + ')';
    E.q.style.opacity = T >= C.send && lift >= 1 ? '1' : '0';
    var youLbl = p(T, C.send + 0.55, 0.35, enter);
    E.youLabel.style.opacity = String(youLbl);
    E.youLabel.style.transform = 'translateY(' + ((1 - youLbl) * 6).toFixed(2) + 'px)';

    /* Vee's label: the name, the mascot, and what it is doing */
    var lbl = p(T, C.think, 0.4, enter);
    E.ansLabel.style.opacity = String(lbl);
    E.ansLabel.style.transform = 'translateY(' + ((1 - lbl) * 6).toFixed(2) + 'px)';
    if (veeCanvas) veeCanvas.style.transform = 'scale(' + clamp(p(T, C.think, 0.5, pop), 0, 1.2).toFixed(3) + ')';
    roll(E.thinking, C.think + 0.15, C.answer, 18);
    roll(E.status, C.answer + 0.26, null, 18);
    if (!quiet) E.thinking.style.backgroundPosition = (100 - (((T - C.think) / 1.6) % 1) * 100).toFixed(1) + '% 0';

    /* the reply: a ticker over the matrix, then the answer */
    var bIn = p(T, C.read, 0.45, enter);
    var grow = p(T, C.answer + 0.15, 0.7, glide);
    var H = lerp(lerp(0, L.hThink, bIn), L.H, grow);
    E.bubble.style.height = H.toFixed(2) + 'px';
    E.bubble.style.opacity = String(clamp(bIn * 1.6, 0, 1));
    E.ticker.style.opacity = String(1 - p(T, C.answer, 0.28, enter));
    roll(tick[0].el, C.read + 0.1, C.filter, 22);
    roll(tick[1].el, C.filter, C.check, 22);
    roll(tick[2].el, C.check, null, 22);
    var found = matrix() || 0;
    var nums = [
      String(Math.round(412 * lin(T, C.read + 0.35, 1.1))),
      String(Math.round(lerp(412, WALLS, p(T, C.filter + 0.15, 0.9, enter)))),
      String(found)
    ];
    for (var n = 0; n < 3; n++) {
      if (nums[n] !== lastNums[n]) {
        tick[n].n.textContent = nums[n];
        lastNums[n] = nums[n];
      }
    }
    tick[2].cnt.classList.toggle('is-hot', found > 0);

    for (var w = 0; w < words.length; w++) {
      var a = p(T, C.answer + 0.35 + w * 0.065, 0.36, enter);
      words[w].style.opacity = String(a);
      words[w].style.transform = a < 1 ? 'translateY(' + ((1 - a) * 7).toFixed(2) + 'px)' : 'none';
    }
    E.rule.style.opacity = String(p(T, C.answer + 0.9, 0.4, enter));
    for (var r = 0; r < rowEls.length; r++) {
      var ra = p(T, C.answer + 0.95 + r * 0.08, 0.4, enter);
      rowEls[r].style.opacity = String(ra);
      rowEls[r].style.transform = ra < 1 ? 'translateX(' + ((1 - ra) * -8).toFixed(2) + 'px)' : 'none';
    }
    var chip = p(T, C.answer + 1.3, 0.4, enter);
    E.chip.style.opacity = String(chip);

    /* the transcript keeps its newest line in view */
    var bottom = L.yYou - L.rowGap +
      (L.rowGap + L.hYou) * p(T, C.send + 0.3, 0.5, glide) +
      (L.rowGap + L.hLabel) * p(T, C.think, 0.4, glide) +
      (L.bubGap + H) * p(T, C.read, 0.3, glide) +
      L.hChip * p(T, C.answer + 1.2, 0.5, glide) + L.padB;
    scroller.style.setProperty('--scroll', Math.min(0, L.threadH - bottom).toFixed(2) + 'px');

    /* the mascot: thinking, reading, a hop at each finding, then done */
    if (veeCanvas && S.vee) {
      var state = 'thinking';
      var since = C.think;
      if (T >= C.answer + 0.3) {
        state = 'done';
        since = C.answer + 0.3;
      } else if (T >= C.check) {
        state = 'reading';
        since = C.read;
        // One hop for each finding: `found` for half a second from the newest one.
        var newest = -1;
        for (var f = 0; f < flagged.length; f++) {
          var kk = flagged[f].k;
          var tb = beamAt(Math.floor(kk / 2) * L.pitchB + L.pitchB / 2);
          if (T >= tb && T < tb + 0.5 && tb > newest) newest = tb;
        }
        if (newest >= 0) {
          state = 'found';
          since = newest;
        }
      } else if (T >= C.read) {
        state = 'reading';
        since = C.read;
      }
      S.vee.pin(veeCanvas, state, quiet ? 0 : (T - since) * 8);
      // The large Vee in the heading does what the small one does, and rests when it rests.
      if (bigVee) {
        if (T >= C.think && T < C.end) S.vee.pin(bigVee, state, quiet ? 0 : (T - since) * 8);
        else S.vee.set(bigVee, 'idle');
      }
    }
  }

  /* ── the controls ── */
  var ctl = document.getElementById('rp-ctl');
  var playBtn = document.getElementById('rp-play');
  var prevBtn = document.getElementById('rp-prev');
  var nextBtn = document.getElementById('rp-next');
  var fill = document.getElementById('rp-fill');
  var clockEl = document.getElementById('rp-time');
  var stepList = document.getElementById('rp-steps');
  var now = document.getElementById('rp-now');
  var stepBtns = [];
  var playing = false;
  var raf = 0;
  var lastTs = 0;
  var used = false;

  function stepAt(t) {
    var k = 0;
    for (var i = 0; i < STARTS.length; i++) if (t >= STARTS[i]) k = i;
    return k;
  }
  function chrome() {
    if (fill) fill.style.setProperty('--at', clamp(T / C.end, 0, 1).toFixed(4));
    if (clockEl) clockEl.textContent = Math.floor(Math.min(T, C.end)) + ' s';
    var k = stepAt(T);
    stepBtns.forEach(function (b, i) {
      if (i === k) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    if (prevBtn) prevBtn.disabled = k === 0 && T <= (still() ? ENDS : STEPS)[0];
    if (nextBtn) nextBtn.disabled = T >= C.end;
    if (playBtn) {
      playBtn.classList.toggle('is-playing', playing);
      playBtn.setAttribute('aria-label', playing ? 'Pause the replay' : T >= C.end ? 'Play the replay again' : 'Play the replay');
    }
  }
  function show() {
    frame();
    chrome();
  }
  function loop(ts) {
    if (!playing) return;
    var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    T += dt;
    if (T >= C.end) {
      T = C.end;
      playing = false;
    }
    show();
    if (playing) raf = window.requestAnimationFrame(loop);
  }
  function pause() {
    playing = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(quietT);
    chrome();
  }
  var quietT = 0;
  function play() {
    if (T >= C.end) T = 0;
    playing = true;
    lastTs = 0;
    if (still()) {
      // Reduced motion: no movement at all — one finished state after another.
      var hop = function () {
        if (!playing) return;
        var k = 0;
        while (k < ENDS.length - 1 && ENDS[k] <= T + 0.001) k++;
        T = ENDS[k];
        if (T >= C.end) playing = false;
        show();
        if (playing) quietT = window.setTimeout(hop, 1700);
      };
      hop();
      return;
    }
    chrome();
    raf = window.requestAnimationFrame(loop);
  }
  function jump(k, say) {
    pause();
    k = clamp(k, 0, STEPS.length - 1);
    T = (still() ? ENDS : STEPS)[k];
    show();
    if (say && now && stepBtns[k]) {
      var parts = Array.prototype.map.call(stepBtns[k].children, function (c) { return c.textContent; });
      now.textContent = 'Step ' + (k + 1) + ' of ' + STEPS.length + ': ' + parts.join('. ');
    }
  }

  if (stepList) {
    Array.prototype.forEach.call(stepList.children, function (li, k) {
      var b = document.createElement('button');
      b.type = 'button';
      while (li.firstChild) b.appendChild(li.firstChild);
      li.appendChild(b);
      li.className = 'is-btn';
      b.addEventListener('click', function () {
        used = true;
        jump(k, false);
      });
      stepBtns.push(b);
    });
  }
  if (playBtn) {
    playBtn.addEventListener('click', function () {
      used = true;
      if (playing) pause();
      else play();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      used = true;
      var at = still() ? ENDS : STEPS;
      var k = at.length - 1;
      while (k > 0 && at[k] >= T - 0.001) k--;
      jump(k, true);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      used = true;
      var at = still() ? ENDS : STEPS;
      var k = 0;
      while (k < at.length - 1 && at[k] <= T + 0.001) k++;
      jump(k, true);
    });
  }

  /* ── switch it on ── */
  function renew() {
    var was = playing;
    if (was) pause();
    measure();
    lastTyped = -1;
    lastNums = ['', '', ''];
    show();
    if (was) play();
  }
  E.lift.textContent = QUESTION;
  rp.setAttribute('aria-hidden', 'true');
  measure();
  if (ctl) ctl.hidden = false;
  show();

  var resizeT = 0;
  function later() {
    window.clearTimeout(resizeT);
    resizeT = window.setTimeout(renew, 120);
  }
  window.addEventListener('resize', later);
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(renew);
  window.addEventListener('load', renew);
  if (S.theme) S.theme.onChange(function () { window.setTimeout(renew, 30); });
  if (S.onStill) S.onStill(function () { pause(); renew(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && playing) pause();
  });

  // Once, when the panel first comes into view — never under reduced motion.
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0] || !entries[0].isIntersecting) return;
      io.disconnect();
      if (!used && !still() && !playing) {
        T = 0;
        play();
      }
    }, { threshold: 0.6 });
    io.observe(rp);
  }
})();
