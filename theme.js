/*
 * SGVue site — the theme, decided before first paint. Loaded in <head>, and kept tiny because it
 * is the one script the page waits for. Everything else is deferred (site.js and the others).
 *
 * The visitor's choice is remembered in localStorage (`sgvue.theme`); with none, the system's
 * light / dark preference decides and is followed when it changes. Nothing is sent anywhere.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var KEY = 'sgvue.theme';
  var mm = typeof window.matchMedia === 'function' ? window.matchMedia : null;
  var dark = mm ? mm('(prefers-color-scheme: dark)') : null;
  var still = mm ? mm('(prefers-reduced-motion: reduce)') : null;
  var heard = [];

  function chosen() {
    try {
      var t = window.localStorage.getItem(KEY);
      return t === 'light' || t === 'dark' ? t : null;
    } catch (e) {
      return null;
    }
  }
  function apply(t) {
    root.setAttribute('data-theme', t);
    for (var i = 0; i < heard.length; i++) {
      try {
        heard[i](t);
      } catch (e) {
        /* one listener failing must not stop the others */
      }
    }
  }
  function watch(query, fn) {
    if (!query) return;
    if (query.addEventListener) query.addEventListener('change', fn);
    else if (query.addListener) query.addListener(fn);
  }

  apply(chosen() || (dark && dark.matches ? 'dark' : 'light'));
  watch(dark, function () {
    if (!chosen()) apply(dark.matches ? 'dark' : 'light');
  });

  window.SGVue = {
    theme: {
      get: function () {
        return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      },
      /** Switch, and remember it when storage allows. */
      set: function (t) {
        if (t !== 'light' && t !== 'dark') return;
        try {
          window.localStorage.setItem(KEY, t);
        } catch (e) {
          /* not remembered, still switched */
        }
        apply(t);
      },
      onChange: function (fn) {
        heard.push(fn);
      }
    },
    /** True while the visitor asks for reduced motion. Read at the moment of use. */
    still: function () {
      return !!(still && still.matches);
    },
    onStill: function (fn) {
      watch(still, fn);
    }
  };
})();
