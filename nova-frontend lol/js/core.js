'use strict';

warp.keyboard(true);

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat())
    if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(kid));
  return el;
}

const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const fail = e => note({ title: 'Something went wrong', text: e?.message || String(e), bad: true });

let lastReported = '';

function reportError(e) {
  const msg = (e?.stack || e?.message || String(e)).slice(0, 2000);
  console.error(e);
  if (msg === lastReported) return;
  lastReported = msg;
  try {
    warp.call('shell.report', { source: 'nova', message: msg }).catch(() => {});
  } catch {}
}

addEventListener('error', e => reportError(e.error || e.message));
addEventListener('unhandledrejection', e => reportError(e.reason));
const call = (path, args) => warp.call(path, args).catch(fail);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function iconUrl(name) {
  return new URL(name.includes('/') ? `assets/${name}.svg` : `assets/icons/${name}.svg`, document.baseURI)
    .href;
}

function setIcon(el, name) {
  if (!name) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.setProperty('--src', `url("${iconUrl(name)}")`);
}

function icon(name, cls = '') {
  const el = h('span', { class: 'i ' + cls });
  setIcon(el, name);
  return el;
}

function paintIcons(root = document) {
  for (const el of $$('[data-i]', root)) {
    el.classList.add('i');
    setIcon(el, el.dataset.i);
  }
}

const btn = k => h('img', { class: 'btn-glyph', src: `assets/buttons/${k}.svg`, alt: k.toUpperCase() });

const pct = v => Math.round((v || 0) * 100) + '%';
const gb = b => (b >= 1e12 ? (b / 1e12).toFixed(1) + ' TB' : (b / 1e9).toFixed(b < 1e10 ? 1 : 0) + ' GB');

function dur(s) {
  if (s == null) return 'n/a';
  s = Math.max(0, Math.round(s));
  const d = Math.floor(s / 86400),
    hr = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${hr}h` : hr ? `${hr}h ${m}m` : `${m}m`;
}

function ago(ms) {
  if (!ms) return 'never';
  const d = (Date.now() - ms) / 1000;
  if (d < 90) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400 * 1.5) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} days ago`;
}

const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : 'n/a');

const FMT = {
  text: v => String(v),
  pct,
  cap,
  dur,
  gb,
  temp: v => v.toFixed(1) + ' °C',
  volt: v => v.toFixed(2) + ' V',
  amp: v => (v > 0 ? '+' : '') + v.toFixed(2) + ' A',
  watt: v => Math.abs(v).toFixed(1) + ' W',
  dbm: v => v + ' dBm',
  mbps: v => v + ' Mbps',
  mhz: v => (v >= 1000 ? (v / 1000).toFixed(2) + ' GHz' : v + ' MHz'),
  hz: v => v + ' Hz',
  rpm: v => v + ' RPM',
  lux: v => Math.round(v) + ' lx',
  mah: v => v + ' mAh',
  ghz: v => v + ' GHz',
  list: v => (v.length ? v.join(', ') : 'n/a'),
  yes: v => (v ? 'Yes' : 'No'),
  onoff: v => (v ? 'On' : 'Off'),
  ssid: v => v || 'Not connected',
  sec: v => (v === 'open' ? 'Open' : String(v).toUpperCase()),
  left: v => (v == null ? '' : warp.peek('system.battery.charging') ? `${dur(v)} to full` : `${dur(v)} left`),
  ram: v => `${gb(v.used)} of ${gb(v.total)}`,
  res: v => `${v.width} × ${v.height}`,
};

const fmt = (name, v) =>
  v == null || (typeof v === 'number' && isNaN(v)) ? 'n/a' : (FMT[name] || FMT.text)(v);

function splitBind(spec) {
  const [path, field] = spec.split(':');
  return [path, v => (field && v ? v[field] : v)];
}

const ACCENTS = [
  ['#1e90ff', 'Blue'],
  ['#e8473a', 'Red'],
  ['#2fb365', 'Green'],
  ['#f28c28', 'Orange'],
  ['#8e5cf0', 'Purple'],
  ['#e0559b', 'Pink'],
  ['#16a8a8', 'Teal'],
  ['#7c8594', 'Grey'],
];

const prefs = Object.assign(
  { theme: 'dark', accent: '#1e90ff', sounds: true, motion: true, signMessages: true },
  (() => {
    try {
      return JSON.parse(localStorage.getItem('nova.prefs')) || {};
    } catch {
      return {};
    }
  })(),
);

function applyPrefs() {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.style.setProperty('--accent', prefs.accent);
  document.body.classList.toggle('reduce', !prefs.motion);
  try {
    localStorage.setItem('nova.prefs', JSON.stringify(prefs));
  } catch {}
  for (const el of $$('[data-pref]')) {
    const [k, v] = el.dataset.pref.split('=');
    el.setAttribute('aria-checked', v === undefined ? !!prefs[k] : String(prefs[k]) === v);
  }
  accentCache = null;
}

const Sound = (() => {
  let ctx = null;
  const bufs = {};
  const names = ['move', 'select', 'back', 'toggle', 'notify', 'error', 'startup'];
  async function load() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      await Promise.all(
        names.map(async n => {
          const r = await fetch(`assets/sounds/${n}.wav`);
          bufs[n] = await ctx.decodeAudioData(await r.arrayBuffer());
        }),
      );
    } catch {
      ctx = null;
    }
  }
  let last = 0;
  function play(n) {
    if (!prefs.sounds || !ctx || !bufs[n]) return;
    if (n === 'move' && performance.now() - last < 40) return;
    last = performance.now();
    if (ctx.state === 'suspended') ctx.resume();
    const s = ctx.createBufferSource();
    s.buffer = bufs[n];
    s.connect(ctx.destination);
    s.start();
  }
  return { load, play };
})();

function bind(root) {
  const offs = [];
  const watch = (path, fn) => offs.push(warp.watch(path, fn));
  for (const el of $$('[data-toggle]', root)) {
    el.setAttribute('role', 'switch');
    watch(el.dataset.toggle, v => {
      el.setAttribute('aria-checked', !!v);
      if (el.classList.contains('qt')) el.hidden = v === null;
    });
    if (!el._wired) {
      el._wired = true;
      el.addEventListener('click', () => {
        Sound.play('toggle');
        warp.toggle(el.dataset.toggle).catch(fail);
      });
    }
  }
  for (const el of $$('[data-slider]', root)) {
    el.setAttribute('role', 'slider');
    watch(el.dataset.slider, v => paintSlider(el, v));
    if (!el._wired) {
      el._wired = true;
      el.addEventListener('click', ev => {
        const t = $('.track', el).getBoundingClientRect();
        if (ev.clientX >= t.left - 12 && ev.clientX <= t.right + 12)
          setSlider(el, (ev.clientX - t.left) / t.width);
      });
    }
  }
  for (const el of $$('[data-call]', root)) {
    if (el._wired) continue;
    el._wired = true;
    el.addEventListener('click', () => {
      el.setAttribute('aria-busy', 'true');
      warp
        .call(el.dataset.call)
        .catch(fail)
        .finally(() => setTimeout(() => el.removeAttribute('aria-busy'), 400));
    });
  }
  for (const el of $$('[data-bind]', root)) {
    const [path, pick] = splitBind(el.dataset.bind);
    watch(path, v => {
      el.textContent = fmt(el.dataset.fmt, pick(v));
    });
  }
  for (const el of $$('[data-meter]', root)) {
    const [path, pick] = splitBind(el.dataset.meter);
    watch(path, v => {
      $('b', el).style.width = pct(pick(v));
    });
  }
  for (const el of $$('[data-graph]', root)) {
    const [path, pick] = splitBind(el.dataset.graph);
    const g = new Graph(el);
    watch(path, v => g.push(pick(v)));
    offs.push(() => g.ro.disconnect());
  }
  for (const el of $$('[data-choice]', root)) {
    const path = el.dataset.choice,
      src = el.dataset.options || '',
      suffix = el.dataset.suffix || '';
    const mark = () => {
      const cur = warp.peek(path);
      for (const b of el.children) b.setAttribute('aria-checked', String(cur) === b.dataset.value);
    };
    const render = opts => {
      el.hidden = !opts?.length;
      el.replaceChildren(
        ...(opts || []).map(o =>
          h(
            'button',
            {
              'data-nav': true,
              'data-value': o,
              onclick: () => {
                Sound.play('toggle');
                warp.set(path, typeof o === 'number' ? o : String(o)).catch(fail);
              },
            },
            typeof o === 'number' ? o + suffix : cap(o),
          ),
        ),
      );
      mark();
    };
    if (src.includes('.')) watch(src, render);
    else render(src.split(',').map(x => (isNaN(+x) ? x : +x)));
    watch(path, mark);
  }
  for (const el of $$('[data-pref]', root)) {
    if (el._wired) continue;
    el._wired = true;
    el.addEventListener('click', () => {
      const [k, v] = el.dataset.pref.split('=');
      prefs[k] = v === undefined ? !prefs[k] : v;
      Sound.play('toggle');
      applyPrefs();
    });
  }
  paintIcons(root);
  applyPrefs();
  return () => offs.splice(0).forEach(f => f());
}

function paintSlider(el, v) {
  el._v = v;
  $('.track b', el).style.width = pct(v);
  $('em', el).textContent = pct(v);
}

const inflight = new Map();

function setSlider(el, v) {
  v = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
  for (const other of $$(`[data-slider="${el.dataset.slider}"]`)) paintSlider(other, v);
  Sound.play('move');
  const path = el.dataset.slider,
    busy = inflight.has(path);
  inflight.set(path, v);
  if (busy) return;
  const flush = () => {
    const val = inflight.get(path);
    warp
      .set(path, val)
      .catch(fail)
      .finally(() => (inflight.get(path) !== val ? flush() : inflight.delete(path)));
  };
  flush();
}

let accentCache = null;

function accentRGB() {
  if (!accentCache) {
    const p = h('i', { style: { display: 'none', color: 'var(--accent)' } });
    document.body.append(p);
    accentCache = getComputedStyle(p).color;
    p.remove();
  }
  return accentCache;
}

const rgba = (rgb, a) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);

class Graph {
  constructor(canvas) {
    const d = canvas.dataset;
    Object.assign(this, {
      canvas,
      data: [],
      fmt: d.fmt || 'text',
      abs: 'abs' in d,
      span: +(d.span || 0),
      min: d.min != null ? +d.min : null,
      max: d.max != null ? +d.max : null,
      foot: canvas.parentElement.querySelector('.gf'),
    });
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(canvas);
  }
  push(v) {
    if (v == null || isNaN(v)) return;
    this.data.push(this.abs ? Math.abs(v) : v);
    if (this.data.length > 40) this.data.shift();
    this.draw();
    if (this.foot) {
      const lo = Math.min(...this.data),
        hi = Math.max(...this.data),
        avg = this.data.reduce((a, b) => a + b, 0) / this.data.length;
      this.foot.innerHTML = `<span>Low<b>${esc(fmt(this.fmt, lo))}</b></span><span>Avg<b>${esc(fmt(this.fmt, avg))}</b></span><span>High<b>${esc(fmt(this.fmt, hi))}</b></span>`;
    }
  }
  range() {
    let lo = Math.min(...this.data),
      hi = Math.max(...this.data);
    if (this.min != null) lo = Math.min(lo, this.min);
    if (this.max != null) hi = Math.max(hi, this.max);
    const need = Math.max(this.span, (hi - lo) * 1.2, 1e-6),
      mid = (lo + hi) / 2;
    let a = mid - need / 2,
      b = mid + need / 2;
    if (this.min != null && a < this.min) {
      b += this.min - a;
      a = this.min;
    }
    if (this.max != null && b > this.max) {
      a -= b - this.max;
      b = this.max;
    }
    return [a, b];
  }
  draw() {
    const c = this.canvas,
      dpr = devicePixelRatio || 1,
      W = Math.round(c.clientWidth * dpr),
      H = Math.round(c.clientHeight * dpr);
    if (!W || !H) return;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    const styles = getComputedStyle(document.documentElement);
    const line = styles.getPropertyValue('--line').trim(),
      faint = styles.getPropertyValue('--faint').trim(),
      ac = accentRGB();
    const n = this.data.length,
      [lo, hi] = n ? this.range() : [0, 1];
    const top = 14 * dpr,
      bot = 4 * dpr,
      py = v => top + (1 - (v - lo) / (hi - lo)) * (H - top - bot);
    x.font = `600 ${10 * dpr}px system-ui, sans-serif`;
    x.textBaseline = 'bottom';
    for (let i = 0; i <= 2; i++) {
      const v = lo + (hi - lo) * (i / 2),
        y = Math.round(py(v)) + 0.5;
      x.strokeStyle = line;
      x.lineWidth = dpr;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(W, y);
      x.stroke();
      if (n && i) {
        x.fillStyle = faint;
        x.fillText(fmt(this.fmt, v), 0, y - 2 * dpr);
      }
    }
    if (n < 2) {
      x.fillStyle = faint;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('Collecting…', W / 2, H / 2);
      x.textAlign = 'start';
      return;
    }
    const step = (W - 6 * dpr) / (n - 1),
      pts = this.data.map((v, i) => [i * step, py(v)]);
    x.beginPath();
    pts.forEach(([px, y], i) => (i ? x.lineTo(px, y) : x.moveTo(px, y)));
    x.strokeStyle = ac;
    x.lineWidth = 2 * dpr;
    x.lineJoin = 'round';
    x.stroke();
    x.lineTo(pts.at(-1)[0], H);
    x.lineTo(0, H);
    x.closePath();
    x.fillStyle = rgba(ac, 0.12);
    x.fill();
    const [lx, ly] = pts.at(-1);
    x.fillStyle = ac;
    x.beginPath();
    x.arc(lx, ly, 3 * dpr, 0, 7);
    x.fill();
  }
}

const layers = [];
const memory = new WeakMap();
let screen = 'home';
const Screens = {};
let lastSpot = null;

function scopes() {
  return layers.length ? [layers.at(-1)] : [$('#' + screen), ...(screen === 'home' ? [$('.top')] : [])];
}

function navItems() {
  return scopes()
    .flatMap(s => $$('[data-nav]', s))
    .filter(el => el.offsetParent !== null && !el.closest('[hidden]') && !el.disabled);
}

function zoneOf(el) {
  return el.closest('[data-zone]') || el.closest('.layer, .screen, .top');
}

function scopeOf(el) {
  return el.closest('.layer') || el.closest('.screen') || $('#home');
}

function current() {
  const items = navItems();
  return items.includes(document.activeElement) ? document.activeElement : null;
}

function center(r) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function scrollerOf(el) {
  for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

function reveal(el) {
  const row = el.closest('.row-games');
  if (row) {
    row.scrollTo({
      left: Math.max(0, el.offsetLeft - row.clientWidth * 0.08),
      behavior: prefs.motion ? 'smooth' : 'auto',
    });
    return;
  }
  const box = scrollerOf(el);
  if (!box) return;
  const items = $$('[data-nav]', box).filter(e => e.offsetParent !== null && !e.closest('[hidden]'));
  if (el === items[0]) box.scrollTop = 0;
  else if (el === items.at(-1)) box.scrollTop = box.scrollHeight;
  else el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

let lastTick = 0;

function focus(el, quiet = false, scroll = true) {
  if (!el) return;
  if (el.tabIndex < 0) el.tabIndex = -1;
  const moved = document.activeElement !== el;
  el.focus({ preventScroll: true });
  memory.set(zoneOf(el), el);
  memory.set(scopeOf(el), el);
  if (scroll) reveal(el);
  lastSpot = { scope: scopeOf(el), zone: zoneOf(el), ...center(el.getBoundingClientRect()) };
  el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true }));
  if (moved && !quiet) {
    Sound.play('move');
    const now = performance.now();
    if (now - lastTick > 70) {
      lastTick = now;
      warp.call('system.haptics.tick').catch(() => {});
    }
  }
  updatePrompts();
}

function closestTo(items, spot) {
  const pool = items.filter(e => zoneOf(e) === spot.zone);
  let best = null,
    bestD = Infinity;
  for (const el of pool.length ? pool : items) {
    const c = center(el.getBoundingClientRect()),
      d = Math.hypot(c.x - spot.x, c.y - spot.y);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best;
}

function enter() {
  const items = navItems(),
    scope = layers.at(-1) || $('#' + screen),
    remembered = memory.get(scope);
  if (items.includes(remembered)) return focus(remembered, true);
  if (lastSpot?.scope === scope && items.length) return focus(closestTo(items, lastSpot), true);
  focus(items.find(e => e.hasAttribute('data-autofocus')) || items[0], true);
}

function pick(cur, dir, list) {
  const a = cur.getBoundingClientRect(),
    ac = center(a),
    horiz = dir === 'left' || dir === 'right';
  let best = null,
    bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect(),
      bc = center(b);
    let gap, ahead;
    if (dir === 'right') {
      gap = b.left - a.right;
      ahead = bc.x > ac.x + 1 && gap > -0.3 * Math.min(a.width, b.width);
    } else if (dir === 'left') {
      gap = a.left - b.right;
      ahead = bc.x < ac.x - 1 && gap > -0.3 * Math.min(a.width, b.width);
    } else if (dir === 'down') {
      gap = b.top - a.bottom;
      ahead = bc.y > ac.y + 1 && gap > -0.3 * Math.min(a.height, b.height);
    } else {
      gap = a.top - b.bottom;
      ahead = bc.y < ac.y - 1 && gap > -0.3 * Math.min(a.height, b.height);
    }
    if (!ahead) continue;
    const overlap = horiz
      ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      : Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const off = horiz ? Math.abs(bc.y - ac.y) : Math.abs(bc.x - ac.x);
    const score = Math.max(gap, 0) + (overlap > 0 ? 0 : 60 - overlap * 4) + off * 0.25;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

function firstVisible(zone, pool) {
  const box = scrollerOf(zone) || zone,
    r = (box === zone ? zone : box).getBoundingClientRect();
  const items = pool.filter(e => zoneOf(e) === zone);
  return (
    items.find(e => {
      const b = e.getBoundingClientRect();
      return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
    }) || items[0]
  );
}

function move(dir) {
  const cur = current();
  if (!cur) return enter();
  cur.dispatchEvent(new CustomEvent('navleave', { bubbles: true, detail: dir }));
  const pool = navItems(),
    myZone = zoneOf(cur);

  const named = cur.dataset['nav' + dir[0].toUpperCase() + dir.slice(1)];
  if (named) {
    const t = named
      .split(',')
      .map(q => $(q.trim()))
      .find(el => el && pool.includes(el));
    if (t) return focus(t);
  }

  let best = null;
  if (dir === 'up' || dir === 'down') {
    best = pick(
      cur,
      dir,
      pool.filter(el => zoneOf(el) === myZone),
    );
    if (!best) {
      const mine = myZone.getBoundingClientRect();
      best = pick(
        cur,
        dir,
        pool.filter(el => {
          const r = zoneOf(el).getBoundingClientRect();
          return Math.min(r.right, mine.right) - Math.max(r.left, mine.left) > 0;
        }),
      );
    }
  } else best = pick(cur, dir, pool);
  if (!best) return;
  const z = zoneOf(best);
  if (z !== myZone) {
    const m = memory.get(z);
    if (m && m.isConnected && pool.includes(m)) best = m;
    else if (z.dataset.enter === 'first') best = firstVisible(z, pool) || best;
  }
  focus(best);
}

function openLayer(el) {
  el.hidden = false;
  layers.push(el);
  enter();
}

function closeLayer(el) {
  el.hidden = true;
  const i = layers.indexOf(el);
  if (i >= 0) layers.splice(i, 1);
  enter();
}

function go(id) {
  if (!Screens[id]) return;
  if (id !== screen) {
    Screens[screen]?.leave?.();
  }
  const was = screen;
  screen = id;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  const s = $('#' + id);
  $('#where-name').textContent = s.dataset.name;
  setIcon($('#where-icon'), s.dataset.icon);
  listenStick(id !== 'home');
  if (was !== id || !Screens[id]._entered) {
    Screens[id]._entered = true;
    Screens[id].enter?.();
  }
  if (!layers.length) enter();
  updatePrompts();
}

function activeScroller() {
  if (!layers.length) {
    const s = Screens[screen]?.scroller?.();
    if (s) return s;
  }
  const el = current();
  return el ? scrollerOf(el) : null;
}

function scrollIn(box, dy) {
  if (!box || !dy) return;
  const before = box.scrollTop;
  box.scrollTop += dy;
  if (box.scrollTop === before) return;
  const el = current();
  if (!el || !box.contains(el)) return;
  const r = box.getBoundingClientRect(),
    b = el.getBoundingClientRect();
  if (b.top >= r.top && b.bottom <= r.bottom) return;
  const inView = $$('[data-nav]', box).filter(e => {
    if (e.offsetParent === null || e.closest('[hidden]')) return false;
    const q = e.getBoundingClientRect();
    return q.top >= r.top && q.bottom <= r.bottom;
  });
  if (inView.length) focus(dy > 0 ? inView[0] : inView.at(-1), true, false);
}

let stickY = 0,
  stickLoop = 0;

function onStick(st) {
  stickY = Math.abs(st.ry) > 0.2 ? st.ry : 0;
  if (stickY && !stickLoop) {
    let last = performance.now();
    const step = now => {
      if (!stickY) {
        stickLoop = 0;
        return;
      }
      const t = Math.min(50, now - last);
      last = now;
      const v = (Math.abs(stickY) - 0.2) / 0.8;
      scrollIn(activeScroller(), Math.sign(stickY) * v * v * 1.6 * t);
      stickLoop = requestAnimationFrame(step);
    };
    stickLoop = requestAnimationFrame(step);
  }
}

let offStick = null;

function listenStick(on) {
  if (on && !offStick) offStick = warp.on('input.stick', onStick);
  if (!on && offStick) {
    offStick();
    offStick = null;
    stickY = 0;
  }
}

function pageScroll(dir) {
  const box = activeScroller();
  if (box) scrollIn(box, dir * box.clientHeight * 0.8);
}

function updateFade(box) {
  if (!box?.classList?.contains('fades')) return;
  const up = box.scrollTop > 2,
    down = box.scrollTop + box.clientHeight < box.scrollHeight - 2;
  box.dataset.fade = (up ? 'up ' : '') + (down ? 'down' : '');
}

document.addEventListener('scroll', e => updateFade(e.target), true);

function updateFades() {
  $$('.fades').forEach(updateFade);
}

new ResizeObserver(updateFades).observe(document.body);

function updatePrompts() {
  const el = current(),
    top = layers.at(-1);
  let list;
  if (top === $('#dialog'))
    list = kbOpen()
      ? [
          ['l+r', 'Cursor'],
          ['y', 'Delete'],
          ['x', 'Space'],
          ['start', 'Done'],
          ['b', 'Cancel'],
        ]
      : [
          ['b', 'Back'],
          ['a', 'OK'],
        ];
  else if (top)
    list = [
      ['b', 'Close'],
      ['a', 'Select'],
    ];
  else
    list = Screens[screen]?.prompts?.(el) || [
      ['b', 'Back'],
      ['a', 'OK'],
    ];
  if (el?.dataset.slider) list = list.map(p => (p[0] === 'a' ? ['dpad', 'Adjust'] : p));
  $('#prompts').replaceChildren(
    ...list.map(([k, t]) => h('span', { class: 'p' }, ...k.split('+').map(btn), t)),
  );
}

let dialogResolve = null;

function dialog({ title, text = '', extra = null, actions = [['OK', true]] }) {
  if (dialogResolve) dialogClose(null);
  $('#dialog-title').textContent = title;
  $('#dialog-text').textContent = text;
  $('#dialog-text').hidden = !text;
  $('#dialog-extra').replaceChildren(...(extra ? [extra] : []));
  $('#dialog-actions').replaceChildren(
    ...actions.map(([label, primary, danger]) =>
      h(
        'button',
        {
          class: 'chip' + (primary ? ' primary' : '') + (danger ? ' danger' : ''),
          'data-nav': true,
          'data-autofocus': primary ? '' : null,
          onclick: () => {
            Sound.play('select');
            dialogClose(label);
          },
        },
        label,
      ),
    ),
  );
  memory.delete($('#dialog'));
  openLayer($('#dialog'));
  return new Promise(r => {
    dialogResolve = r;
  });
}

function dialogClose(value) {
  const r = dialogResolve;
  dialogResolve = null;
  closeLayer($('#dialog'));
  r?.(value);
}

const KB_LETTERS = [
  '1234567890',
  'qwertyuiop',
  "asdfghjkl'",
  ['shift', ...'zxcvbnm', 'del'],
  ['sym', ',', 'space', '.', 'left', 'right', 'done'],
];

const KB_SYMBOLS = [
  '1234567890',
  '!@#$%^&*()',
  '-_=+[]{};:',
  ['/', '?', '\\', '|', '"', '<', '>', '`', '~', 'del'],
  ['sym', ',', 'space', '.', 'left', 'right', 'done'],
];

const KB_LABEL = { shift: '⇧', del: '⌫', space: 'space', left: '←', right: '→' };
const KB_SIZE = { shift: 1.5, del: 1.5, sym: 1.5, space: 3, done: 1.5 };

function kbOpen() {
  return layers.at(-1) === $('#dialog') && $('#dialog').classList.contains('kb');
}

function askText({
  title,
  text = '',
  value = '',
  secret = false,
  done = 'Done',
  allowEmpty = false,
  max = 500,
}) {
  let val = String(value || '').slice(0, max),
    pos = val.length;
  let shift = 0,
    lastShift = 0,
    sym = false,
    show = !secret;

  const field = h('div', {
    class: 'kb-field',
    onpointerdown: () => {
      pos = val.length;
      paint();
    },
  });
  const count = h('small', { class: 'kb-count' });
  const keys = h('div', { class: 'osk' });
  const eye = secret
    ? h('button', {
        class: 'chip',
        'data-nav': true,
        onclick: () => {
          show = !show;
          paint();
        },
      })
    : null;
  const cancel = h('button', { class: 'chip', 'data-nav': true, onclick: () => dialogClose(null) }, 'Cancel');

  const insert = t => {
    t = t.slice(0, max - val.length);
    if (!t) return;
    val = val.slice(0, pos) + t + val.slice(pos);
    pos += t.length;
    if (shift === 1) shift = 0;
    paint();
  };
  const erase = () => {
    if (pos) {
      val = val.slice(0, pos - 1) + val.slice(pos);
      pos--;
      paint();
    }
  };
  const caret = d => {
    pos = Math.max(0, Math.min(val.length, pos + d));
    paint();
  };
  const finish = () => {
    if (val || allowEmpty) dialogClose(done);
  };
  const press = k => {
    Sound.play('move');
    if (k === 'shift') {
      const now = performance.now();
      shift = shift === 0 ? (now - lastShift < 400 ? 2 : 1) : shift === 1 && now - lastShift < 400 ? 2 : 0;
      lastShift = now;
      paint();
    } else if (k === 'sym') {
      sym = !sym;
      build();
    } else if (k === 'del') erase();
    else if (k === 'space') insert(' ');
    else if (k === 'left') caret(-1);
    else if (k === 'right') caret(1);
    else if (k === 'done') finish();
    else insert(shift ? k.toUpperCase() : k);
  };

  function build() {
    const at = document.activeElement?.id;
    keys.replaceChildren(
      ...(sym ? KB_SYMBOLS : KB_LETTERS).map((row, r) => {
        const list = [...row];
        return h(
          'div',
          { class: 'osk-row' },
          ...list.map((k, c) =>
            h('button', {
              class: 'key' + (k.length > 1 ? ' fn' : '') + (k === 'done' ? ' go' : ''),
              id: `kb-${r}-${c}`,
              'data-nav': true,
              'data-k': k,
              'data-repeat': k === 'shift' || k === 'sym' || k === 'done' ? null : '',
              'data-nav-left': c === 0 ? `#kb-${r}-${list.length - 1}` : null,
              'data-nav-right': c === list.length - 1 ? `#kb-${r}-0` : null,
              style: { flexGrow: KB_SIZE[k] || 1 },
              onclick: () => press(k),
            }),
          ),
        );
      }),
    );
    paint();
    const again = at && $('#' + at, keys);
    if (again) focus(again, true);
  }

  function paint() {
    const shown = show ? val : '•'.repeat(val.length);
    field.replaceChildren(
      ...(val
        ? [h('span', {}, shown.slice(0, pos)), h('i', { class: 'kb-caret' }), h('span', {}, shown.slice(pos))]
        : [h('i', { class: 'kb-caret' }), h('span', { class: 'kb-hint' }, text || 'Type here')]),
    );
    field.scrollTop = field.scrollHeight;
    count.textContent = val.length > max * 0.8 ? `${val.length} / ${max}` : '';
    if (eye) eye.textContent = show ? 'Hide' : 'Show';
    for (const b of $$('.key', keys)) {
      const k = b.dataset.k;
      b.textContent =
        k === 'sym'
          ? sym
            ? 'abc'
            : '#+='
          : k === 'done'
            ? done
            : KB_LABEL[k] || (shift ? k.toUpperCase() : k);
      if (k === 'shift') b.dataset.state = ['', 'once', 'lock'][shift];
      if (k === 'done') b.setAttribute('aria-disabled', !val && !allowEmpty);
    }
  }

  const offPad = warp.on('input.button', e => {
    if (!e.pressed || !kbOpen()) return;
    if (e.button === 'y') erase();
    else if (e.button === 'x') insert(' ');
    else if (e.button === 'l1') caret(-1);
    else if (e.button === 'r1') caret(1);
    else if (e.button === 'select' && !e.repeat) press('shift');
    else if (e.button === 'start' && !e.repeat) finish();
  });

  const onKey = e => {
    if (!kbOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    if (e.type === 'keydown') {
      if (e.key.length === 1) insert(e.key);
      else if (e.key === 'Backspace') erase();
      else if (e.key === 'Delete') {
        val = val.slice(0, pos) + val.slice(pos + 1);
        paint();
      } else if (e.key === 'Home') caret(-pos);
      else if (e.key === 'End') caret(val.length);
      else if (e.key === 'Enter') finish();
      else used = false;
    } else used = e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter';
    if (used) e.preventDefault();
  };
  const onPaste = e => {
    if (kbOpen()) {
      insert((e.clipboardData?.getData('text') || '').replace(/\s*\n\s*/g, ' '));
      e.preventDefault();
    }
  };
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKey, true);
  addEventListener('paste', onPaste, true);

  const head = h(
    'div',
    { class: 'kb-head' },
    h('div', { class: 'kb-title' }, h('b', {}, title), text && val ? h('small', {}, text) : null),
    eye,
    cancel,
  );
  const box = h('div', { class: 'kb-body' }, head, h('div', { class: 'kb-box' }, field, count), keys);
  $('#dialog').classList.add('kb');
  const p = dialog({ title: '', extra: box, actions: [] });
  build();
  requestAnimationFrame(() => focus($('#kb-1-0'), true));
  return p.then(r => {
    offPad();
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKey, true);
    removeEventListener('paste', onPaste, true);
    $('#dialog').classList.remove('kb');
    return r === done && (val || allowEmpty) ? val : null;
  });
}

function note({ title, text = '', image = null, iconName = null, bad = false, sound = true }) {
  const n = h(
    'div',
    { class: 'note' + (bad ? ' bad' : '') },
    image ? h('img', { src: image, alt: '' }) : icon(iconName || (bad ? 'close' : 'check')),
    h('div', { style: { minWidth: 0 } }, h('b', {}, title), text ? h('small', {}, text) : null),
  );
  $('#notes').append(n);
  if (sound) Sound.play(bad ? 'error' : 'notify');
  setTimeout(() => {
    n.style.transition = 'opacity .3s, transform .3s';
    n.style.opacity = '0';
    n.style.transform = 'translateX(30%)';
    setTimeout(() => n.remove(), 300);
  }, 3800);
}

function renderList(box, items, key, row, empty) {
  const had = document.activeElement?.closest('.list') === box ? document.activeElement.dataset.key : null;
  if (!items?.length) {
    box.replaceChildren(h('div', { class: 'empty' }, empty));
    return;
  }
  box.replaceChildren(
    ...items.map(it => {
      const r = row(it);
      r.dataset.key = it[key];
      return r;
    }),
  );
  if (had != null) {
    const el = $$('[data-key]', box).find(e => e.dataset.key === String(had));
    if (el) focus(el, true);
  }
}

let focusCheck = 0;

function ensureFocus() {
  if (focusCheck) return;
  focusCheck = requestAnimationFrame(() => {
    focusCheck = 0;
    if (!current()) enter();
  });
}

document.addEventListener('focusout', e => {
  if (!e.relatedTarget) ensureFocus();
});

new MutationObserver(() => {
  ensureFocus();
  requestAnimationFrame(updateFades);
}).observe(document.body, { childList: true, subtree: true });

addEventListener('focus', ensureFocus);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) ensureFocus();
});
