/*
 * warp.js 2.0
 * Talks to the Warpdrive backend. Load it with <script src="/warp.js"></script>.
 *
 * Every console feature is a named point, like system.wifi.strength.
 *
 *   warp.get(path)           read a value
 *   warp.set(path, value)    change a value
 *   warp.toggle(path)        flip a bool
 *   warp.call(path, args)    run an action
 *   warp.watch(path, fn)     fn(value) now and on every change, returns a stop function
 *   warp.on(pattern, fn)     changes and events only, patterns can end in *
 *
 * The full list of points is in POINTS.md, or call warp.points().
 * For desktop development, also load /warp-mock.js. On the console it does nothing.
 */
(function () {
  'use strict';
  if (window.warp) return;

  const VERSION = '2.0.0';
  // API version this library was written for. The backend reports its own as shell.api.
  const API = 2;

  const listeners = new Map(); // pattern -> Set of functions
  const cache = new Map();     // path -> last value seen
  const pending = new Map();   // request id -> { resolve, reject }
  let nextId = 0;

  class WarpError extends Error {
    constructor(code, message, path) {
      super(message);
      this.name = 'WarpError';
      this.code = code;
      this.path = path;
    }
  }

  function matches(pattern, path) {
    if (pattern === path || pattern === '*') return true;
    return pattern.endsWith('*') && path.startsWith(pattern.slice(0, -1));
  }

  function emit(path, value) {
    cache.set(path, value);
    for (const [pattern, fns] of listeners) {
      if (!matches(pattern, path)) continue;
      for (const fn of [...fns]) {
        try { fn(value, path); } catch (e) { console.error('[warp] listener for ' + path + ' failed', e); }
      }
    }
  }

  // The native backend calls these two functions.
  window.__warp = {
    reply(id, r) {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (r.ok) p.resolve(r.value === undefined ? null : r.value);
      else p.reject(new WarpError(r.code || 'failed', r.error || 'Request failed', p.path));
    },
    event: emit,
  };

  const native = window.WarpNative ? {
    request(path, op, arg) {
      return new Promise((resolve, reject) => {
        const id = 'r' + (++nextId);
        pending.set(id, { resolve, reject, path });
        window.WarpNative.request(id, path, op, arg === undefined ? '' : JSON.stringify(arg));
      });
    },
    points: () => Promise.resolve(JSON.parse(window.WarpNative.points())),
    subscribe(pattern, delta) {
      try { window.WarpNative.subscribe(pattern, delta); } catch (e) { /* older backends */ }
    },
  } : null;

  // Set by warp-mock.js when there is no console.
  let mock = null;
  const backend = () => native || mock;

  function request(path, op, arg) {
    const b = backend();
    if (!b) return Promise.reject(new WarpError('no_backend', 'No Warpdrive backend. On a desktop, load /warp-mock.js.', path));
    return b.request(path, op, arg).then(v => {
      if (op !== 'call') cache.set(path, v);
      return v;
    });
  }

  let pointList = null;
  function points() {
    const b = backend();
    if (!b) return Promise.reject(new WarpError('no_backend', 'No Warpdrive backend', null));
    if (!pointList) pointList = b.points().catch(e => { pointList = null; throw e; });
    return pointList;
  }

  const warp = {
    version: VERSION,
    api: API,
    WarpError,

    /** True when running on a console, false with the mock or with nothing. */
    get native() { return !!native; },
    get mock() { return !native && !!mock; },

    get: path => request(path, 'get'),
    set: (path, value) => request(path, 'set', value),
    toggle: path => request(path, 'toggle'),
    call: (path, args) => request(path, 'call', args || {}),

    on(pattern, fn) {
      if (!listeners.has(pattern)) listeners.set(pattern, new Set());
      listeners.get(pattern).add(fn);
      backend()?.subscribe(pattern, 1);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.get(pattern)?.delete(fn);
        backend()?.subscribe(pattern, -1);
      };
    },

    watch(path, fn) {
      // Called once with the current value, then on each change. If a change arrives
      // before the first read finishes, the read result is dropped as out of date.
      let seen = false;
      const off = warp.on(path, (v, p) => { seen = true; fn(v, p); });
      warp.get(path).then(
        v => { if (!seen) { seen = true; fn(v, path); } },
        e => console.warn('[warp] could not read ' + path + ': ' + e.message),
      );
      return off;
    },

    /** Last value seen for a path, without asking the backend. */
    peek: path => cache.get(path),

    /** Every point: [{ path, kind, doc, readable, writable }]. */
    points,

    /** Whether the backend has a point, for features that only some consoles support. */
    has: path => points().then(list => list.some(p => p.path === path), () => false),

    /** Library and backend versions. */
    async info() {
      let backendVersion = null, backendApi = null;
      try { [backendVersion, backendApi] = await Promise.all([warp.get('shell.version'), warp.get('shell.api')]); } catch (e) { /* older backend */ }
      return { library: VERSION, api: API, backend: backendVersion, backendApi, native: !!native };
    },

    /** Turn keyboard input into input.button events. Off by default. */
    keyboard(on = true, map) {
      keys = on ? Object.assign({}, DEFAULT_KEYS, map || {}) : null;
    },
  };

  // Resolves when a backend is available, rejects if the page finished loading without one.
  warp.ready = new Promise((resolve, reject) => {
    const check = () => backend() ? resolve() : reject(new WarpError('no_backend', 'No Warpdrive backend', null));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once: true });
    else setTimeout(check, 0);
  });
  warp.ready.catch(() => {});

  // Used by warp-mock.js.
  warp._attachMock = function (create) {
    if (native || mock) return false;
    mock = create(emit);
    for (const pattern of listeners.keys()) mock.subscribe(pattern, listeners.get(pattern).size);
    return true;
  };

  /* Keyboard mapping, used when warp.keyboard() is on. Keys typed into text fields, and keys a page
     already handled with preventDefault(), are left alone. */
  const DEFAULT_KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Enter: 'a', Escape: 'b', Backspace: 'b', x: 'x', y: 'y',
    q: 'l1', e: 'r1', Tab: 'select', m: 'start', g: 'guide',
  };
  let keys = null;
  function onKey(ev, pressed) {
    if (!keys || ev.defaultPrevented) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const button = keys[ev.key];
    if (!button) return;
    ev.preventDefault();
    emit('input.button', { button, pressed, repeat: pressed && ev.repeat, keyboard: true });
  }
  addEventListener('keydown', e => onKey(e, true));
  addEventListener('keyup', e => onKey(e, false));

  window.warp = warp;
})();
