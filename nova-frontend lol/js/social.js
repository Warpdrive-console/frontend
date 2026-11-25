'use strict';

const ROTUR = Object.assign(
  {
    api: 'https://api.rotur.dev',
    social: 'https://social.rotur.dev',
    status: 'wss://api.rotur.dev/v2/status/ws',
    avatars: 'https://avatars.rotur.dev',
    chats: 'wss://dms.originchats.com',
    info: 'https://raw.githubusercontent.com/Mistium/Origin-OS/main/Resources/info.json',
  },
  window.NOVA_ENDPOINTS || {},
);

const LIVE = warp.native || new URLSearchParams(location.search).has('rotur');

function store(state) {
  const fns = new Set();
  let queued = false;

  const flush = () => {
    queued = false;
    for (const f of [...fns]) {
      try {
        f(state);
      } catch (e) {
        reportError(e);
      }
    }
  };
  return {
    get: () => state,
    set(p) {
      state = { ...state, ...p };
      if (!queued) {
        queued = true;
        queueMicrotask(flush);
      }
    },
    on(f) {
      fns.add(f);
      return () => fns.delete(f);
    },
  };
}

const bare = n =>
  String(n?.username ?? n?.name ?? n ?? '')
    .split('§')[0]
    .replace(/^[a-zA-Z]+-/, '')
    .toLowerCase();

const nameOf = n => (typeof n === 'string' ? n : n?.username || n?.name || String(n));

const avatarUrl = (user, size = 96) =>
  user
    ? LIVE
      ? `${ROTUR.avatars}/${encodeURIComponent(user)}?radius=128&s=${size}`
      : `assets/avatar.svg#${encodeURIComponent(user)}`
    : 'assets/avatar.svg';

class Socket {
  constructor({ url, onOpen, onFrame, onDown, heartbeat }) {
    Object.assign(this, { url, onOpen, onFrame, onDown, heartbeat, ws: null, wait: 1000, want: false });
  }
  connect() {
    this.want = true;
    if (this.ws && this.ws.readyState <= 1) return;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      return this.retry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.wait = 1000;
      this.onOpen?.(this);
      if (this.heartbeat) this.hb = setInterval(() => this.send(this.heartbeat()), 20000);
    };
    ws.onmessage = e => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onFrame?.(m, this);
    };
    ws.onclose = () => {
      clearInterval(this.hb);
      this.onDown?.();
      if (this.ws === ws) {
        this.ws = null;
        this.retry();
      }
    };
    ws.onerror = () => {};
  }
  retry() {
    if (!this.want) return;
    clearTimeout(this.t);
    this.t = setTimeout(() => this.connect(), this.wait);
    this.wait = Math.min(this.wait * 2, 30000);
  }
  send(o) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o));
  }
  close() {
    this.want = false;
    clearTimeout(this.t);
    clearInterval(this.hb);
    const w = this.ws;
    this.ws = null;
    try {
      w?.close();
    } catch {}
  }
  get open() {
    return this.ws?.readyState === 1;
  }
}

const Rotur = (() => {
  const TOKEN = 'nova.rotur.token',
    USER = 'nova.rotur.user',
    GRANTS = 'nova.rotur.grants';

  const PERMISSIONS =
    'account:view,account:profile,friends:view,friends:request,friends:accept,friends:remove,friends:cancel,validators:generate';

  const SECURE = ',signing:private';
  const securityOn = () => localStorage.getItem('nova.rotur.secure') !== '0';
  const wanted = () => PERMISSIONS + (securityOn() ? SECURE : '');

  if (LIVE && localStorage.getItem(TOKEN) && !(localStorage.getItem(GRANTS) || '').startsWith(PERMISSIONS)) {
    localStorage.removeItem(TOKEN);
    localStorage.setItem(
      'nova.rotur.reason',
      'Warpdrive needs a few more permissions now. Please sign in again.',
    );
  }

  const s = store({
    token: localStorage.getItem(TOKEN) || '',
    username: localStorage.getItem(USER) || '',
    user: null,
    friends: [],
    requests: [],
    online: new Set(),
    presence: {},
    linkCode: '',
    loginStatus: localStorage.getItem('nova.rotur.reason') || '',
    connected: false,
  });

  let queryAuth = localStorage.getItem('nova.rotur.queryauth') === '1';
  async function authFetch(url, { method = 'GET', body } = {}) {
    const token = s.get().token;
    const withQuery = () =>
      fetch(url + (url.includes('?') ? '&' : '?') + 'auth=' + encodeURIComponent(token), {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { 'Content-Type': 'text/plain' } : {},
      });
    if (queryAuth || !token) return token ? withQuery() : fetch(url, { method });
    try {
      return await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      queryAuth = true;
      localStorage.setItem('nova.rotur.queryauth', '1');
      return withQuery();
    }
  }

  async function api(path, { method = 'GET', body } = {}) {
    const r = await authFetch(ROTUR.api + path, { method, body });
    let j = null;
    try {
      j = await r.json();
    } catch {}
    if (!r.ok || j?.error) {
      const msg = j?.error || `HTTP ${r.status}`;
      if (r.status === 403 && /lacks permission|invalid authentication|invalid key|banned/i.test(msg))
        signedOut(
          /lacks permission/i.test(msg)
            ? `This sign-in doesn't allow ${msg.split(':').pop().trim()}. Sign in again and keep every permission ticked.`
            : 'Your Rotur sign-in expired. Please sign in again.',
        );
      const e = new Error(msg);
      e.status = r.status;
      throw e;
    }
    return j;
  }

  let firstRequests = true;
  function setRequests(list) {
    if (!Array.isArray(list)) return;
    const had = s.get().requests.map(nameOf);
    const fresh = list.map(nameOf).filter(n => n && !had.includes(n));
    s.set({ requests: list });
    if (!firstRequests)
      fresh.forEach(n =>
        note({ title: 'Friend request', text: `${n} wants to be friends`, image: avatarUrl(n) }),
      );
    firstRequests = false;
  }
  function setFriends(list) {
    if (Array.isArray(list)) {
      s.set({ friends: list });
      pollPresence();
    }
  }

  async function refresh() {
    if (!s.get().token) return;
    try {
      const [me, fr, rq] = await Promise.all([api('/me'), api('/friends'), api('/friends/requests')]);
      s.set({ user: me, username: me.username || s.get().username });
      localStorage.setItem(USER, s.get().username);
      setFriends(fr.friends);
      setRequests(rq.requests);
    } catch (e) {
      reportError(e);
    }
  }

  const ONLINE = new Set(['online', 'idle', 'dnd']);
  const ids = new Map();
  function setPresence(name, presence, id) {
    const n = bare(name);
    if (!n) return;
    if (id) ids.set(id, n);
    const p = { ...s.get().presence, [n]: presence },
      on = new Set(s.get().online);
    ONLINE.has(presence) ? on.add(n) : on.delete(n);
    s.set({ presence: p, online: on });
  }
  let presenceBusy = false;
  async function pollPresence() {
    if (presenceBusy || !s.get().token) return;
    presenceBusy = true;
    try {
      const names = s.get().friends.map(nameOf);
      for (let i = 0; i < names.length; i += 6) {
        await Promise.all(
          names.slice(i, i + 6).map(async n => {
            try {
              const r = await authFetch(`${ROTUR.api}/v2/status/live?name=${encodeURIComponent(n)}`);
              setPresence(n, r.ok ? (await r.json()).presence || 'offline' : 'offline');
            } catch {}
          }),
        );
      }
    } finally {
      presenceBusy = false;
    }
  }
  setInterval(() => {
    if (s.get().token && !document.hidden) pollPresence();
  }, 60000);

  const sock = new Socket({
    url: ROTUR.status,
    onDown: () => s.set({ connected: false }),
    onOpen: w => w.send({ cmd: 'auth', key: s.get().token }),
    onFrame(m, w) {
      switch (m.cmd) {
        case 'ready':
          s.set({ connected: true, username: m.username || s.get().username });
          w.send({ cmd: 'join', rooms: ['warpdrive'] });
          return;
        case 'room_state':
          (m.members || []).forEach(x => setPresence(x.username, x.presence || 'online', x.user_id));
          return;
        case 'member_join':
          setPresence(m.username, m.presence || 'online', m.user_id);
          return;
        case 'member_leave': {
          const n = m.username || ids.get(m.user_id);
          if (n) setPresence(n, 'offline');
          return;
        }
        case 'status_update': {
          const n = m.username || ids.get(m.user_id);
          if (n) setPresence(n, m.presence || 'online', m.user_id);
          return;
        }
        case 'key_update':
          if (m.key === 'sys.friends') setFriends(m.value);
          if (m.key === 'sys.requests') setRequests(m.value);
          return;
        case 'error':
          if (/invalid key/i.test(m.message || ''))
            signedOut('Your Rotur sign-in expired. Please sign in again.');
          return;
      }
    },
  });

  let poll = null,
    starting = false;
  async function beginLogin() {
    if (starting) return;
    starting = true;
    s.set({
      loginStatus:
        s.get().loginStatus.startsWith('Sign in again') || s.get().loginStatus.includes('permission')
          ? s.get().loginStatus
          : 'Getting a code…',
      linkCode: '',
    });
    try {
      const asked = wanted();
      const r = await fetch(`${ROTUR.api}/link/code?name=Warpdrive&permissions=${encodeURIComponent(asked)}`);
      const j = await r.json();
      if (!j.code) throw new Error(j.error || 'no code');
      s.set({
        linkCode: j.code,
        loginStatus:
          'Enter the code at rotur.dev/link and keep every permission ticked. "Read private signing key" lets Warpdrive sign your messages.',
      });
      const expires = Date.now() + (j.expires_in || 600) * 1000 - 5000;
      clearInterval(poll);
      poll = setInterval(async () => {
        if (Date.now() > expires) {
          endLogin();
          s.set({ linkCode: '' });
          beginLogin();
          return;
        }
        try {
          const st = await fetch(`${ROTUR.api}/link/status?code=${encodeURIComponent(j.code)}`);
          if (!st.ok) return;
          const u = await (await fetch(`${ROTUR.api}/link/user?code=${encodeURIComponent(j.code)}`)).json();
          if (!u.token) return;
          endLogin();
          localStorage.setItem(TOKEN, u.token);
          localStorage.setItem(GRANTS, asked);
          localStorage.removeItem('nova.rotur.reason');
          s.set({ token: u.token, loginStatus: 'Signed in', linkCode: '' });
          connect();
        } catch {}
      }, 3000);
    } catch (e) {
      s.set({ loginStatus: 'Could not reach Rotur. Check your connection, then press New code.' });
    } finally {
      starting = false;
    }
  }
  function endLogin() {
    clearInterval(poll);
    poll = null;
  }
  function connect() {
    if (s.get().token) {
      refresh();
      sock.connect();
      Chats.connect();
    }
  }
  function signedOut(reason) {
    if (!s.get().token) return;
    logout();
    localStorage.setItem('nova.rotur.reason', reason);
    s.set({ loginStatus: reason });
    note({ title: 'Signed out of Rotur', text: reason, bad: true });
  }
  function logout() {
    endLogin();
    sock.close();
    Chats.disconnect();
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
    localStorage.removeItem('nova.rotur.reason');
    firstRequests = true;
    s.set({
      token: '',
      username: '',
      user: null,
      friends: [],
      requests: [],
      online: new Set(),
      presence: {},
      linkCode: '',
      loginStatus: '',
      connected: false,
    });
  }

  const profiles = new Map();
  async function profile(name) {
    const u = bare(name);
    const c = profiles.get(u);
    if (c && Date.now() - c.at < 60000) return c.v;
    let v = null;
    try {
      const r = await authFetch(`${ROTUR.api}/profile?username=${encodeURIComponent(u)}&include_posts=0`);
      if (r.ok) {
        const d = await r.json();
        if (d && !d.error)
          v = {
            username: d.username || u,
            bio: (d.bio || '').trim(),
            pronouns: d.pronouns || '',
            created: d.created || 0,
            followers: Array.isArray(d.followers) ? d.followers.length : d.followers || 0,
            following: Array.isArray(d.following) ? d.following.length : d.following || 0,
            subscription: d.subscription || 'Free',
          };
      }
    } catch {}
    profiles.set(u, { at: Date.now(), v });
    return v;
  }

  async function act(path, optimistic) {
    const before = { friends: s.get().friends, requests: s.get().requests };
    s.set(optimistic(s.get()));
    try {
      await api(path, { method: 'POST' });
      setTimeout(refresh, 800);
      return null;
    } catch (e) {
      s.set(before);
      return e.message;
    }
  }
  const without = (list, n) => list.filter(x => bare(nameOf(x)) !== bare(n));
  const api_ = {
    s,
    LIVE,
    signedIn: () => !!s.get().token,

    hasSecure: () =>
      !!s.get().token && securityOn() && (localStorage.getItem(GRANTS) || '').includes('signing:private'),

    setSecure(on) {
      localStorage.setItem('nova.rotur.secure', on ? '1' : '0');
      if (on && !api_.hasSecure()) {
        logout();
        localStorage.setItem('nova.rotur.secure', '1');
        s.set({
          loginStatus:
            'Sign in again and keep "Read private signing key" ticked to turn on message security.',
        });
        go('friends');
      }
    },
    wantsSecure: securityOn,
    me: () => s.get().username,
    displayName: () => {
      const u = s.get().user;
      return (u?.display_name || u?.nickname || s.get().username || 'Guest').trim();
    },
    isOnline: n => s.get().online.has(bare(n)),
    presence: n => s.get().presence[bare(n)] || 'offline',
    onlineCount: () => s.get().friends.filter(f => s.get().online.has(bare(nameOf(f)))).length,
    beginLogin,
    endLogin,
    connect,
    logout,
    refresh,
    profile,
    accept: n =>
      act(`/friends/accept/${encodeURIComponent(n)}`, st => ({
        requests: without(st.requests, n),
        friends: [...without(st.friends, n), n],
      })),
    decline: n =>
      act(`/friends/reject/${encodeURIComponent(n)}`, st => ({ requests: without(st.requests, n) })),
    remove: n => act(`/friends/remove/${encodeURIComponent(n)}`, st => ({ friends: without(st.friends, n) })),
    async request(n) {
      n = (n || '').trim();
      if (!n) return 'Enter a username first.';
      if (bare(n) === bare(s.get().username)) return "You can't add yourself.";
      try {
        await api(`/friends/request/${encodeURIComponent(n)}`, { method: 'POST' });
        setTimeout(refresh, 800);
        return null;
      } catch (e) {
        return e.message;
      }
    },

    async validator(key) {
      return (await api(`/v2/validators?key=${encodeURIComponent(key)}`, { method: 'POST' })).validator;
    },
  };
  return LIVE ? api_ : MockRotur(api_, s);
})();

const Secure = (() => {
  const SDK = globalThis.Rotur;
  let client = null,
    clientToken = '';
  const sdk = () => {
    const t = Rotur.s.get().token;
    if (!t || typeof SDK !== 'function') return null;
    if (!client || clientToken !== t) {
      client = new SDK({ token: t });
      clientToken = t;
    }
    return client;
  };

  const supported = (async () => {
    try {
      await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
      await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
      return true;
    } catch {
      return false;
    }
  })();

  const states = new Map();
  const keyOf = m => (m.id != null ? 'i' + m.id : `${m.user}|${m.timestamp}`);
  const toMs = t => (t < 1e12 ? t * 1000 : t);

  function check(m, signingUrl, changed) {
    const k = keyOf(m);
    if (states.has(k)) return states.get(k);
    if (!m.author_id || !m.key_id || !m.signature || m.signed_at == null) {
      states.set(k, 'unsigned');
      return 'unsigned';
    }

    const serverAt = toMs(m.edited_at ?? m.timestamp),
      signedAt = toMs(m.signed_at);
    if (!signingUrl || Math.abs(serverAt - signedAt) > 5 * 60 * 1000) {
      states.set(k, signingUrl ? 'invalid' : 'unavailable');
      return states.get(k);
    }
    states.set(k, 'pending');
    (async () => {
      let out;
      try {
        if (!(await supported)) out = 'unavailable';
        else {
          const verifier = sdk() || new SDK({});
          const ok = await verifier.signing.verify(
            { author_id: m.author_id, key_id: m.key_id, signature: m.signature, username: bare(m.user) },
            [
              'originchats.message.v1',
              m.author_id,
              m.content ?? '',
              m.attachments || [],
              m.signed_at,
              signingUrl,
            ],
            { signedAt: serverAt },
          );
          out = ok ? 'verified' : 'invalid';
        }
      } catch (e) {
        out = /mismatch/i.test(e?.message || '') ? 'invalid' : 'unavailable';
      }
      states.set(k, out);
      changed();
    })();
    return 'pending';
  }

  let keyState = 'unknown',
    keyToken = '';
  async function probeKey() {
    const t = Rotur.s.get().token;
    if (!Rotur.hasSecure() || keyToken === t) return;
    keyToken = t;
    if (!(await supported)) {
      keyState = 'unsupported';
      return Chats.changed();
    }
    try {
      await sdk().signing.privateKey();
      keyState = 'ok';
    } catch (e) {
      keyState =
        e?.status === 403 || /permission|forbidden|403/i.test(e?.message || '') ? 'denied' : 'unknown';
      keyToken = keyState === 'denied' ? t : '';
      reportError(e);
    }
    Chats.changed();
  }
  Rotur.s.on(() => probeKey());

  async function sign(content, attachments, timestamp, signingUrl) {
    const c = sdk();
    if (!c) throw new Error('Not signed in');
    return c.signing.sign(authorId => [
      'originchats.message.v1',
      authorId,
      content,
      attachments,
      timestamp,
      signingUrl,
    ]);
  }

  const MARK = '\nwd-e2e:v1:';
  const PLACEHOLDER = '🔒 Encrypted message. Open it in Warpdrive to read it.';
  const isEncrypted = content => typeof content === 'string' && content.includes(MARK);
  const keys = new Map();
  async function currentKey(username) {
    const u = bare(username);
    if (keys.has(u) && Date.now() - keys.get(u).at < 5 * 60 * 1000) return keys.get(u).v;
    const r = await fetch(`${ROTUR.api}/v3/users/${encodeURIComponent(u)}/signing-key`);
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.user_id || !j?.key_id) throw new Error(j?.error || `${username} has no signing key`);
    const v = { user_id: j.user_id, key_id: j.key_id, username: j.username || u };
    keys.set(u, { at: Date.now(), v });
    return v;
  }
  async function encrypt(toUser, text) {
    const c = sdk();
    if (!c) throw new Error('Not signed in');
    const mine = await c.signing.privateKey();
    const them = await currentKey(toUser);
    const body = { message: text };
    const [forThem, forMe] = await Promise.all([
      c.signing.encrypt(them, body),
      c.signing.encrypt({ user_id: mine.user_id, key_id: mine.key_id, username: mine.username }, body),
    ]);
    return PLACEHOLDER + MARK + JSON.stringify({ envelopes: [forThem, forMe] });
  }
  const opened = new Map();
  function decrypt(m, changed) {
    const k = keyOf(m);
    if (opened.has(k)) return opened.get(k);
    opened.set(k, { pending: true });
    (async () => {
      let out;
      try {
        const c = sdk();
        if (!c || !Rotur.hasSecure()) throw new Error('Turn on message security to read this');
        const mine = await c.signing.privateKey();
        const { envelopes } = JSON.parse(m.content.slice(m.content.indexOf(MARK) + MARK.length));
        const env = (envelopes || []).find(
          e => e.recipient_id === mine.user_id && e.recipient_key_id === mine.key_id,
        );
        if (!env) throw new Error('Sent to an older key of yours');
        out = { text: String((await c.signing.decrypt(env))?.message ?? '') };
      } catch (e) {
        out = { error: e?.message || 'Could not decrypt' };
      }
      opened.set(k, out);
      changed();
    })();
    return opened.get(k);
  }

  const load = k => {
    try {
      return new Set(JSON.parse(localStorage.getItem(k)) || []);
    } catch {
      return new Set();
    }
  };
  let e2e = load('nova.e2e'),
    declined = load('nova.e2e.off');
  const save = () => {
    try {
      localStorage.setItem('nova.e2e', JSON.stringify([...e2e]));
      localStorage.setItem('nova.e2e.off', JSON.stringify([...declined]));
    } catch {}
  };
  const encrypted = ch => e2e.has(ch);

  function setEncrypted(ch, on, byHand = false) {
    on ? e2e.add(ch) : e2e.delete(ch);
    if (byHand) on ? declined.delete(ch) : declined.add(ch);
    save();
  }

  function follow(ch, m) {
    if (!e2e.has(ch) && !declined.has(ch) && isEncrypted(m?.content) && bare(m?.user) !== bare(Rotur.me())) {
      e2e.add(ch);
      save();
      return true;
    }
    return false;
  }

  return {
    supported,
    check,
    sign,
    encrypt,
    decrypt,
    isEncrypted,
    encrypted,
    setEncrypted,
    follow,
    keyOf,
    placeholder: PLACEHOLDER,
    keyState: () => keyState,
    probeKey,
  };
})();

const Chats = (() => {
  const SYSTEM = new Set([
    'cmds',
    'separator',
    'system',
    'home',
    'relationships',
    'shop',
    'discovery',
    'new_message',
  ]);
  const s = store({ channels: [], threads: new Map(), active: null, connected: false, status: 'Offline' });
  const READ = 'nova.chats.read';
  let read = (() => {
    try {
      return JSON.parse(localStorage.getItem(READ)) || {};
    } catch {
      return {};
    }
  })();
  const me = () => bare(Rotur.me());
  const ts = m => {
    const t = m?.timestamp || 0;
    return t < 1e12 ? t * 1000 : t;
  };

  let validatorKey = '',
    pendingDM = null,
    pendingTimer = null;

  let signingUrl = '',
    canSign = false,
    cracked = false,
    clockBase = null,
    clockAt = 0,
    offset = 0,
    bestRtt = Infinity;
  const serverNow = () =>
    clockBase != null ? clockBase + (performance.now() - clockAt) / 1000 : Date.now() / 1000 + offset;
  let version = 0,
    signWarned = false;
  const changed = () => s.set({ v: ++version });
  const PAGE = 100,
    KEEP = 3000;

  let ready = false;
  const queue = [];
  const send = m => {
    if (ready && sock.open) sock.send(m);
    else queue.push(m);
  };
  const flush = () => {
    while (ready && sock.open && queue.length) sock.send(queue.shift());
  };
  let lastAsked = null;

  const diag = msg => {
    try {
      warp.call('shell.report', { source: 'chats', message: String(msg).slice(0, 600) }).catch(() => {});
    } catch {}
  };

  const DB = (() => {
    let db = null;
    const open = () =>
      (db ||= new Promise((res, rej) => {
        const r = indexedDB.open('nova-chats', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      }));
    const run = async (mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction('kv', mode);
        const q = fn(t.objectStore('kv'));
        t.oncomplete = () => res(q?.result);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      get: k => run('readonly', st => st.get(k)).catch(() => null),
      put: (k, v) => run('readwrite', st => st.put(v, k)).catch(() => {}),
    };
  })();
  const dbKey = k => `${me()}:${k}`;
  const saveTimers = new Map();
  const saveThread = ch => {
    clearTimeout(saveTimers.get(ch));
    saveTimers.set(
      ch,
      setTimeout(() => DB.put(dbKey('t:' + ch), (s.get().threads.get(ch) || []).slice(-1000)), 600),
    );
  };
  async function loadCached() {
    const chans = await DB.get(dbKey('channels'));
    if (Array.isArray(chans) && !s.get().channels.length) s.set({ channels: chans });
    for (const c of s.get().channels) {
      const t = await DB.get(dbKey('t:' + c.name));
      if (Array.isArray(t) && t.length) setThread(c.name, t, false, false);
    }
  }
  const more = new Map(),
    loading = new Set();
  const sock = new Socket({
    url: ROTUR.chats,
    onDown: () => {
      ready = false;
      s.set({ connected: false, status: 'Offline' });
    },
    async onFrame(m, w) {
      switch (m.cmd) {
        case 'handshake': {
          const v = m.val || {};
          validatorKey = v.validator_key || '';
          signingUrl = v.signing_url || '';
          const caps = Array.isArray(v.capabilities) ? v.capabilities : [];

          canSign =
            !!signingUrl && (caps.includes('message_signatures_v1') || !caps.some(c => /signature/.test(c)));
          if (typeof v.server_time === 'number') {
            clockBase = v.server_time < 1e12 ? v.server_time : v.server_time / 1000;
            clockAt = performance.now();
          }
          diag(
            `handshake: version ${v.version ?? '?'}, signing_url ${signingUrl ? 'yes' : 'no'}, server_time ${typeof v.server_time}, signature capabilities [${caps.filter(c => /sign/.test(c)).join(', ')}]`,
          );
          auth(w);
          return;
        }
        case 'auth_error':
          diag('auth_error: ' + JSON.stringify(m.val));
          s.set({ status: 'Sign-in to messages failed: ' + (m.val || '') });
          return;
        case 'ready':
          cracked = !!m.user?.cracked;
          ready = true;
          diag(`ready${cracked ? ' (cracked account: messages are stored unsigned)' : ''}`);
          s.set({ connected: true, status: 'Connected' });
          w.send({ cmd: 'channels_get' });
          if (s.get().active) send({ cmd: 'messages_get', channel: s.get().active, limit: PAGE });
          flush();
          for (let i = 0; i < 3; i++)
            setTimeout(() => w.send({ cmd: 'ping', sent_at: Date.now() / 1000 }), 300 + i * 1500);
          return;
        case 'ping': {
          const now = Date.now() / 1000,
            rtt = now - m.sent_at - ((m.server_sent_at ?? 0) - (m.server_received_at ?? 0));
          if (m.sent_at && m.server_received_at && rtt >= 0 && rtt < 5 && rtt < bestRtt) {
            bestRtt = rtt;
            offset = (m.server_received_at - m.sent_at + (m.server_sent_at - now)) / 2;
            clockBase = null;
          }
          return;
        }
        case 'channels_get': {
          s.set({
            channels: (m.val || []).filter(
              c => c?.name && !SYSTEM.has(c.name) && c.type !== 'separator' && c.type !== 'system',
            ),
          });
          DB.put(dbKey('channels'), s.get().channels);

          for (const c of s.get().channels)
            if (!s.get().threads.has(c.name))
              DB.get(dbKey('t:' + c.name)).then(t => {
                if (Array.isArray(t) && t.length && !s.get().threads.has(c.name))
                  setThread(c.name, t, false, false);
              });
          if (pendingDM) {
            const f = pendingDM;
            pendingDM = null;
            f();
          }
          return;
        }
        case 'messages_get': {
          const got = Array.isArray(m.messages) ? m.messages : Array.isArray(m.val) ? m.val : [];

          const ch = s.get().channels.some(c => c.name === m.channel) ? m.channel : lastAsked || m.channel;
          diag(
            `messages_get ${ch}${ch !== m.channel ? ` (reply said ${m.channel})` : ''}: ${got.length} messages${m.range ? `, range ${JSON.stringify(m.range)}` : ''}`,
          );
          more.set(ch, got.length >= PAGE);
          loading.delete(ch);
          setThread(ch, got);
          const theirs = [...got].reverse().find(x => bare(x?.user) !== me());
          if (theirs && Secure.follow(ch, theirs)) changed();
          return;
        }
        case 'message_new': {
          const list = [...(s.get().threads.get(m.channel) || []), m.message];
          Secure.follow(m.channel, m.message);
          setThread(m.channel, list, true);
          const ch = s
            .get()
            .channels.map(c => (c.name === m.channel ? { ...c, last_message: m.message?.timestamp } : c));
          s.set({ channels: ch });
          const from = m.message?.user;
          const looking = m.channel === s.get().active && screen === 'messages' && !layers.length;
          if (from && bare(from) !== me() && !looking) {
            const c = ch.find(x => x.name === m.channel);
            note({
              title: c?.display_name || from,
              text: Secure.isEncrypted(m.message?.content)
                ? 'Encrypted message'
                : m.message?.content || 'New message',
              image: avatarUrl(c?.display_name || from),
            });
          }
          if (looking) markRead(m.channel);
          return;
        }
        case 'success':
          w.send({ cmd: 'channels_get' });
          return;
        case 'error': {
          diag('server error: ' + JSON.stringify(m).slice(0, 400));
          if (/authentication required|not authenticated/i.test(String(m.val))) {
            ready = false;
            return;
          }
          if (pendingDM) {
            pendingDM = null;
            clearTimeout(pendingTimer);
            dmFailed();
          } else if (!/unknown comm?and/i.test(String(m.val)))
            note({ title: 'Message not sent', text: String(m.val || 'Error'), bad: true });
          return;
        }
      }
    },
  });

  async function auth(w) {
    if (!Rotur.signedIn() || !validatorKey) {
      s.set({ status: 'Not signed in' });
      return;
    }
    try {
      w.send({ cmd: 'auth', validator: await Rotur.validator(validatorKey) });
    } catch (e) {
      s.set({
        status: /permission/i.test(e.message)
          ? 'Messages need the validators permission. Sign in again.'
          : 'Sign-in to messages failed: ' + e.message,
      });
      reportError(e);
    }
  }

  function setThread(channel, msgs, append = false, persist = true) {
    const t = new Map(s.get().threads);
    const seen = new Set(),
      out = [];
    for (const m of append ? msgs : [...(t.get(channel) || []), ...msgs]) {
      const k = m?.id != null ? 'i' + m.id : `${m?.user}|${m?.timestamp}|${m?.content}`;
      if (m && !seen.has(k)) {
        seen.add(k);
        out.push(m);
      }
    }
    out.sort((a, b) => ts(a) - ts(b));
    t.set(channel, out.slice(-KEEP));
    s.set({ threads: t });
    if (persist) saveThread(channel);
  }
  function markRead(ch) {
    const last = (s.get().threads.get(ch) || []).at(-1);
    read[ch] = last ? ts(last) : Date.now();
    try {
      localStorage.setItem(READ, JSON.stringify(read));
    } catch {}
    s.set({});
  }
  function unread(ch) {
    const since = read[ch] || 0;
    return (
      (s.get().threads.get(ch) || []).filter(m => ts(m) > since && bare(m.user) !== me()).length ||
      (ts({ timestamp: s.get().channels.find(c => c.name === ch)?.last_message }) > since &&
      !s.get().threads.has(ch)
        ? 1
        : 0)
    );
  }
  const dmFailed = () =>
    note({
      title: "Couldn't start that chat",
      text: 'They need to open Messages in Warpdrive or sign in to originchats.com once first.',
      bad: true,
    });

  const api = {
    s,
    connect() {
      if (Rotur.signedIn()) {
        s.set({ status: 'Connecting…' });
        loadCached();
        sock.connect();
      }
    },
    disconnect() {
      ready = false;
      queue.length = 0;
      sock.close();
      s.set({ channels: [], threads: new Map(), active: null, connected: false, status: 'Offline' });
    },
    open(ch) {
      markRead(ch);
      s.set({ active: ch });
      if (!more.has(ch)) more.set(ch, true);
      lastAsked = ch;
      if (!s.get().threads.has(ch))
        DB.get(dbKey('t:' + ch)).then(t => {
          if (Array.isArray(t) && t.length && !s.get().threads.has(ch)) setThread(ch, t, false, false);
        });
      send({ cmd: 'messages_get', channel: ch, limit: PAGE });
    },

    loadOlder(ch = s.get().active) {
      const oldest = (s.get().threads.get(ch) || [])[0];
      if (!ch || !oldest?.id || loading.has(ch) || more.get(ch) === false) return false;
      loading.add(ch);
      s.set({});
      lastAsked = ch;
      send({ cmd: 'messages_get', channel: ch, start: String(oldest.id), limit: PAGE });
      setTimeout(() => {
        if (loading.delete(ch)) s.set({});
      }, 8000);
      return true;
    },
    hasOlder: ch => more.get(ch) !== false,
    isLoading: ch => loading.has(ch),
    async send(text) {
      text = (text || '').trim();
      const ch = s.get().active;
      if (!text || !ch) return;
      let content = text;
      if (Secure.encrypted(ch)) {
        const other = api.title(s.get().channels.find(c => c.name === ch));
        content = await Secure.encrypt(other, text);
      }
      const msg = { cmd: 'message_new', channel: ch, content };
      if (api.signing().on) {
        try {
          const timestamp = serverNow();
          Object.assign(msg, { timestamp }, await Secure.sign(content, [], timestamp, signingUrl));
        } catch (e) {
          diag('signing failed: ' + (e?.message || e));
          if (!signWarned) {
            signWarned = true;
            note({ title: 'Sent without a signature', text: e?.message || 'Signing failed', bad: true });
          }
        }
      }
      send(msg);
    },

    signing() {
      if (!Rotur.wantsSecure() || !Rotur.hasSecure())
        return { on: false, reason: 'Message security is off', fix: true };
      if (prefs.signMessages === false)
        return { on: false, reason: 'Signing is turned off in Account settings' };
      if (Secure.keyState() === 'denied')
        return {
          on: false,
          reason: "Rotur didn't give Warpdrive your signing key. Sign in again and allow it.",
          fix: true,
        };
      if (Secure.keyState() === 'unsupported')
        return { on: false, reason: 'This WebView is too old to sign. Update Android System WebView.' };
      if (cracked) return { on: false, reason: 'This chat account is not a Rotur account' };
      if (!ready) return { on: false, reason: 'Connecting…' };
      if (!canSign) return { on: false, reason: "This chat server doesn't accept signatures" };
      return { on: true };
    },
    signs: () => api.signing().on,
    signingUrl: () => signingUrl,
    changed,
    startDM(user) {
      const existing = s.get().channels.find(c => c.type !== 'group' && bare(c.display_name) === bare(user));
      if (existing) {
        api.open(existing.name);
        return existing.name;
      }
      if (!s.get().connected) {
        note({ title: 'Messages are still connecting', text: 'Try again in a moment.', bad: true });
        return null;
      }
      send({ cmd: 'message_new', channel: 'cmds', content: `dm add ${user}` });
      pendingDM = () => {
        clearTimeout(pendingTimer);
        const c = s.get().channels.find(x => x.type !== 'group' && bare(x.display_name) === bare(user));
        if (c) {
          api.open(c.name);
          go('messages');
        }
      };
      pendingTimer = setTimeout(() => {
        if (pendingDM) {
          pendingDM = null;
          dmFailed();
        }
      }, 6000);
      return null;
    },
    unread,
    markRead,
    ts,
    totalUnread: () =>
      s
        .get()
        .channels.reduce(
          (n, c) => n + (c.name === s.get().active && screen === 'messages' ? 0 : unread(c.name)),
          0,
        ),
    title: c => c?.display_name || 'Direct message',
  };
  return LIVE ? api : MockChats(api, s, setThread);
})();

function MockRotur(api, s) {
  const people = ['novapilot', 'ghost_axis', 'mistium', 'pixelfox', 'bytebard', 'lunarlynx'];
  const fake = () => ({
    username: 'player1',
    nickname: 'Player One',
    status: 'Playing Starfall',
    bio: 'Square screen enjoyer.\nRotur since 2024.',
    'sys.friends': people.slice(0, 5),
    'sys.requests': ['bytebard'],
  });
  return Object.assign(api, {
    beginLogin() {
      s.set({ loginStatus: 'Getting a code…', linkCode: '' });
      setTimeout(
        () =>
          s.set({
            linkCode: 'NOVA42',
            loginStatus: 'Waiting for you to approve… (mock: signs in after 4 s)',
          }),
        600,
      );
      setTimeout(() => {
        if (!s.get().token) {
          localStorage.setItem('nova.rotur.token', 'mock');
          s.set({ token: 'mock', loginStatus: 'Signed in' });
          api.connect();
        }
      }, 4000);
    },
    endLogin() {},
    connect() {
      if (!s.get().token) return;
      const u = fake();
      s.set({
        user: u,
        username: u.username,
        friends: u['sys.friends'],
        requests: u['sys.requests'],
        online: new Set(['novapilot', 'mistium', 'pixelfox']),
        presence: { novapilot: 'online', mistium: 'dnd', pixelfox: 'idle' },
        connected: true,
      });
      Chats.connect();
    },
    refresh() {},
    logout() {
      localStorage.removeItem('nova.rotur.token');
      s.set({
        token: '',
        username: '',
        user: null,
        friends: [],
        requests: [],
        online: new Set(),
        connected: false,
      });
      Chats.disconnect();
    },
    async profile(n) {
      return {
        username: n,
        bio: 'Speedrunner. Mostly harmless.',
        pronouns: 'they/them',
        created: Date.now() - 4e10,
        followers: 42,
        following: 17,
        subscription: 'Free',
      };
    },
    accept: async n => {
      s.set({ requests: s.get().requests.filter(x => x !== n), friends: [...s.get().friends, n] });
      return null;
    },
    decline: async n => {
      s.set({ requests: s.get().requests.filter(x => x !== n) });
      return null;
    },
    remove: async n => {
      s.set({ friends: s.get().friends.filter(x => x !== n) });
      return null;
    },
    async request(n) {
      return n ? null : 'Enter a username first.';
    },
  });
}

function MockChats(api, s, setThread) {
  const now = Date.now() / 1000;
  const chans = [
    { name: 'dm_1', type: 'dm', display_name: 'novapilot', last_message: now - 120 },
    { name: 'dm_2', type: 'dm', display_name: 'mistium', last_message: now - 3600 },
    { name: 'dm_3', type: 'dm', display_name: 'ghost_axis', last_message: now - 86400 * 2 },
  ];

  const lines = [
    'gg',
    'one more?',
    'did the new build work?',
    'yeah fan control works now',
    'nice',
    'brb',
    'that boss is brutal',
    'lol',
    'try the dash',
    'got it',
    'on my way',
    'sleep time',
  ];
  const full = {
    dm_1: [
      ['novapilot', 'you up for a race?', 900],
      ['player1', 'give me 5 min', 840],
      ['novapilot', 'gg that last one was close', 120],
    ],
    dm_2: Array.from({ length: 260 }, (_, i) => [
      i % 3 ? 'mistium' : 'player1',
      `${lines[i % lines.length]} (#${i + 1})`,
      (260 - i) * 2400,
    ]),
    dm_3: [['ghost_axis', 'sent you a clip', 86400 * 2]],
  };
  const msgs = k =>
    full[k].map(([user, content, ago], i) => ({ id: `${k}-${i}`, user, content, timestamp: now - ago }));
  const PAGE = 100;
  const page = (k, beforeId) => {
    const all = msgs(k);
    const end = beforeId ? all.findIndex(m => m.id === beforeId) : all.length;
    return all.slice(Math.max(0, end - PAGE), end);
  };
  const more = new Map();
  return Object.assign(api, {
    connect() {
      s.set({ channels: chans, connected: true, status: 'Connected' });
      for (const k of Object.keys(full)) {
        const p = page(k);
        more.set(k, p.length >= PAGE);
        setThread(k, p);
      }
    },
    disconnect() {
      s.set({ channels: [], threads: new Map(), connected: false, status: 'Offline' });
    },
    open(ch) {
      api.markRead(ch);
      s.set({ active: ch });
    },
    loadOlder(ch = s.get().active) {
      const oldest = (s.get().threads.get(ch) || [])[0];
      if (!oldest || more.get(ch) === false || !full[ch]) return false;
      setTimeout(() => {
        const p = page(ch, oldest.id);
        more.set(ch, p.length >= PAGE);
        setThread(ch, p);
      }, 400);
      return true;
    },
    hasOlder: ch => more.get(ch) !== false,
    isLoading: () => false,
    send(text) {
      const ch = s.get().active;
      if (!text?.trim() || !ch) return;
      setThread(ch, [
        { id: Math.random(), user: 'player1', content: text.trim(), timestamp: Date.now() / 1000 },
      ]);
      const who = chans.find(c => c.name === ch)?.display_name;
      setTimeout(() => {
        setThread(ch, [
          {
            id: Math.random(),
            user: who,
            content: ['lol', 'gg', 'on my way', 'sounds good'][Math.floor(Math.random() * 4)],
            timestamp: Date.now() / 1000,
          },
        ]);
        if (screen === 'messages' && s.get().active === ch) api.markRead(ch);
        else note({ title: who, text: 'New message', image: avatarUrl(who) });
      }, 1800);
    },
    startDM(user) {
      let c = chans.find(x => x.display_name === user);
      if (!c) {
        c = { name: 'dm_' + user, type: 'dm', display_name: user, last_message: Date.now() / 1000 };
        chans.push(c);
        s.set({ channels: [...chans] });
      }
      api.open(c.name);
      return c.name;
    },
  });
}

function loginView(why) {
  const qrBox = h('div', { class: 'qr' }),
    codeEl = h('div', { class: 'code' }),
    state = h('div', { class: 'state' });
  const el = h(
    'div',
    { class: 'login' },
    h(
      'div',
      {},
      h('h2', {}, 'Sign in with Rotur'),
      h('p', {}, why),
      h(
        'ol',
        {},
        h('li', {}, 'Scan the code with your phone, or open rotur.dev/link'),
        h('li', {}, 'Enter the code shown here and approve'),
        h('li', {}, 'This screen updates by itself'),
      ),
      state,
      h(
        'div',
        { class: 'chips', style: { marginTop: '1rem' } },
        h(
          'button',
          { class: 'chip', 'data-nav': true, onclick: () => Rotur.beginLogin() },
          icon('qr'),
          'New code',
        ),
      ),
    ),
    h('div', {}, qrBox, codeEl),
  );
  const paint = st => {
    state.textContent = st.loginStatus || '';
    codeEl.textContent = st.linkCode || '';
    if (st.linkCode && qrBox.dataset.code !== st.linkCode) {
      qrBox.dataset.code = st.linkCode;
      const q = qrcode(0, 'M');
      q.addData(`https://rotur.dev/link?code=${encodeURIComponent(st.linkCode)}`);
      q.make();
      qrBox.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    }
  };
  el._off = Rotur.s.on(paint);
  paint(Rotur.s.get());
  if (!Rotur.s.get().linkCode) Rotur.beginLogin();
  return el;
}

function avatar(name, cls = 'av') {
  return h('img', {
    class: cls,
    src: avatarUrl(name),
    alt: '',
    onerror: e => {
      e.target.src = 'assets/avatar.svg';
    },
  });
}

async function showProfile(name) {
  const p = await Rotur.profile(name);
  const card = h(
    'div',
    { class: 'profile-card' },
    avatar(name, ''),
    h('b', {}, name),
    h('small', {}, [PRESENCE[Rotur.presence(name)] || 'Offline', p?.pronouns].filter(Boolean).join(' · ')),
    p?.bio ? h('p', {}, p.bio) : null,
    p
      ? h(
          'small',
          {},
          `${p.followers} followers · ${p.following} following${p.created ? ' · joined ' + new Date(p.created).getFullYear() : ''}`,
        )
      : null,
  );
  const r = await dialog({
    title: 'Profile',
    extra: card,
    actions: [['Remove friend', false, true], ['Close'], ['Message', true]],
  });
  if (r === 'Message') {
    const ch = Chats.startDM(name);
    if (ch) go('messages');
  }
  if (
    r === 'Remove friend' &&
    (await dialog({
      title: `Remove ${name}?`,
      text: 'You can send a new request later.',
      actions: [['Cancel'], ['Remove', true, true]],
    })) === 'Remove'
  ) {
    const err = await Rotur.remove(name);
    if (err) note({ title: 'Could not remove', text: err, bad: true });
  }
}

const PRESENCE = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  offline: 'Offline',
  invisible: 'Offline',
};

Screens.friends = (() => {
  let tab = 'friends',
    offs = [],
    loginEl = null,
    shown = '';
  const body = () => $('#friends-body');

  const shape = st =>
    JSON.stringify([
      Rotur.signedIn(),
      tab,
      st.username,
      st.user?.nickname,
      st.friends.map(nameOf),
      st.requests.map(nameOf),
      st.friends.map(f => Rotur.presence(nameOf(f))),
    ]);
  function render(force = false) {
    const st = Rotur.s.get(),
      key = shape(st);
    if (!force && key === shown) return;
    shown = key;
    if (!Rotur.signedIn()) {
      if (!loginEl) {
        loginEl = loginView('Sign in to see your friends, who is online, and to send messages.');
        body().replaceChildren(loginEl);
        paintIcons(body());
        if (screen === 'friends' && !layers.length) enter();
      }
      return;
    }
    loginEl?._off?.();
    loginEl = null;
    const keep =
      document.activeElement && body().contains(document.activeElement)
        ? document.activeElement.dataset.key || document.activeElement.dataset.side
        : null;
    const side = h(
      'nav',
      { class: 'side', 'data-zone': 'side' },
      h(
        'div',
        { class: 'profile-card', style: { marginBottom: '.5rem' } },
        avatar(st.username, ''),
        h('b', {}, Rotur.displayName()),
        h('small', {}, `@${st.username}`),
        h('small', {}, `${Rotur.onlineCount()} of ${st.friends.length} friends online`),
      ),
      h(
        'button',
        {
          'data-nav': true,
          'data-side': 'friends',
          class: tab === 'friends' ? 'on' : '',
          onclick: () => {
            tab = 'friends';
            render();
          },
        },
        icon('friends'),
        'Friends',
      ),
      h(
        'button',
        {
          'data-nav': true,
          'data-side': 'requests',
          class: tab === 'requests' ? 'on' : '',
          onclick: () => {
            tab = 'requests';
            render();
          },
        },
        icon('inbox'),
        'Requests',
        st.requests.length ? h('span', { class: 'count' }, st.requests.length) : null,
      ),
      h(
        'button',
        { 'data-nav': true, 'data-side': 'add', onclick: addFriend },
        icon('person-add'),
        'Add friend',
      ),
      h(
        'button',
        {
          'data-nav': true,
          'data-side': 'out',
          onclick: async () => {
            if (
              (await dialog({ title: 'Sign out of Rotur?', actions: [['Cancel'], ['Sign out', true]] })) ===
              'Sign out'
            )
              Rotur.logout();
          },
        },
        icon('signout'),
        'Sign out',
      ),
    );
    const list = h('div', { class: 'list' });
    const pane = h(
      'div',
      { class: 'pane' },
      h(
        'div',
        { class: 'page', 'data-zone': 'pane' },
        h('div', { class: 'page-head' }, h('h2', {}, tab === 'friends' ? 'Friends' : 'Friend requests')),
        list,
      ),
    );
    if (tab === 'friends') {
      const friends = [...st.friends]
        .map(nameOf)
        .sort((a, b) => Rotur.isOnline(b) - Rotur.isOnline(a) || a.localeCompare(b));
      renderList(
        list,
        friends.map(n => ({ n })),
        'n',
        ({ n }) =>
          h(
            'button',
            { class: 'row', 'data-nav': true, onclick: () => showProfile(n) },
            avatar(n),
            h('span', { class: 'label' }, n, h('small', {}, PRESENCE[Rotur.presence(n)] || 'Offline')),
            h('span', { class: 'dot' + (Rotur.isOnline(n) ? ' online' : '') }),
          ),
        'No friends yet. Add someone by their Rotur username.',
      );
    } else {
      renderList(
        list,
        st.requests.map(n => ({ n: nameOf(n) })),
        'n',
        ({ n }) =>
          h(
            'button',
            {
              class: 'row',
              'data-nav': true,
              onclick: async () => {
                const r = await dialog({
                  title: `${n} wants to be friends`,
                  actions: [['Decline', false, true], ['Later'], ['Accept', true]],
                });
                if (r === 'Accept') {
                  const err = await Rotur.accept(n);
                  err
                    ? note({ title: 'Could not accept', text: err, bad: true })
                    : note({ title: `You and ${n} are now friends`, image: avatarUrl(n) });
                }
                if (r === 'Decline') {
                  const err = await Rotur.decline(n);
                  if (err) note({ title: 'Could not decline', text: err, bad: true });
                }
              },
            },
            avatar(n),
            h('span', { class: 'label' }, n, h('small', {}, 'Friend request')),
            icon('chevron', 'chev'),
          ),
        'No pending requests.',
      );
    }
    body().replaceChildren(h('div', { class: 'split' }, side, pane));
    paintIcons(body());
    if (screen !== 'friends' || layers.length) return;
    const again =
      keep &&
      ($(`[data-key="${CSS.escape(keep)}"]`, body()) || $(`[data-side="${CSS.escape(keep)}"]`, body()));
    again ? focus(again, true) : enter();
  }
  async function addFriend() {
    const n = await askText({
      title: 'Add a friend',
      text: 'Their Rotur username',
      done: 'Send request',
      max: 40,
    });
    if (!n) return;
    const err = await Rotur.request(n);
    err
      ? note({ title: 'Request not sent', text: err, bad: true })
      : note({ title: 'Request sent', text: `Waiting for ${n} to accept`, image: avatarUrl(n) });
  }
  return {
    enter() {
      offs.push(
        Rotur.s.on(() => {
          if (screen === 'friends') render();
        }),
      );
      render(true);
    },
    leave() {
      offs.splice(0).forEach(f => f());
      loginEl?._off?.();
      loginEl = null;
      shown = '';
      Rotur.endLogin();
    },
    prompts: () =>
      Rotur.signedIn()
        ? [
            ['b', 'Home'],
            ['a', 'Select'],
          ]
        : [
            ['b', 'Home'],
            ['a', 'New code'],
          ],
  };
})();

Screens.messages = (() => {
  let offs = [],
    loginEl = null,
    lastKey = '';
  const body = () => $('#messages-body');
  const time = t => {
    const d = new Date(Chats.ts({ timestamp: t }));
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  function render() {
    const st = Chats.s.get();
    if (!Rotur.signedIn()) {
      if (!loginEl) {
        loginEl = loginView('Messages use your Rotur account. Sign in to chat with friends.');
        body().replaceChildren(loginEl);
        paintIcons(body());
        if (screen === 'messages' && !layers.length) enter();
      }
      return;
    }
    loginEl?._off?.();
    loginEl = null;
    const chans = [...st.channels].sort((a, b) => (b.last_message || 0) - (a.last_message || 0));
    if (!st.active && chans[0]) {
      Chats.open(chans[0].name);
      return;
    }
    const side = h(
      'nav',
      { class: 'side', 'data-zone': 'side' },
      h(
        'button',
        { 'data-nav': true, 'data-nav-right': '#composer', onclick: newMessage },
        icon('add'),
        'New message',
      ),
      ...chans.map(c => {
        const n = Chats.unread(c.name),
          title = Chats.title(c);
        return h(
          'button',
          {
            'data-nav': true,
            'data-ch': c.name,
            'data-nav-right': '#composer',
            class: c.name === st.active ? 'on' : '',
            onclick: () => {
              Chats.open(c.name);
              render();
              focus($('#composer'));
            },
          },
          h('img', {
            src: avatarUrl(title),
            alt: '',
            style: { width: '1.9rem', height: '1.9rem', borderRadius: '50%', objectFit: 'cover' },
            onerror: e => {
              e.target.src = 'assets/avatar.svg';
            },
          }),
          h(
            'span',
            { style: { flex: 1, minWidth: 0, overflow: 'hidden' } },
            title,
            h('small', { style: { display: 'block' } }, c.last_message ? time(c.last_message) : ''),
          ),
          n ? h('span', { class: 'count' }, n) : null,
        );
      }),
      st.connected ? null : h('small', { style: { padding: '.6rem .8rem' } }, st.status),
    );
    const c = chans.find(x => x.name === st.active);
    const msgs = h('div', { class: 'msgs' });

    if (c)
      msgs.append(
        Chats.isLoading(c.name)
          ? h('div', { class: 'msg-day' }, 'Loading older messages…')
          : Chats.hasOlder(c.name)
            ? h(
                'button',
                {
                  class: 'chip',
                  'data-nav': true,
                  id: 'older',
                  style: { alignSelf: 'center', margin: '.2rem 0 .4rem' },
                  onclick: loadOlder,
                },
                'Load older messages',
              )
            : h('div', { class: 'msg-day' }, 'Start of conversation'),
      );
    let lastDay = '';
    for (const m of st.threads.get(st.active) || []) {
      const d = new Date(Chats.ts(m)).toDateString();
      if (d !== lastDay) {
        lastDay = d;
        msgs.append(
          h(
            'div',
            { class: 'msg-day' },
            d === new Date().toDateString()
              ? 'Today'
              : new Date(Chats.ts(m)).toLocaleDateString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                }),
          ),
        );
      }
      msgs.append(bubble(m));
    }
    const pane = h(
      'div',
      { class: 'pane' },
      h(
        'div',
        { class: 'page chat', 'data-zone': 'pane' },
        c
          ? [
              h(
                'div',
                { class: 'chat-head' },
                h('img', {
                  src: avatarUrl(Chats.title(c)),
                  alt: '',
                  onerror: e => {
                    e.target.src = 'assets/avatar.svg';
                  },
                }),
                h('b', {}, Chats.title(c)),
                h('small', {}, PRESENCE[Rotur.presence(Chats.title(c))] || ''),
                c.type !== 'group'
                  ? Secure.encrypted(c.name)
                    ? [
                        h('span', { class: 'e2e-on' }, icon('lock'), 'Encrypted'),
                        h(
                          'button',
                          { class: 'chip', 'data-nav': true, id: 'e2e', onclick: () => toggleE2E(c) },
                          'Decrypt',
                        ),
                      ]
                    : h(
                        'button',
                        { class: 'chip', 'data-nav': true, id: 'e2e', onclick: () => toggleE2E(c) },
                        icon('lock'),
                        'Encrypt',
                      )
                  : null,
              ),
              msgs,
              signingHint(),
              h(
                'div',
                { class: 'composer' },
                h(
                  'button',
                  {
                    class: 'row',
                    'data-nav': true,
                    id: 'composer',
                    'data-nav-up': '#older, #e2e',
                    onclick: write,
                  },
                  icon('messages'),
                  'Write a message…',
                ),
              ),
            ]
          : h(
              'div',
              { class: 'list' },
              h(
                'div',
                { class: 'empty' },
                st.connected ? 'No conversations yet. Start one with New message.' : st.status,
              ),
            ),
      ),
    );
    const focusedCh = document.activeElement?.dataset?.ch,
      onComposer = document.activeElement?.id === 'composer',
      onOlder = document.activeElement?.id === 'older';
    const old = $('.msgs', body()),
      sameChat = old && old.dataset.ch === st.active;
    const fromBottom = sameChat ? old.scrollHeight - old.scrollTop : 0,
      wasAtBottom = !sameChat || fromBottom - old.clientHeight < 40;
    msgs.dataset.ch = st.active || '';
    body().replaceChildren(h('div', { class: 'split' }, side, pane));
    paintIcons(body());

    msgs.scrollTop = wasAtBottom ? msgs.scrollHeight : msgs.scrollHeight - fromBottom;

    const byHand = () => {
      if (msgs.scrollTop < 30 && c && Chats.hasOlder(c.name)) loadOlder();
    };
    msgs.addEventListener('wheel', () => setTimeout(byHand, 50), { passive: true });
    msgs.addEventListener('touchend', () => setTimeout(byHand, 50), { passive: true });
    if (onOlder) {
      const btn = $('#older');
      if (btn) {
        btn.tabIndex = -1;
        btn.focus({ preventScroll: true });
        memory.set(zoneOf(btn), btn);
        updatePrompts();
      } else if ($('#composer')) focus($('#composer'), true);
      return;
    }
    if (screen !== 'messages' || layers.length) return;
    if (onComposer && $('#composer')) focus($('#composer'), true);
    else if (focusedCh) focus($(`[data-ch="${CSS.escape(focusedCh)}"]`) || navItems()[0], true);
    else if (!current()) enter();
  }

  function signingHint() {
    const st = Chats.signing();
    if (st.on || st.reason === 'Connecting…') return null;
    return h(
      'div',
      { class: 'sign-hint' },
      icon('lock'),
      h('span', {}, `Your messages aren't signed: ${st.reason}`),
      st.fix
        ? h(
            'button',
            {
              class: 'chip',
              'data-nav': true,
              onclick: () => {
                go('settings');
                setTimeout(() => {
                  const b = $('[data-cat="account"]');
                  if (b) focus(b);
                }, 50);
              },
            },
            'Fix',
          )
        : null,
    );
  }

  function bubble(m) {
    const mine = bare(m.user) === bare(Rotur.me());
    let text = m.content,
      lock = false;
    if (Secure.isEncrypted(m.content)) {
      lock = true;
      const d = Secure.decrypt(m, Chats.changed);
      text = d.text ?? (d.pending ? 'Decrypting…' : `Can't decrypt: ${d.error}`);
    }
    const st = Secure.check(m, Chats.signingUrl(), Chats.changed);
    const SIG = {
      verified: ['check', 'Signed'],
      invalid: ['close', "Signature doesn't match"],
      unavailable: ['system', "Couldn't check signature"],
    }[st];
    return h(
      'div',
      { class: 'msg' + (mine ? ' mine' : '') + (st === 'invalid' ? ' bad-sig' : '') },
      text,
      h(
        'time',
        {},
        time(m.timestamp),
        lock ? h('span', { class: 'mflag' }, icon('lock'), 'Encrypted') : null,
        SIG ? h('span', { class: 'mflag sig-' + st, title: SIG[1] }, icon(SIG[0]), SIG[1]) : null,
      ),
    );
  }
  async function toggleE2E(c) {
    if (Secure.encrypted(c.name)) {
      if (
        (await dialog({
          title: 'Stop encrypting?',
          text: `New messages to ${Chats.title(c)} will be sent as plain text. What was already sent stays encrypted.`,
          actions: [['Cancel'], ['Decrypt', true]],
        })) !== 'Decrypt'
      )
        return;
      Secure.setEncrypted(c.name, false, true);
      lastKey = '';
      render();
      return;
    }
    if (!(await Secure.supported))
      return note({
        title: "Encryption isn't available",
        text: 'This WebView is too old for Ed25519. Update Android System WebView.',
        bad: true,
      });
    if (!Rotur.hasSecure()) {
      if (
        (await dialog({
          title: 'Turn on message security?',
          text: 'Encrypting and signing messages uses your Rotur signing key. You will sign in again and allow "Read private signing key".',
          actions: [['Cancel'], ['Continue', true]],
        })) === 'Continue'
      )
        Rotur.setSecure(true);
      return;
    }
    if (
      (await dialog({
        title: `Encrypt messages to ${Chats.title(c)}?`,
        text: 'Only you and they can read what you send from now on. They need Warpdrive (or another app that opens Rotur envelopes) to read it; other apps show a placeholder.',
        actions: [['Cancel'], ['Encrypt', true]],
      })) !== 'Encrypt'
    )
      return;
    Secure.setEncrypted(c.name, true, true);
    lastKey = '';
    render();
  }
  function loadOlder() {
    if (Chats.loadOlder()) Sound.play('select');
  }

  function shoulder(dir) {
    const m = $('.msgs', body());
    if (!m) return;
    m.scrollBy({ top: dir * m.clientHeight * 0.8, behavior: prefs.motion ? 'smooth' : 'auto' });
    if (dir < 0 && m.scrollTop - m.clientHeight * 0.8 < 30 && !Chats.isLoading(Chats.s.get().active))
      loadOlder();
    Sound.play('move');
  }
  async function write() {
    const t = await askText({
      title: `Message ${Chats.title(Chats.s.get().channels.find(x => x.name === Chats.s.get().active))}`,
      done: 'Send',
      max: 2000,
    });
    if (t) {
      try {
        await Chats.send(t);
        Sound.play('select');
      } catch (e) {
        note({ title: 'Message not sent', text: e.message, bad: true });
      }
    }
    requestAnimationFrame(() => $('#composer') && focus($('#composer'), true));
  }
  async function newMessage() {
    const friends = Rotur.s.get().friends.map(nameOf);
    const pick = await dialog({
      title: 'New message',
      text: friends.length ? 'Pick a friend, or type a username.' : 'Type a Rotur username.',
      actions: [...friends.slice(0, 6).map(f => [f]), ['Type a name…'], ['Cancel']],
    });
    let who =
      pick === 'Type a name…'
        ? await askText({ title: 'Message who?', text: 'Rotur username', done: 'Open chat', max: 40 })
        : pick !== 'Cancel'
          ? pick
          : null;
    if (who) {
      Chats.startDM(who.trim());
      render();
    }
  }
  return {
    enter() {
      offs.push(
        Chats.s.on(() => {
          if (screen === 'messages') {
            const k = JSON.stringify([
              Chats.s.get().active,
              Chats.s.get().channels.length,
              (Chats.s.get().threads.get(Chats.s.get().active) || []).length,
              Chats.s.get().connected,
              Chats.s.get().channels.map(c => Chats.unread(c.name)),
              Chats.isLoading(Chats.s.get().active),
              Chats.hasOlder(Chats.s.get().active),
              Chats.s.get().v,
            ]);
            if (k !== lastKey) {
              lastKey = k;
              render();
            }
          }
        }),
      );
      offs.push(
        Rotur.s.on(st => {
          if (screen === 'messages' && !!st.token !== !!body().querySelector('.split')) {
            lastKey = '';
            render();
          }
        }),
      );
      if (Chats.s.get().active) Chats.markRead(Chats.s.get().active);
      render();
    },
    leave() {
      offs.splice(0).forEach(f => f());
      loginEl?._off?.();
      loginEl = null;
      lastKey = '';
      Rotur.endLogin();
    },
    shoulder,
    prompts: el =>
      el?.id === 'composer'
        ? [
            ['l', 'Scroll'],
            ['b', 'Home'],
            ['a', 'Write'],
          ]
        : el?.id === 'older'
          ? [
              ['l', 'Scroll'],
              ['b', 'Home'],
              ['a', 'Load'],
            ]
          : [
              ['b', 'Home'],
              ['a', 'Open'],
            ],
  };
})();
