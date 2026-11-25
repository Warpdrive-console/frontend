'use strict';

const T = (label, path, sub = '') =>
  `<button class="row" data-nav data-toggle="${path}"><span class="label">${label}${sub ? `<small>${sub}</small>` : ''}</span><i class="switch"></i></button>`;

const P = (label, pref, sub = '') =>
  `<button class="row" data-nav data-pref="${pref}"><span class="label">${label}${sub ? `<small>${sub}</small>` : ''}</span><i class="switch"></i></button>`;

const SL = (label, path) =>
  `<div class="row slider" data-nav data-slider="${path}"><span class="label">${label}</span><div class="track"><b></b></div><em></em></div>`;

const KV = (label, bind, f = 'text', cls = '') =>
  `<div class="kv ${cls}"><span>${label}</span><b data-bind="${bind}" data-fmt="${f}">…</b></div>`;

const ROW = (label, id, value = '', sub = '') =>
  `<button class="row" data-nav id="${id}"><span class="label">${label}${sub ? `<small>${sub}</small>` : ''}</span><em>${value}</em><span class="i chev" data-i="chevron"></span></button>`;

const SEG = (path, options, suffix = '') =>
  `<div class="seg" data-choice="${path}" data-options="${options}" data-suffix="${suffix}"></div>`;

const GRAPH = (label, path, f, extra = '') =>
  `<div class="graph-card"><div class="gh"><span>${label}</span><b data-bind="${path}" data-fmt="${f}">…</b></div><canvas class="graph" data-graph="${path}" data-fmt="${f}" ${extra}></canvas><div class="gf"></div></div>`;

const H3 = t => `<h3>${t}</h3>`;

const wifiIcon = s => `status/wifi-${s <= 0 ? 0 : Math.max(1, Math.ceil(s * 3))}`;
const barsIcon = s => `status/cell-${s <= 0 ? 0 : Math.max(1, Math.ceil(s * 4))}`;

const typeIcon = t =>
  ({ gamepad: 'controller', audio: 'sound', input: 'controller', computer: 'display' })[t] || 'bluetooth';

const PAGES = {
  account: {
    title: 'Account',
    icon: 'account',
    html: () => `<div id="acc"></div>`,
    init(el, watch, offs) {
      const paint = () => {
        const st = Rotur.s.get(),
          box = $('#acc', el);
        if (!Rotur.signedIn()) {
          box.innerHTML = `<div class="profile-card"><img src="assets/avatar.svg" alt=""><b>Not signed in</b><small>Sign in with Rotur for friends, presence and messages.</small></div>
            ${ROW('Sign in with Rotur', 'acc-in')}`;
          $('#acc-in', box).onclick = () => go('friends');
        } else {
          box.innerHTML = `<div class="profile-card"><img alt=""><b></b><small></small><p></p></div>
            <div class="grid two" style="margin-top:.4rem"><div class="kv"><span>Friends</span><b>${st.friends.length}</b></div><div class="kv"><span>Online now</span><b>${Rotur.onlineCount()}</b></div></div>
            ${ROW('Friends', 'acc-fr')}${ROW('Messages', 'acc-msg')}
            ${H3('Message security')}<div id="acc-sec"></div>
            ${ROW('Sign out', 'acc-out')}`;
          $('img', box).src = avatarUrl(st.username, 192);
          $('img', box).onerror = e => {
            e.target.src = 'assets/avatar.svg';
          };
          $('b', box).textContent = Rotur.displayName();
          $('small', box).textContent = '@' + st.username;
          $('p', box).textContent = st.user?.bio || '';
          $('#acc-fr', box).onclick = () => go('friends');
          $('#acc-msg', box).onclick = () => go('messages');
          paintSecurity($('#acc-sec', box));
          $('#acc-out', box).onclick = async () => {
            if (
              (await dialog({ title: 'Sign out of Rotur?', actions: [['Cancel'], ['Sign out', true]] })) ===
              'Sign out'
            )
              Rotur.logout();
          };
        }
        paintIcons(box);
      };
      offs.push(Rotur.s.on(paint));
      paint();
    },
  },
  wifi: {
    title: 'Wi-Fi',
    icon: 'wifi',
    html: () => `${T('Wi-Fi', 'system.wifi.enabled')}
      <div class="card"><span class="i" id="w-icon" style="width:2.2rem;height:2.2rem"></span><div class="label" style="flex:1;min-width:0"><b data-bind="system.wifi.ssid" data-fmt="ssid"></b><small id="w-sub" style="display:block"></small></div></div>
      <div id="w-details">
        <div class="grid">${KV('Signal', 'system.wifi.details:rssi', 'dbm')}${KV('Band', 'system.wifi.details:band', 'ghz')}${KV('Channel', 'system.wifi.details:channel')}
          ${KV('Link', 'system.wifi.details:link_mbps', 'mbps')}${KV('Standard', 'system.wifi.details:standard')}${KV('Security', 'system.wifi.details:security', 'sec')}</div>
        <div class="grid two" style="margin-top:.4rem">${KV('IP address', 'system.wifi.details:ip')}${KV('Gateway', 'system.wifi.details:gateway')}${KV('MAC', 'system.wifi.details:mac')}${KV('BSSID', 'system.wifi.details:bssid')}${KV('DNS', 'system.wifi.details:dns', 'list', 'full')}</div>
      </div>
      ${ROW('Saved networks', 'w-saved')}${ROW('Join a hidden network', 'w-hidden')}${ROW('Hotspot', 'w-hotspot', '<span data-bind="system.wifi.hotspot" data-fmt="onoff"></span>')}
      <div class="list-head"><h3>Networks</h3><button class="chip" data-nav data-call="system.wifi.scan" id="w-scan">Search</button></div>
      <div class="list" id="w-list"></div>`,
    init(el, watch) {
      const sub = () => {
        const st = warp.peek('system.wifi.connection_status'),
          d = warp.peek('system.wifi.details');
        setIcon(
          $('#w-icon', el),
          st === 'off'
            ? 'status/wifi-off'
            : wifiIcon(st === 'connected' ? warp.peek('system.wifi.strength') : 0),
        );
        $('#w-sub', el).textContent =
          { off: 'Wi-Fi is off', disconnected: 'Not connected', connecting: 'Connecting…' }[st] ||
          (d ? `Connected · ${pct(d.strength)} · ${d.band} GHz` : 'Connected');
      };
      watch('system.wifi.connection_status', sub);
      watch('system.wifi.strength', sub);
      watch('system.wifi.details', d => {
        $('#w-details', el).hidden = !d;
        sub();
      });
      watch('system.wifi.scanning', v => $('#w-scan', el).setAttribute('aria-busy', !!v));
      watch('system.wifi.networks', list =>
        renderList(
          $('#w-list', el),
          list,
          'ssid',
          n =>
            h(
              'button',
              { class: 'row', 'data-nav': true, onclick: () => wifiPick(n) },
              icon(wifiIcon(n.strength)),
              h(
                'span',
                { class: 'label' },
                n.ssid,
                h('small', {}, `${n.band} GHz · channel ${n.channel} · ${n.rssi} dBm`),
              ),
              n.connected
                ? h('span', { class: 'tag on' }, 'Connected')
                : n.saved
                  ? h('span', { class: 'tag' }, 'Saved')
                  : null,
              n.secure ? icon('lock') : null,
            ),
          warp.peek('system.wifi.enabled') === false
            ? 'Turn Wi-Fi on to see networks.'
            : 'No networks found yet.',
        ),
      );
      $('#w-saved', el).onclick = () => pushPage('wifi_saved');
      $('#w-hotspot', el).onclick = () => pushPage('hotspot');
      $('#w-hidden', el).onclick = async () => {
        const ssid = await askText({ title: 'Hidden network', text: 'Network name' });
        if (!ssid) return;
        const password = await askText({
          title: ssid,
          text: 'Password (leave empty for an open network)',
          secret: true,
          allowEmpty: true,
        });
        if (password == null) return;
        call('system.wifi.connect', { ssid, password, hidden: true });
      };
    },
  },
  wifi_saved: {
    title: 'Saved networks',
    html: () => `<div class="list" id="ws-list"></div>`,
    init(el, watch) {
      watch('system.wifi.saved', list =>
        renderList(
          $('#ws-list', el),
          list,
          'ssid',
          n =>
            h(
              'button',
              {
                class: 'row',
                'data-nav': true,
                onclick: async () => {
                  const r = await dialog({
                    title: n.ssid,
                    text: `Saved ${fmt('sec', n.security)} network.`,
                    actions: [['Forget', false, true], ['Cancel'], ['Connect', true]],
                  });
                  if (r === 'Connect') call('system.wifi.connect', { ssid: n.ssid });
                  if (r === 'Forget') call('system.wifi.forget', { ssid: n.ssid });
                },
              },
              icon('wifi'),
              h('span', { class: 'label' }, n.ssid, h('small', {}, fmt('sec', n.security))),
              icon('chevron', 'chev'),
            ),
          'Nothing saved yet.',
        ),
      );
    },
  },
  hotspot: {
    title: 'Hotspot',
    html: () => `${T('Hotspot', 'system.wifi.hotspot', 'Share this device’s connection')}
      ${ROW('Name', 'hs-name', '<span data-bind="system.wifi.hotspot_config:ssid"></span>')}
      ${ROW('Password', 'hs-pass', '<span data-bind="system.wifi.hotspot_config:password"></span>')}
      ${H3('Band')}<div class="seg" id="hs-band"></div>`,
    init(el, watch) {
      const setCfg = c => warp.set('system.wifi.hotspot_config', c).catch(fail);
      $('#hs-name', el).onclick = async () => {
        const v = await askText({
          title: 'Hotspot name',
          value: warp.peek('system.wifi.hotspot_config')?.ssid,
        });
        if (v) setCfg({ ssid: v });
      };
      $('#hs-pass', el).onclick = async () => {
        const v = await askText({
          title: 'Hotspot password',
          text: '8 or more characters',
          value: warp.peek('system.wifi.hotspot_config')?.password,
          secret: true,
        });
        if (v) setCfg({ password: v });
      };
      const band = $('#hs-band', el);
      band.append(
        ...[
          ['2.4', '2.4 GHz'],
          ['5', '5 GHz'],
          ['any', 'Automatic'],
        ].map(([v, l]) =>
          h('button', { 'data-nav': true, 'data-value': v, onclick: () => setCfg({ band: v }) }, l),
        ),
      );
      watch('system.wifi.hotspot_config', c => {
        for (const b of band.children) b.setAttribute('aria-checked', c?.band === b.dataset.value);
      });
    },
  },
  bt: {
    title: 'Bluetooth',
    icon: 'bluetooth',
    html: () => `${T('Bluetooth', 'system.bluetooth.enabled')}${T('Visible to other devices', 'system.bluetooth.discoverable', 'For two minutes')}
      ${ROW('Device name', 'bt-name', '<span data-bind="system.bluetooth.name"></span>')}
      <div class="grid two">${KV('Address', 'system.bluetooth.address')}${KV('Sound output', 'system.audio.output', 'cap')}</div>
      <div class="list-head"><h3>Devices</h3><button class="chip" data-nav data-call="system.bluetooth.scan" id="bt-scan">Search</button></div>
      <div class="list" id="bt-list"></div>`,
    init(el, watch) {
      watch('system.bluetooth.scanning', v => $('#bt-scan', el).setAttribute('aria-busy', !!v));
      $('#bt-name', el).onclick = async () => {
        const v = await askText({ title: 'Bluetooth name', value: warp.peek('system.bluetooth.name') });
        if (v) warp.set('system.bluetooth.name', v).catch(fail);
      };
      watch('system.bluetooth.devices', list =>
        renderList(
          $('#bt-list', el),
          list,
          'address',
          d => {
            const state = d.busy
              ? 'Working…'
              : d.connected
                ? 'Connected' + (d.profiles?.length ? ` (${d.profiles.join(', ')})` : '')
                : d.paired
                  ? 'Paired'
                  : 'Available';
            return h(
              'button',
              { class: 'row', 'data-nav': true, onclick: () => btPick(d) },
              icon(typeIcon(d.type)),
              h('span', { class: 'label' }, d.name, h('small', {}, state)),
              d.battery != null ? h('em', {}, pct(d.battery)) : null,
              d.busy ? h('span', { class: 'spin' }) : null,
            );
          },
          warp.peek('system.bluetooth.enabled') === false
            ? 'Turn Bluetooth on to see devices.'
            : 'Put a device in pairing mode, then Search.',
        ),
      );
    },
  },
  network: {
    title: 'Network',
    icon: 'network',
    html: () => `${T('Airplane mode', 'system.network.airplane')}${T('Mobile data', 'system.network.mobile_data')}
      <div class="card" id="cell-card"><span class="i" id="cell-icon" style="width:2rem;height:2rem"></span><div style="flex:1"><b id="cell-carrier"></b><small id="cell-sub" style="display:block"></small></div></div>
      ${T('Location', 'system.network.location', 'Lets apps and games use your position')}
      <div class="grid two">${KV('Internet', 'system.network.online', 'yes')}${KV('Connected via', 'system.network.type', 'cap')}</div>`,
    init(el, watch) {
      watch('system.network.cellular', c => {
        $('#cell-card', el).hidden = !c;
        if (!c) return;
        setIcon($('#cell-icon', el), barsIcon(c.strength));
        $('#cell-carrier', el).textContent = c.sim ? c.carrier || 'Mobile network' : 'No SIM';
        $('#cell-sub', el).textContent = c.sim
          ? `${c.type} · signal ${pct(c.strength)}`
          : 'Insert a SIM to use mobile data';
      });
    },
  },
  battery: {
    title: 'Battery',
    icon: 'battery',
    html: () => `<div class="bat-head"><div><div class="bat-big" data-bind="system.battery.level" data-fmt="pct">…</div><small data-bind="system.battery.status" data-fmt="cap"></small></div>
        <div style="flex:1"><div class="bat-bar" id="b-bar"><b></b></div><small style="display:block;margin-top:.35rem" data-bind="system.battery.time_remaining" data-fmt="left"></small></div></div>
      ${GRAPH('Power draw', 'system.battery.power', 'watt', 'data-abs data-min="0" data-span="2"')}
      <div class="grid">${KV('Temperature', 'system.battery.temperature', 'temp')}${KV('Voltage', 'system.battery.voltage', 'volt')}${KV('Current', 'system.battery.current', 'amp')}
        ${KV('Health', 'system.battery.health', 'cap')}${KV('Cycles', 'system.battery.cycles')}${KV('Capacity left', 'system.battery.capacity:health', 'pct')}
        ${KV('Full charge', 'system.battery.capacity:full_mah', 'mah')}${KV('Design', 'system.battery.capacity:design_mah', 'mah')}${KV('Charger', 'system.battery.plugged', 'cap')}</div>
      ${T('Battery saver', 'system.battery.saver', 'Less background work, longer play')}`,
    init(el, watch) {
      watch('system.battery.level', l => {
        $('#b-bar b', el).style.width = pct(l);
        $('#b-bar', el).classList.toggle('low', l < 0.15);
      });
    },
  },
  display: {
    title: 'Display',
    icon: 'display',
    html: () => `${SL('Brightness', 'system.display.brightness')}${T('Adaptive brightness', 'system.display.auto_brightness')}
      ${H3('Refresh rate')}${SEG('system.display.refresh_rate', 'system.display.refresh_rates', ' Hz')}
      ${T('Night Light', 'system.display.night_light', 'Warmer colours in the evening')}${T('Lock rotation', 'system.display.rotation_lock')}
      ${ROW('Screen off after', 'd-sleep', '<span data-bind="system.display.sleep_after" data-fmt="dur"></span>')}
      <div class="grid">${KV('Resolution', 'system.display.info', 'res')}${KV('Density', 'system.display.info:density')}${KV('HDR', 'system.display.info:hdr', 'yes')}</div>`,
    init(el) {
      $('#d-sleep', el).onclick = () => {
        const steps = [30, 60, 120, 300, 600, 1800],
          now = warp.peek('system.display.sleep_after') || 60;
        warp.set('system.display.sleep_after', steps.find(s => s > now) || steps[0]).catch(fail);
      };
    },
  },
  sound: {
    title: 'Sound',
    icon: 'sound',
    html: () => `${SL('Volume', 'system.audio.volume')}${T('Mute', 'system.audio.muted')}${T('Microphone off', 'system.audio.mic_muted')}
      <div class="grid two">${KV('Output', 'system.audio.output', 'cap')}${KV('Vibration motor', 'system.haptics.available', 'yes')}</div>
      ${H3('Interface')}${P('Menu sounds', 'sounds', 'Clicks and chimes while you navigate')}${SL('Vibration feedback', 'system.haptics.strength')}
      ${ROW('Test vibration', 's-buzz')}`,
    init(el) {
      $('#s-buzz', el).onclick = () => call('system.haptics.vibrate', { pattern: [40, 60, 40, 60, 120] });
    },
  },
  performance: {
    title: 'Performance',
    icon: 'performance',
    html: () => `${H3('Profile')}${SEG('system.performance.profile', 'system.performance.profiles')}
      <div id="p-fan">${H3('Fan')}${SEG('system.fan.mode', 'system.fan.modes')}<div class="grid two" style="margin-top:.4rem">${KV('Fan speed', 'system.fan.rpm', 'rpm')}${KV('Mode', 'system.fan.mode', 'cap')}</div></div>
      ${GRAPH('CPU load', 'system.performance.cpu_usage', 'pct', 'data-min="0" data-max="1" data-span="0.4"')}
      ${GRAPH('CPU temperature', 'system.performance.cpu_temp', 'temp', 'data-span="10"')}
      ${GRAPH('GPU load', 'system.performance.gpu_usage', 'pct', 'data-min="0" data-max="1" data-span="0.4"')}
      <div class="grid">${KV('Avg clock', 'system.performance.cpu_freq:avg_mhz', 'mhz')}${KV('Max clock', 'system.performance.cpu_freq:max_mhz', 'mhz')}${KV('Heat', 'system.performance.thermal', 'cap')}
        ${KV('Memory', 'system.performance.memory', 'ram', 'wide')}${KV('In use', 'system.performance.memory:fraction', 'pct')}</div>
      <div class="meter" data-meter="system.performance.memory:fraction"><b></b></div>`,
    init(el, watch) {
      watch('system.fan.available', a => {
        $('#p-fan', el).hidden = !a;
      });
    },
  },
  motion: {
    title: 'Motion sensors',
    icon: 'motion',
    html: () => `<div class="motion-stage"><div class="cube-box"><div class="cube" id="m-cube"><i>FRONT</i><i>BACK</i><i></i><i></i><i>TOP</i><i></i></div></div>
        <div class="axes"><div class="axis"><span>P</span><div class="bipolar"><b id="m-p"></b></div><em id="m-pv"></em></div>
          <div class="axis"><span>R</span><div class="bipolar"><b id="m-r"></b></div><em id="m-rv"></em></div>
          <div class="axis"><span>Y</span><div class="bipolar"><b id="m-y"></b></div><em id="m-yv"></em></div></div></div>
      ${H3('Gyroscope (rad/s)')}<div class="axes" id="m-gyro"></div>
      ${H3('Accelerometer (m/s²)')}<div class="axes" id="m-acc"></div>
      <div class="grid">${KV('Light', 'sensors.light', 'lux')}<div class="kv"><span>Shakes</span><b id="m-shakes">0</b></div>${KV('Rate', 'sensors.rate', 'hz')}</div>
      ${H3('Sample rate')}${SEG('sensors.rate', '15,30,60', ' Hz')}
      ${ROW('Recenter', 'm-center', '', 'Make the current heading straight ahead')}`,
    init(el, watch, offs) {
      const axes = (box, labels) =>
        labels.map(l => {
          const r = h(
            'div',
            { class: 'axis' },
            h('span', {}, l),
            h('div', { class: 'bipolar' }, h('b')),
            h('em'),
          );
          box.append(r);
          return r;
        });
      const g = axes($('#m-gyro', el), ['X', 'Y', 'Z']),
        a = axes($('#m-acc', el), ['X', 'Y', 'Z']);
      const bar = (b, v, range) => {
        const f = Math.max(-1, Math.min(1, v / range));
        b.style.left = f < 0 ? 50 + f * 50 + '%' : '50%';
        b.style.width = Math.abs(f) * 50 + '%';
      };
      let last = null,
        raf = 0;
      offs.push(
        warp.on('sensors.motion', m => {
          last = m;
          if (!raf) raf = requestAnimationFrame(draw);
        }),
      );
      function draw() {
        raf = 0;
        const m = last;
        if (!m || !el.isConnected) return;
        const o = m.orientation;
        $('#m-cube', el).style.transform =
          `rotateX(${-o.pitch}deg) rotateY(${o.yaw}deg) rotateZ(${o.roll}deg)`;
        for (const [k, key, range] of [
          ['p', 'pitch', 90],
          ['r', 'roll', 180],
          ['y', 'yaw', 180],
        ]) {
          bar($('#m-' + k, el), o[key], range);
          $(`#m-${k}v`, el).textContent = Math.round(o[key]) + '°';
        }
        m.gyro.forEach((v, i) => {
          bar($('b', g[i]), v, 5);
          $('em', g[i]).textContent = v.toFixed(2);
        });
        m.accel.forEach((v, i) => {
          bar($('b', a[i]), v, 12);
          $('em', a[i]).textContent = v.toFixed(1);
        });
      }
      let shakes = 0;
      offs.push(
        warp.on('sensors.shake', () => {
          $('#m-shakes', el).textContent = ++shakes;
        }),
      );
      $('#m-center', el).onclick = () => call('sensors.recenter');
    },
  },
  controllers: {
    title: 'Controllers',
    icon: 'controller',
    html: () => `<div class="list" id="c-list"></div>
      ${H3('Input test')}<div class="sticks"><div class="stick" id="c-ls"><b></b></div><div class="stick" id="c-rs"><b></b></div></div>
      <div class="grid two"><div class="kv"><div class="trig"><span>LT</span><div class="meter" id="c-lt"><b></b></div></div></div><div class="kv"><div class="trig"><span>RT</span><div class="meter" id="c-rt"><b></b></div></div></div></div>
      <div class="grid two"><div class="kv"><span>Last button</span><b id="c-last">Press something</b></div><div class="kv"><span>Held</span><b id="c-held">None</b></div></div>
      ${ROW('Test rumble', 'c-rumble')}`,
    init(el, watch, offs) {
      watch('input.gamepads', pads =>
        renderList(
          $('#c-list', el),
          pads,
          'id',
          p =>
            h(
              'div',
              { class: 'row' },
              icon('controller'),
              h(
                'span',
                { class: 'label' },
                p.name,
                h(
                  'small',
                  {},
                  `${p.builtin ? 'Built in' : 'Wireless'} · ${p.rumble ? 'rumble' : 'no rumble'}`,
                ),
              ),
              h('span', { class: 'tag' + (p.builtin ? '' : ' on') }, p.builtin ? 'Built in' : 'Connected'),
            ),
          'No controllers found.',
        ),
      );
      const put = (s, x, y) => {
        const b = $('b', s);
        b.style.left = 50 + x * 50 + '%';
        b.style.top = 50 + y * 50 + '%';
      };
      offs.push(
        warp.on('input.stick', st => {
          put($('#c-ls', el), st.lx, st.ly);
          put($('#c-rs', el), st.rx, st.ry);
          $('#c-lt b', el).style.width = pct(st.lt);
          $('#c-rt b', el).style.width = pct(st.rt);
        }),
      );
      const held = new Set();
      offs.push(
        warp.on('input.button', e => {
          if (e.pressed) {
            held.add(e.button);
            $('#c-last', el).textContent = e.button.toUpperCase();
          } else held.delete(e.button);
          $('#c-held', el).textContent = held.size ? [...held].join(' + ').toUpperCase() : 'None';
        }),
      );
      $('#c-rumble', el).onclick = () => call('input.rumble', { ms: 400, strength: 1 });
    },
  },
  storage: {
    title: 'Storage',
    icon: 'storage',
    html: () => `<div class="list" id="st-list"></div>`,
    init(el, watch) {
      watch('system.device.volumes', vols =>
        renderList(
          $('#st-list', el),
          vols,
          'path',
          v =>
            h(
              'div',
              { class: 'card', style: { flexDirection: 'column', alignItems: 'stretch', gap: '.45rem' } },
              h(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', fontWeight: 650 } },
                h('span', {}, v.name),
                h('span', { style: { color: 'var(--dim)' } }, `${gb(v.free)} free of ${gb(v.total)}`),
              ),
              h('div', { class: 'meter' }, h('b', { style: { width: pct(v.fraction) } })),
              h('small', {}, v.path + (v.removable ? ' · removable' : '')),
            ),
          'No storage found.',
        ),
      );
    },
  },
  theme: {
    title: 'Theme',
    icon: 'theme',
    html: () => `${H3('Appearance')}<div class="seg"><button data-nav data-pref="theme=dark">Basic Black</button><button data-nav data-pref="theme=light">Basic White</button></div>
      ${H3('Accent colour')}<div class="swatches" id="th-acc"></div>
      ${P('Animations', 'motion', 'Turn off for a snappier, still interface')}`,
    init(el) {
      $('#th-acc', el).append(
        ...ACCENTS.map(([c, name]) =>
          h('button', {
            class: 'sw',
            'data-nav': true,
            'data-pref': 'accent=' + c,
            title: name,
            style: { background: c },
          }),
        ),
      );
    },
  },
  system: {
    title: 'System',
    icon: 'system',
    html: () => `<div class="grid" id="sys-info"></div>
      ${T('Do not disturb', 'system.notifications.dnd')}
      ${ROW('Take a screenshot', 'sys-shot')}
      ${ROW('Use Nova as the home screen', 'sys-home', '<span data-bind="system.home.default" data-fmt="yes"></span>')}
      ${H3('Frontends')}<div class="list" id="sys-fe"></div>
      ${ROW('Install a frontend', 'sys-pick', '', 'Pick a website .zip')}
      ${ROW('Error log', 'sys-log', '', 'Crashes and errors, newest last')}
      ${H3('Power')}<div class="chips">
        <button class="chip" data-nav data-power="sleep">Sleep</button><button class="chip" data-nav data-power="reboot">Restart</button>
        <button class="chip" data-nav data-power="recovery">Recovery</button><button class="chip" data-nav data-power="bootloader">Bootloader</button>
        <button class="chip danger" data-nav data-power="shutdown">Power off</button></div>`,
    init(el, watch) {
      Promise.all([
        warp.get('system.device.info'),
        warp.get('shell.version'),
        warp.get('system.device.uptime'),
      ])
        .then(([d, v, up]) => {
          const cell = (k, val, cls = '') =>
            h('div', { class: 'kv ' + cls }, h('span', {}, k), h('b', {}, String(val ?? 'n/a')));
          $('#sys-info', el).replaceChildren(
            cell('Device', d.name, 'wide'),
            cell('Root', d.rooted ? 'Yes' : 'No'),
            cell('Model', d.model),
            cell('Maker', d.manufacturer),
            cell('Chip', d.soc),
            cell('Android', `${d.android} (API ${d.sdk})`),
            cell('RAM', gb(d.ram)),
            cell('Patch', d.security_patch),
            cell('Kernel', d.kernel, 'full'),
            cell('Up for', dur(up)),
            cell('Backend', v),
            cell('Frontend', 'Nova 3'),
          );
        })
        .catch(fail);
      $('#sys-shot', el).onclick = () =>
        warp
          .call('system.display.screenshot')
          .then(p => note({ title: 'Screenshot saved', text: p.split('/').pop(), iconName: 'camera' }), fail);
      $('#sys-home', el).onclick = () =>
        warp.peek('system.home.default')
          ? note({ title: 'Nova is already the home screen' })
          : call('system.home.request');
      $('#sys-pick', el).onclick = () => call('shell.frontend.pick');
      $('#sys-log', el).onclick = async () => {
        const text = (await warp.get('shell.log').catch(() => '')) || 'Nothing logged.';
        const pre = h(
          'pre',
          {
            style: {
              maxHeight: '55vh',
              overflow: 'auto',
              fontSize: '.7rem',
              lineHeight: 1.35,
              whiteSpace: 'pre-wrap',
              background: 'var(--bg)',
              padding: '.6rem',
              borderRadius: '.4rem',
              userSelect: 'text',
            },
          },
          text.split('\n').slice(-120).join('\n'),
        );
        if (
          (await dialog({
            title: 'Error log',
            extra: pre,
            actions: [
              ['Clear', false, true],
              ['Close', true],
            ],
          })) === 'Clear'
        )
          call('shell.log_clear');
      };
      watch('shell.frontend.list', list =>
        renderList(
          $('#sys-fe', el),
          list,
          'id',
          f =>
            h(
              'button',
              {
                class: 'row',
                'data-nav': true,
                onclick: async () => {
                  const r = await dialog({
                    title: f.name,
                    text:
                      [f.version && 'Version ' + f.version, f.author && 'by ' + f.author]
                        .filter(Boolean)
                        .join(' · ') || 'Installed frontend.',
                    actions: f.active
                      ? [['Remove', false, true], ['Reload'], ['Close', true]]
                      : [['Remove', false, true], ['Cancel'], ['Switch to it', true]],
                  });
                  if (r === 'Switch to it') call('shell.frontend.activate', { id: f.id });
                  if (r === 'Reload') call('shell.frontend.reload');
                  if (
                    r === 'Remove' &&
                    (await dialog({
                      title: `Remove ${f.name}?`,
                      text: f.active ? 'You will go back to the frontend picker.' : '',
                      actions: [['Keep it'], ['Remove', true, true]],
                    })) === 'Remove'
                  )
                    call('shell.frontend.remove', { id: f.id });
                },
              },
              h(
                'span',
                { class: 'label' },
                f.name,
                h('small', {}, f.version ? 'Version ' + f.version : 'Frontend'),
              ),
              f.active ? h('span', { class: 'tag on' }, 'In use') : null,
              icon('chevron', 'chev'),
            ),
          'None installed.',
        ),
      );
      for (const b of $$('[data-power]', el)) b.onclick = () => powerAsk(b.dataset.power, b.textContent);
    },
  },
};

async function paintSecurity(box) {
  const ok = await Secure.supported;
  if (!ok) {
    box.innerHTML = `<div class="card"><small>This WebView can't do Ed25519, so messages can't be signed, checked or encrypted. Update Android System WebView.</small></div>`;
    return;
  }
  if (!Rotur.hasSecure()) {
    box.innerHTML = `<div class="card"><small>Incoming signatures are already checked. To sign what you send and to use encrypted chats, Warpdrive needs to read your Rotur signing key.</small></div>${ROW('Turn on message security', 'sec-on', '', 'You will sign in again')}`;
    $('#sec-on', box).onclick = async () => {
      if (
        (await dialog({
          title: 'Turn on message security?',
          text: 'You will sign in again and allow "Read private signing key". Rotur may ask for your password.',
          actions: [['Cancel'], ['Continue', true]],
        })) === 'Continue'
      )
        Rotur.setSecure(true);
    };
  } else {
    box.innerHTML = `${P('Sign my messages', 'signMessages', 'Others can check a message really came from you')}
      <div class="card"><small>Encrypt a chat with the lock button at the top of the conversation. Only you and the other person can read it.</small></div>
      ${ROW('Turn off message security', 'sec-off', '', 'Stops signing and decrypting on this device')}`;
    $('#sec-off', box).onclick = async () => {
      if (
        (await dialog({
          title: 'Turn off message security?',
          text: 'Encrypted chats will stay unreadable here until you turn it on again. To fully revoke the key permission, remove this device under Tokens on rotur.dev.',
          actions: [['Cancel'], ['Turn off', true, true]],
        })) !== 'Turn off'
      )
        return;
      Rotur.setSecure(false);
      prefs.signMessages = false;
      applyPrefs();
      paintSecurity(box);
    };
  }
  bind(box);
  paintIcons(box);
}

const CATEGORIES = [
  'account',
  'wifi',
  'bt',
  'network',
  'battery',
  'display',
  'sound',
  'performance',
  'motion',
  'controllers',
  'storage',
  'theme',
  'system',
];

async function powerAsk(what, label) {
  if (
    (await dialog({ title: `${label}?`, actions: [['Cancel'], [label, true, what === 'shutdown']] })) ===
    label
  )
    call('system.power.' + what);
}

const stack = [];

function showPage(id, replace) {
  const def = PAGES[id];
  const el = h('div', {
    class: 'page fades',
    'data-zone': 'pane',
    'data-enter': 'first',
    'data-page': id,
    html:
      `<div class="page-head">${stack.length && !replace ? '<button class="back" data-nav><span class="i" data-i="back"></span></button>' : ''}<h2>${esc(def.title)}</h2></div>` +
      def.html(),
  });
  if (replace) while (stack.length) stack.pop().close();
  const offs = [],
    watch = (p, fn) => offs.push(warp.watch(p, fn));
  $('#set-pane').append(el);
  def.init?.(el, watch, offs);
  const unbind = bind(el);
  $('.back', el)?.addEventListener('click', popPage);
  stack.at(-1)?.el.setAttribute('hidden', '');
  stack.push({
    id,
    el,
    close: () => {
      unbind();
      offs.splice(0).forEach(f => f());
      el.remove();
    },
  });
}

function pushPage(id) {
  showPage(id, false);
  enter();
}

function popPage() {
  if (stack.length < 2) return false;
  stack.pop().close();
  stack.at(-1).el.removeAttribute('hidden');
  enter();
  return true;
}

Screens.settings = {
  enter() {
    const side = $('#set-side');
    if (!side.children.length) {
      let pending = 0;
      const open = id => {
        clearTimeout(pending);
        pending = 0;
        if (stack[0]?.id !== id) {
          showPage(id, true);
          markSide(id);
        }
      };
      side.append(
        ...CATEGORIES.map(id =>
          h(
            'button',
            {
              'data-nav': true,
              'data-cat': id,
              onnavfocus: () => {
                clearTimeout(pending);
                pending = setTimeout(() => open(id), 110);
              },
              onnavleave: () => open(id),
              onclick: () => {
                open(id);
                const first = firstVisible(stack.at(-1).el, navItems());
                if (first) focus(first);
              },
            },
            icon(PAGES[id].icon),
            PAGES[id].title,
          ),
        ),
      );
    }
    if (!stack.length) {
      showPage('wifi', true);
      markSide('wifi');
    }
    memory.set($('#settings'), $(`[data-cat="${stack[0].id}"]`));
  },
  leave() {
    while (stack.length) stack.pop().close();
  },
  scroller: () => stack.at(-1)?.el,
  back() {
    if (popPage()) return true;
    if (document.activeElement?.closest('#set-pane')) {
      focus($(`[data-cat="${stack[0].id}"]`));
      return true;
    }
    return false;
  },
  prompts: el =>
    el?.closest('#set-side')
      ? [
          ['b', 'Home'],
          ['a', 'Open'],
        ]
      : [
          ['b', 'Back'],
          ['a', 'Select'],
        ],
};

function markSide(id) {
  $$('#set-side button').forEach(b => b.classList.toggle('on', b.dataset.cat === id));
}

async function wifiPick(n) {
  if (n.connected) {
    const r = await dialog({
      title: n.ssid,
      text: `Connected · ${n.rssi} dBm · ${n.band} GHz, channel ${n.channel}`,
      actions: [['Forget', false, true], ['Disconnect'], ['Close', true]],
    });
    if (r === 'Disconnect') call('system.wifi.disconnect');
    if (r === 'Forget') call('system.wifi.forget', { ssid: n.ssid });
    return;
  }
  if (n.saved) {
    const r = await dialog({
      title: n.ssid,
      text: 'Saved network.',
      actions: [['Forget', false, true], ['Cancel'], ['Connect', true]],
    });
    if (r === 'Connect') call('system.wifi.connect', { ssid: n.ssid });
    if (r === 'Forget') call('system.wifi.forget', { ssid: n.ssid });
    return;
  }
  let password = '';
  if (n.secure) {
    password = await askText({ title: n.ssid, text: 'Password', secret: true, done: 'Connect' });
    if (!password) return;
  }
  call('system.wifi.connect', { ssid: n.ssid, password });
}

let lastWifi = null;

warp.watch('system.wifi.connection_status', st => {
  if (lastWifi === 'connecting' && st === 'connected')
    warp
      .get('system.wifi.ssid')
      .then(n => note({ title: 'Connected', text: n || 'Wi-Fi', iconName: 'wifi' }));
  if (lastWifi === 'connecting' && st === 'disconnected')
    note({ title: 'Could not connect', text: 'Check the password and try again.', bad: true });
  lastWifi = st;
});

async function btPick(d) {
  if (d.busy) return;
  const address = d.address;
  if (!d.paired)
    return warp
      .call('system.bluetooth.pair', { address })
      .then(() => note({ title: 'Pairing', text: d.name, iconName: 'bluetooth', sound: false }), fail);
  const info = [cap(d.type), d.battery != null ? `battery ${pct(d.battery)}` : null, address]
    .filter(Boolean)
    .join(' · ');
  const r = await dialog({
    title: d.name,
    text: info,
    actions: [['Forget', false, true], ['Rename'], [d.connected ? 'Disconnect' : 'Connect', true]],
  });
  if (r === 'Connect') call('system.bluetooth.connect', { address });
  if (r === 'Disconnect') call('system.bluetooth.disconnect', { address });
  if (r === 'Forget') call('system.bluetooth.unpair', { address });
  if (r === 'Rename') {
    const name = await askText({ title: 'Rename', value: d.name });
    if (name) call('system.bluetooth.rename', { address, name });
  }
}
