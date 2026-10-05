/*
 * SGVue site — Vee, the assistant's pixel mascot, alive on the page.
 *
 * `grid` is the app's own sprite function (`veeGrid`, itself the owner's design handoff ported
 * verbatim): a 16 × 16 grid at 8 frames a second, five states — idle, thinking, reading, found,
 * done — and seven colour roles. Five of the roles are the page's design tokens and two are the
 * mascot's own, per theme, exactly as in the app.
 *
 * Every <canvas class="vee" data-vee="idle"> on the page is drawn here, at a whole number of
 * device pixels to a cell so each cell stays a crisp square. One shared clock; it stops while
 * the tab is hidden and does not run under reduced motion, where each sprite holds one frame.
 */
(function () {
  'use strict';

  var S = (window.SGVue = window.SGVue || {});
  var SIZE = 16;
  var FRAME_MS = 125;

  /* The body, 12 × 12, placed at (2, 3) in the grid. */
  var ROWS = [
    '....oooo....',
    '..oottttoo..',
    '.otttttttto.',
    'obttttttttbo',
    'obbbttttbbbo',
    'obbbbttbbbbo',
    'obbbbbbbbbbo',
    'obbbbbbbbbbo',
    'obbbbbbbbbbo',
    '.obbbbbbbbo.',
    '..oobbbboo..',
    '....oooo....'
  ];
  var LIT = ROWS.map(function (r) { return r.replace(/t/g, 'o'); });
  /* The rim's cells, in the order the thinking light runs round them. */
  var PERIM = (function () {
    var pts = [];
    ROWS.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r.charAt(x) === 'o') pts.push([x, y]);
    });
    return pts.sort(function (a, b) {
      return Math.atan2(a[1] - 5.5, a[0] - 5.5) - Math.atan2(b[1] - 5.5, b[0] - 5.5);
    });
  })();
  var PING = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
  var HOP = [0, 1, 2, 1, 0, 0, 0, 0];
  var BOB = [0, 0, 1, 1, 0, 0, 0, 0];

  /**
   * The 16 × 16 cells of state `s` at frame `f`, as 16 strings: a role letter, or `.`.
   *
   *   idle       eyes; a blink on 2 of every 28 frames
   *   thinking   eyes up and darting; a light runs round the rim
   *   reading    a visor with a pip sweeping across it
   *   found      bright eyes, a hop, and a blinking `!`
   *   done       the top facet lit — the V of the SGVue mark — happy eyes, a slow bob
   */
  function grid(s, f) {
    var g = [];
    var x, y;
    for (y = 0; y < SIZE; y++) {
      g.push([]);
      for (x = 0; x < SIZE; x++) g[y].push('.');
    }
    function put(px, py, c) {
      if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) g[py][px] = c;
    }
    var ox = 2;
    var oy = 3 - (s === 'found' ? HOP[f % 8] : s === 'done' ? BOB[f % 8] : 0);
    var rows = s === 'done' ? LIT : ROWS;
    rows.forEach(function (r, ry) {
      for (var rx = 0; rx < r.length; rx++) if (r.charAt(rx) !== '.') put(ox + rx, oy + ry, r.charAt(rx));
    });
    function P(px, py, c) {
      put(ox + px, oy + py, c);
    }
    function box(bx, by, w, h, c) {
      for (var i = 0; i < w; i++) for (var j = 0; j < h; j++) P(bx + i, by + j, c);
    }
    function eyes(dx, dy, c) {
      box(2 + dx, 6 + dy, 2, 2, c);
      box(8 + dx, 6 + dy, 2, 2, c);
    }
    if (s === 'idle') {
      if (f % 28 < 2) {
        box(2, 7, 2, 1, 'e');
        box(8, 7, 2, 1, 'e');
      } else eyes(0, 0, 'e');
    }
    if (s === 'thinking') {
      eyes(f % 12 < 6 ? -1 : 1, -1, 'e');
      for (var i = 0; i < 3; i++) {
        var pt = PERIM[(f * 2 + i) % PERIM.length];
        P(pt[0], pt[1], 'h');
      }
    }
    if (s === 'reading') {
      box(2, 6, 8, 2, 'k');
      var pip = 2 + PING[f % 14];
      box(pip - 1, 6, 3, 2, 's');
      box(pip, 6, 1, 2, 'h');
    }
    if (s === 'found') {
      eyes(0, 0, 'h');
      if (f % 8 < 6) [0, 1, 2, 4].forEach(function (yy) { put(14, yy, 'e'); });
    }
    if (s === 'done') {
      [[2, 7], [3, 6], [4, 7], [7, 7], [8, 6], [9, 7]].forEach(function (q) { P(q[0], q[1], 'e'); });
    }
    return g.map(function (row) { return row.join(''); });
  }

  /* Each role's colour: a design token, read from the page when the sprite is drawn. */
  var ROLE = { o: '--accent', h: '--vee-h', b: '--step-bg', t: '--vee-t', s: '--border-strong', e: '--ink', k: '--vee-k' };
  var colours = null;
  function readColours() {
    var cs = window.getComputedStyle(document.documentElement);
    colours = {};
    for (var r in ROLE) colours[r] = cs.getPropertyValue(ROLE[r]).trim() || '#35C4B6';
  }

  var sprites = [];
  var clock = 0;
  var t0 = 0;
  var timer = 0;

  function still() {
    return !!(S.still && S.still());
  }
  function frameOf(sp) {
    if (sp.pin !== null) return sp.pin;
    if (still()) return sp.state === 'idle' ? sp.offset : 0;
    return sp.state === 'idle' ? clock + sp.offset : Math.max(0, clock - sp.since);
  }
  /** Device pixels to a cell, and the canvas sized to exactly 16 of them. */
  function fit(sp) {
    var dpr = window.devicePixelRatio || 1;
    var want = parseFloat(window.getComputedStyle(sp.c).getPropertyValue('--vee-cell')) || sp.cell;
    var k = Math.max(1, Math.round(want * dpr));
    if (k === sp.k && dpr === sp.dpr) return;
    sp.k = k;
    sp.dpr = dpr;
    sp.c.width = SIZE * k;
    sp.c.height = SIZE * k;
    var css = Math.ceil(((SIZE * k) / dpr) * 1000) / 1000 + 'px';
    sp.c.style.width = css;
    sp.c.style.height = css;
    sp.key = '';
  }
  function draw(sp) {
    var g = grid(sp.state, frameOf(sp));
    var key = g.join('');
    if (key === sp.key) return;
    sp.key = key;
    var ctx = sp.c.getContext('2d');
    if (!ctx) return;
    if (!colours) readColours();
    var k = sp.k;
    ctx.clearRect(0, 0, sp.c.width, sp.c.height);
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var c = g[y].charAt(x);
        if (c === '.') continue;
        ctx.fillStyle = colours[c];
        ctx.fillRect(x * k, y * k, k, k);
      }
    }
  }
  function drawAll() {
    sprites.forEach(draw);
  }
  function tick() {
    clock = Math.floor((Date.now() - t0) / FRAME_MS);
    drawAll();
  }
  function run() {
    var should = sprites.length > 0 && !document.hidden && !still();
    if (should && !timer) {
      t0 = Date.now() - clock * FRAME_MS;
      timer = window.setInterval(tick, FRAME_MS);
    } else if (!should && timer) {
      window.clearInterval(timer);
      timer = 0;
    }
    drawAll();
  }
  function refit() {
    sprites.forEach(function (sp) {
      fit(sp);
      draw(sp);
    });
  }
  function find(canvas) {
    for (var i = 0; i < sprites.length; i++) if (sprites[i].c === canvas) return sprites[i];
    return null;
  }
  function mount(canvas) {
    var had = find(canvas);
    if (had) return had;
    if (!canvas || !canvas.getContext) return null;
    var sp = {
      c: canvas,
      state: canvas.getAttribute('data-vee') || 'idle',
      offset: parseInt(canvas.getAttribute('data-offset'), 10) || 0,
      cell: parseFloat(canvas.getAttribute('data-cell')) || 1,
      since: clock,
      pin: null,
      k: 0,
      dpr: 0,
      key: ''
    };
    sprites.push(sp);
    fit(sp);
    draw(sp);
    return sp;
  }

  S.vee = {
    grid: grid,
    mount: mount,
    /** Put a sprite in a state; it then plays from that state's own first frame. */
    set: function (canvas, state) {
      var sp = find(canvas) || mount(canvas);
      if (!sp) return;
      sp.pin = null;
      if (sp.state !== state) {
        sp.state = state;
        sp.since = clock;
        draw(sp);
      }
    },
    /** Hold a sprite at one frame of one state — a replay drives its own sprite this way. */
    pin: function (canvas, state, frame) {
      var sp = find(canvas) || mount(canvas);
      if (!sp) return;
      sp.state = state;
      sp.pin = Math.max(0, Math.floor(frame));
      draw(sp);
    }
  };

  function start() {
    Array.prototype.forEach.call(document.querySelectorAll('canvas.vee'), mount);
    run();
    document.addEventListener('visibilitychange', run);
    window.addEventListener('resize', refit);
    if (S.onStill) {
      S.onStill(function () {
        sprites.forEach(function (sp) { sp.key = ''; });
        run();
      });
    }
    if (S.theme) {
      S.theme.onChange(function () {
        colours = null;
        sprites.forEach(function (sp) { sp.key = ''; });
        drawAll();
      });
    }
    if (window.matchMedia) {
      // A window moved to a display with another scaling redraws every sprite at its new size.
      var watch = function () {
        var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
        var again = function () {
          refit();
          watch();
        };
        if (mq.addEventListener) mq.addEventListener('change', again, { once: true });
      };
      watch();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
