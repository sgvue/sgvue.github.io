/*
 * SGVue site — the capture manifest. Every image-driven piece of the page reads its files from
 * here or from its own <img>, so new captures drop in by file name and no markup is written per
 * frame. All captures are of the app's built-in demo building.
 *
 * A script rather than a JSON file on purpose: the page's Content-Security-Policy allows
 * connections to api.github.com only, so the page cannot fetch() a file of its own.
 */
(function () {
  'use strict';

  var S = (window.SGVue = window.SGVue || {});

  S.shots = {
    /*
     * The hero's flipbook: one level cut moving through the building, one camera for every
     * frame, pixel for pixel. A frame is named by the height of its cut in millimetres above
     * the project zero (L1 is +0), from `from` to `to` in steps of `step` — 200, 700, 1 200 …
     * 15 700, which is the Section card's own ±500. `start` is the frame the page's own <img>
     * shows before any script runs: the plane above the roof, nothing cut yet.
     */
    cut: {
      size: [1280, 800],
      widths: [640, 1280],
      themes: ['dark'], // add 'light' when light captures exist: img/cut/light/…
      file: 'img/cut/{theme}/z{z}-{w}.webp',
      storeys: [
        ['Foundation', -1000],
        ['L1', 0],
        ['L2', 4000],
        ['L3', 7500],
        ['L4', 11000],
        ['Roof', 14500]
      ],
      chip: 1200, // a level chip puts the cut this far above its storey, as the app does
      from: 200,
      to: 15700,
      step: 500,
      start: 15700,
      rest: 5200, // where the opening sweep comes to rest: level L2, 1 200 mm above
      sweep: 2, // the sweep shows every second frame, so only those are fetched ahead
      clear: 15500, // the top of the parapet: a cut at or above it passes through nothing
      // The picture's description, renewed as the cut moves; {where} is "level L2, 1 200 mm above".
      alt: 'The demo building in SGVue’s 3D view, cut at {where}. Everything the plane passes through is outlined in a thick teal line.'
    }
  };
})();
