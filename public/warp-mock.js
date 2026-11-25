/*
 * warp-mock.js
 * A fake console for building frontends in a desktop browser. Load it after warp.js.
 * When a real console is present it does nothing, and the backend serves an empty file
 * at /warp-mock.js, so the script tag can stay in.
 *
 * The mouse position stands in for the gyroscope, K shakes the device, and launching a
 * game shows a placeholder that Esc or G suspends.
 */
(function () {
  'use strict';
  if (!window.warp) { console.error('[warp-mock] load warp.js first'); return; }

  function createMock(emit) {
    const now = Date.now();
    const clamp = v => Math.max(0, Math.min(1, Number(v) || 0));
    const r3 = v => Math.round(v * 1000) / 1000;
    const svgIcon = (bg, glyph) => 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="url(#g)"/><text x="48" y="62" font-size="42" text-anchor="middle" font-family="sans-serif" fill="#fff">${glyph}</text></svg>`);
    const subs = new Map();
    const watched = prefix => [...subs.keys()].some(k => k === '*' || k.startsWith(prefix) || (k.endsWith('*') && prefix.startsWith(k.slice(0, -1))));

    const s = {
      wifiOn: true, wifiStatus: 'connected', ssid: 'Starlight 5G', rssi: -52, wifiScan: false, hotspot: false,
      apConfig: { ssid: 'Warpdrive-4821', password: 'nebula2049', band: 'any' },
      nets: [
        { ssid: 'Starlight 5G', rssi: -52, secure: true, security: 'wpa2', saved: true, bssid: 'a4:2b:b0:11:22:33', frequency: 5180 },
        { ssid: 'Nebula Guest', rssi: -64, secure: false, security: 'open', saved: false, bssid: '70:4f:57:aa:bb:01', frequency: 2437 },
        { ssid: 'Orbit-2.4', rssi: -71, secure: true, security: 'wpa3', saved: true, bssid: '9c:53:22:0f:1e:2d', frequency: 2412 },
        { ssid: 'NETGEAR-77', rssi: -79, secure: true, security: 'wpa2', saved: false, bssid: 'c0:ff:d4:77:88:99', frequency: 5745 },
        { ssid: 'Comet Café', rssi: -85, secure: true, security: 'wpa2', saved: false, bssid: '14:59:c0:de:ad:01', frequency: 2462 },
      ],
      btOn: true, btScan: false, btName: 'Warp Handheld', discoverable: false,
      bt: [
        { address: 'A4:C1:38:00:11:22', name: 'Wireless Controller', type: 'gamepad', paired: true, connected: true, busy: false, strength: 0.9, battery: 0.8, profiles: ['input'] },
        { address: '00:1B:66:AA:BB:CC', name: 'Pulse Buds', type: 'audio', paired: true, connected: false, busy: false, strength: null, battery: null, profiles: [] },
      ],
      btNearby: [
        { address: 'E8:9E:B4:12:34:56', name: 'Pro Controller', type: 'gamepad', paired: false, connected: false, busy: false, strength: 0.7, battery: null, profiles: [] },
        { address: '5C:EB:68:77:88:99', name: 'Living Room Speaker', type: 'audio', paired: false, connected: false, busy: false, strength: 0.4, battery: null, profiles: [] },
      ],
      airplane: false, data: true, location: true,
      battery: 0.76, charging: false, saver: false, amps: -0.62,
      volume: 0.6, muted: false, mic: false, haptics: 0.6,
      brightness: 0.8, autoBright: false, sleepAfter: 300, night: false, rotLock: true, hz: 60,
      dnd: false, torch: false,
      cpu: 0.18, profile: 'max', fan: 'auto',
      lux: 220, rate: 30, yawZero: 0,
      home: false,
      games: [
        { id: 'starfall', name: 'Starfall', icon: null, url: '#starfall', installed: now - 864e5, last_played: now - 36e5, play_time: 15400 },
        { id: 'bubble_bandit', name: 'Bubble Bandit', icon: null, url: '#bubble', installed: now - 3 * 864e5, last_played: now - 864e5 * 2, play_time: 8200 },
        { id: 'neon_drift', name: 'Neon Drift', icon: null, url: '#drift', installed: now - 9 * 864e5, last_played: null, play_time: 0 },
        { id: 'tiny_tower', name: 'Tiny Tower Defense', icon: null, url: '#tower', installed: now - 20 * 864e5, last_played: now - 864e5 * 6, play_time: 3100 },
        { id: 'pixel_pilot', name: 'Pixel Pilot', icon: null, url: '#pilot', installed: now - 30 * 864e5, last_played: null, play_time: 0 },
      ],
      running: null, inFront: false, since: 0,
      apps: [
        ['com.android.chrome', 'Chrome', ['#4285f4', '#34a853'], 'C'], ['com.retroarch', 'RetroArch', ['#333', '#777'], 'R'],
        ['com.spotify.music', 'Spotify', ['#1db954', '#0b6b30'], 'S'], ['com.google.android.youtube', 'YouTube', ['#ff0000', '#a00'], '▶'],
        ['com.android.settings', 'Android Settings', ['#555', '#222'], '⚙'], ['org.ppsspp.ppsspp', 'PPSSPP', ['#2a6fd6', '#123'], 'P'],
        ['com.valvesoftware.steamlink', 'Steam Link', ['#1b2838', '#2a475e'], 'S'], ['com.netflix.ninja', 'Netflix', ['#e50914', '#600'], 'N'],
        ['org.dolphinemu.dolphinemu', 'Dolphin', ['#3b8de0', '#123c6b'], 'D'], ['com.discord', 'Discord', ['#5865f2', '#2c337a'], 'D'],
      ].map(([pkg, name, bg, g]) => ({ package: pkg, name, icon: svgIcon(bg, g), version: '1.0', system: pkg === 'com.android.settings' })),
      pads: [{ id: 3, name: 'Built-in Controller', builtin: true, vendor: 0x2020, product: 0x3001, rumble: true }, { id: 7, name: 'Wireless Controller', builtin: false, vendor: 0x054c, product: 0x09cc, rumble: true }],
      frontends: [{ id: 'mock', name: 'Mock frontend', version: '1.0', author: null, installed: now }, { id: 'starter', name: 'Starter', version: '1.0', author: null, installed: now - 864e5 }],
      frontend: 'mock',
    };

    const strength = rssi => rssi <= -127 ? 0 : r3(clamp((rssi + 90) / 35));
    const band = f => f < 3000 ? '2.4' : f < 5925 ? '5' : '6';
    const channel = f => f === 2484 ? 14 : f < 3000 ? (f - 2407) / 5 : f < 5925 ? (f - 5000) / 5 : (f - 5950) / 5;
    const wifiStatus = () => !s.wifiOn ? 'off' : s.wifiStatus;
    const conn = () => wifiStatus() === 'connected';
    const nets = () => s.wifiOn ? s.nets.map(n => ({ ssid: n.ssid, rssi: n.rssi, strength: strength(n.rssi), bssid: n.bssid, frequency: n.frequency, band: band(n.frequency), channel: channel(n.frequency), secure: n.secure, security: n.security, saved: n.saved, connected: conn() && n.ssid === s.ssid }))
      .sort((a, b) => (b.connected - a.connected) || (b.rssi - a.rssi)) : [];
    const btDevices = () => s.btOn ? [...s.bt.filter(d => d.paired), ...s.btNearby.filter(d => !d.paired)].map(d => ({ ...d, battery: d.connected ? d.battery : null })) : [];

    const P = {};
    const val = (path, kind, doc, get, set) => { P[path] = { path, kind, doc, get, set }; };
    const act = (path, doc, call) => { P[path] = { path, kind: 'action', doc, call }; };
    const evt = (path, doc) => { P[path] = { path, kind: 'event', doc }; };
    const pub = (...paths) => paths.forEach(p => P[p]?.get && emit(p, clone(P[p].get())));
    const later = (ms, fn) => setTimeout(fn, ms);
    const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));

    /* ---- wifi */
    val('system.wifi.enabled', 'bool', 'Wi-Fi radio on or off', () => s.wifiOn, v => {
      s.wifiOn = !!v; s.wifiStatus = v ? 'connecting' : 'disconnected'; pubWifi();
      if (v) later(1400, () => { s.wifiStatus = 'connected'; pubWifi(); });
    });
    val('system.wifi.connection_status', 'string', 'off | disconnected | connecting | connected', wifiStatus);
    val('system.wifi.connected', 'bool', 'Connected to a network', conn);
    val('system.wifi.ssid', 'string', 'Current network or null', () => conn() ? s.ssid : null);
    val('system.wifi.strength', 'float', 'Signal 0.0 to 1.0', () => conn() ? strength(s.rssi) : 0);
    val('system.wifi.ip', 'string', 'IPv4 or null', () => conn() ? '192.168.1.42' : null);
    val('system.wifi.rssi', 'int', 'Signal in dBm or null', () => conn() ? s.rssi : null);
    val('system.wifi.details', 'object', 'The current connection or null', () => {
      if (!conn()) return null;
      const n = s.nets.find(n => n.ssid === s.ssid) || s.nets[0];
      return { ssid: s.ssid, bssid: n.bssid, rssi: s.rssi, strength: strength(s.rssi), frequency: n.frequency, band: band(n.frequency), channel: channel(n.frequency),
        link_mbps: n.frequency > 5000 ? 866 : 144, tx_mbps: n.frequency > 5000 ? 780 : 130, rx_mbps: n.frequency > 5000 ? 866 : 144, standard: n.frequency > 5000 ? 'Wi-Fi 6' : 'Wi-Fi 4',
        security: n.security, ip: '192.168.1.42', gateway: '192.168.1.1', dns: ['192.168.1.1', '1.1.1.1'], mac: '3c:28:6d:4a:90:1e' };
    });
    val('system.wifi.scanning', 'bool', 'A scan is in progress', () => s.wifiScan);
    val('system.wifi.networks', 'list', 'Nearby networks', nets);
    val('system.wifi.saved', 'list', 'Saved networks', () => s.nets.filter(n => n.saved).map((n, i) => ({ id: String(i), ssid: n.ssid, security: n.security })));
    val('system.wifi.hotspot', 'bool', 'Hotspot', () => s.hotspot, v => { s.hotspot = !!v; });
    val('system.wifi.hotspot_config', 'object', '{ssid, password, band}', () => ({ ...s.apConfig }), v => {
      const c = { ...s.apConfig, ...v }; if (c.password && c.password.length < 8) throw new Error('password needs 8 or more characters'); s.apConfig = c;
    });
    act('system.wifi.scan', 'Look for networks', () => {
      if (!s.wifiOn) return null;
      s.wifiScan = true; pub('system.wifi.scanning');
      later(1800, () => { s.nets.forEach(n => n.rssi = Math.round(Math.max(-92, Math.min(-40, n.rssi + (Math.random() - 0.5) * 8)))); s.wifiScan = false; pub('system.wifi.scanning', 'system.wifi.networks'); });
      return null;
    });
    act('system.wifi.connect', 'Join a network. {ssid, password?, hidden?, security?}', a => {
      let n = s.nets.find(n => n.ssid === a.ssid);
      if (!n && a.hidden) { n = { ssid: a.ssid, rssi: -60, secure: !!a.password, security: a.security || (a.password ? 'wpa2' : 'open'), saved: false, bssid: '02:11:22:33:44:55', frequency: 5200 }; s.nets.push(n); }
      if (!n) throw new Error('no such network');
      if (n.secure && !n.saved && !a.password) throw new Error('password needed');
      s.ssid = a.ssid; s.rssi = n.rssi; s.wifiStatus = 'connecting'; pubWifi();
      later(1500, () => { if (a.password === 'wrong') s.wifiStatus = 'disconnected'; else { s.wifiStatus = 'connected'; n.saved = true; } pubWifi(); });
      return null;
    });
    act('system.wifi.disconnect', 'Leave the current network', () => { s.wifiStatus = 'disconnected'; pubWifi(); return null; });
    act('system.wifi.forget', 'Delete a saved network. {ssid}', a => {
      const n = s.nets.find(n => n.ssid === a.ssid); if (n) n.saved = false;
      if (a.ssid === s.ssid) s.wifiStatus = 'disconnected'; pubWifi(); return null;
    });
    function pubWifi() { pub('system.wifi.enabled', 'system.wifi.connection_status', 'system.wifi.connected', 'system.wifi.ssid', 'system.wifi.strength', 'system.wifi.ip', 'system.wifi.rssi', 'system.wifi.details', 'system.wifi.networks', 'system.wifi.saved', 'system.network.type', 'system.network.online'); }

    /* ---- bluetooth */
    val('system.bluetooth.available', 'bool', 'Has a radio', () => true);
    val('system.bluetooth.enabled', 'bool', 'Bluetooth on or off', () => s.btOn, v => { s.btOn = !!v; if (!v) s.bt.forEach(d => d.connected = false); pubBt(); });
    val('system.bluetooth.connection_status', 'string', 'off | on | connected', () => !s.btOn ? 'off' : s.bt.some(d => d.connected) ? 'connected' : 'on');
    val('system.bluetooth.name', 'string', 'This device name', () => s.btName, v => { if (!v) throw new Error("name can't be empty"); s.btName = String(v); });
    val('system.bluetooth.address', 'string', 'This device address', () => '3C:28:6D:4A:90:1F');
    val('system.bluetooth.discoverable', 'bool', 'Visible to others', () => s.discoverable, v => { s.discoverable = !!v; if (v) later(120000, () => { s.discoverable = false; pub('system.bluetooth.discoverable'); }); });
    val('system.bluetooth.scanning', 'bool', 'Discovery is running', () => s.btScan);
    val('system.bluetooth.devices', 'list', 'Paired devices first, then nearby', btDevices);
    const findBt = a => s.bt.find(d => d.address === a.address) || s.btNearby.find(d => d.address === a.address);
    act('system.bluetooth.scan', 'Discover nearby devices', () => { if (!s.btOn) return null; s.btScan = true; pubBt(); later(4000, () => { s.btScan = false; pubBt(); }); return null; });
    act('system.bluetooth.pair', 'Pair and connect. {address}', a => {
      const d = findBt(a); if (!d) throw new Error('no such device');
      d.busy = true; pubBt();
      later(1600, () => { d.busy = false; d.paired = true; d.connected = true; d.battery = 0.55; d.profiles = [d.type === 'audio' ? 'audio' : 'input']; if (!s.bt.includes(d)) { s.bt.push(d); s.btNearby = s.btNearby.filter(x => x !== d); } pubBt(); });
      return null;
    });
    act('system.bluetooth.unpair', 'Forget a device. {address}', a => { const d = findBt(a); if (d) { d.paired = false; d.connected = false; d.profiles = []; s.bt = s.bt.filter(x => x !== d); s.btNearby.push(d); } pubBt(); return null; });
    act('system.bluetooth.connect', 'Connect a paired device. {address}', a => { const d = findBt(a); if (d) { d.busy = true; pubBt(); later(1200, () => { d.busy = false; d.connected = true; d.battery = d.battery ?? 0.4; d.profiles = [d.type === 'audio' ? 'audio' : 'input']; pubBt(); }); } return null; });
    act('system.bluetooth.disconnect', 'Disconnect. {address}', a => { const d = findBt(a); if (d) { d.connected = false; d.profiles = []; } pubBt(); return null; });
    act('system.bluetooth.rename', 'Local name for a device. {address, name}', a => { const d = findBt(a); if (d) d.name = a.name; pubBt(); return null; });
    function pubBt() { pub('system.bluetooth.enabled', 'system.bluetooth.connection_status', 'system.bluetooth.scanning', 'system.bluetooth.devices', 'system.audio.output'); }

    /* ---- network */
    val('system.network.online', 'bool', 'Internet reachable', () => (conn() || (s.data && !s.airplane)));
    val('system.network.type', 'string', 'wifi | cellular | ethernet | vpn | none', () => conn() ? 'wifi' : (s.data && !s.airplane) ? 'cellular' : 'none');
    val('system.network.airplane', 'bool', 'Airplane mode', () => s.airplane, v => { s.airplane = !!v; if (v) { s.wifiOn = false; s.btOn = false; } pubWifi(); pubBt(); pub('system.network.cellular'); });
    val('system.network.mobile_data', 'bool', 'Mobile data', () => s.data, v => { s.data = !!v; pub('system.network.cellular', 'system.network.type', 'system.network.online'); });
    val('system.network.location', 'bool', 'Location', () => s.location, v => { s.location = !!v; });
    val('system.network.cellular', 'object', '{sim, carrier, type, strength}', () => ({ sim: true, carrier: 'Tigo', type: s.airplane ? 'none' : s.data ? '5G' : 'LTE', strength: s.airplane ? 0 : 0.75 }));

    /* ---- battery */
    const charging = () => s.charging;
    val('system.battery.level', 'float', 'Charge 0.0 to 1.0', () => r3(s.battery));
    val('system.battery.charging', 'bool', 'Charging', charging);
    val('system.battery.present', 'bool', 'Has a battery', () => true);
    val('system.battery.status', 'string', 'charging | discharging | full | not_charging', () => s.battery >= 0.999 && s.charging ? 'full' : s.charging ? 'charging' : 'discharging');
    val('system.battery.plugged', 'string', 'none | ac | usb | wireless | dock', () => s.charging ? 'usb' : 'none');
    val('system.battery.health', 'string', 'Battery health', () => 'good');
    val('system.battery.temperature', 'float', '°C', () => Math.round((31 + s.cpu * 9 + (s.charging ? 3 : 0)) * 10) / 10);
    val('system.battery.voltage', 'float', 'Volts', () => r3(3.6 + s.battery * 0.6));
    val('system.battery.current', 'float', 'Amps (+ charging, - draining)', () => r3(s.amps));
    val('system.battery.power', 'float', 'Watts', () => r3(s.amps * (3.6 + s.battery * 0.6)));
    val('system.battery.time_remaining', 'int', 'Seconds to full or empty', () => s.charging ? Math.round((1 - s.battery) * 5000 / 1.8 * 3.6) : Math.round(s.battery * 5000 / 1000 / Math.max(0.05, -s.amps) * 3600));
    val('system.battery.capacity', 'object', '{full_mah, design_mah, health}', () => ({ full_mah: 4620, design_mah: 5000, health: 0.924 }));
    val('system.battery.cycles', 'int', 'Charge cycles', () => 187);
    val('system.battery.saver', 'bool', 'Battery saver', () => s.saver, v => { s.saver = !!v; });

    /* ---- audio, haptics */
    val('system.audio.volume', 'float', 'Media volume', () => s.volume, v => { s.volume = clamp(v); s.muted = false; pub('system.audio.muted'); });
    val('system.audio.muted', 'bool', 'Muted', () => s.muted, v => { s.muted = !!v; });
    val('system.audio.mic_muted', 'bool', 'Mic muted', () => s.mic, v => { s.mic = !!v; });
    val('system.audio.output', 'string', 'speaker | headphones | bluetooth | usb | hdmi', () => s.bt.some(d => d.connected && d.type === 'audio') ? 'bluetooth' : 'speaker');
    act('system.audio.step', 'Nudge volume. {dir}', a => { s.volume = clamp(Math.round((s.volume + (a.dir < 0 ? -1 : 1) / 15) * 15) / 15); s.muted = false; pub('system.audio.volume', 'system.audio.muted'); return null; });
    val('system.haptics.available', 'bool', 'Has a motor', () => true);
    val('system.haptics.strength', 'float', 'UI feedback strength', () => s.haptics, v => { s.haptics = clamp(v); });
    act('system.haptics.tick', 'Short tap', () => { navigator.vibrate?.(Math.round(12 * s.haptics)); return null; });
    act('system.haptics.vibrate', '{ms, strength?} or {pattern}', a => { navigator.vibrate?.(a.pattern || a.ms || 60); return null; });

    /* ---- display */
    val('system.display.brightness', 'float', 'Brightness', () => s.brightness, v => { s.brightness = clamp(v); });
    val('system.display.auto_brightness', 'bool', 'Adaptive', () => s.autoBright, v => { s.autoBright = !!v; });
    val('system.display.sleep_after', 'int', 'Seconds', () => s.sleepAfter, v => { s.sleepAfter = Math.max(10, v | 0); });
    val('system.display.night_light', 'bool', 'Night Light', () => s.night, v => { s.night = !!v; });
    val('system.display.rotation_lock', 'bool', 'Auto-rotate off', () => s.rotLock, v => { s.rotLock = !!v; });
    val('system.display.refresh_rates', 'list', 'Hz', () => [60, 90, 120]);
    val('system.display.refresh_rate', 'int', 'Hz', () => s.hz, v => { s.hz = v | 0; });
    val('system.display.info', 'object', '{width, height, density, hdr}', () => ({ width: 720, height: 720, density: 320, hdr: false }));

    /* ---- performance */
    let freqs = [1800, 1800, 1800, 1800, 2400, 2400, 2400, 3000];
    val('system.performance.cpu_usage', 'float', 'CPU load', () => r3(s.cpu));
    val('system.performance.cpu_temp', 'float', '°C', () => Math.round((38 + s.cpu * 30 + (s.profile === 'max' ? 6 : 0) - ({ off: -4, auto: 0, cool: 3, max: 6 }[s.fan])) * 10) / 10);
    val('system.performance.gpu_usage', 'float', 'GPU load', () => r3(clamp(s.cpu * 0.8 + (s.running ? 0.4 : 0))));
    val('system.performance.cpu_freq', 'object', '{avg_mhz, max_mhz, cores}', () => ({ avg_mhz: Math.round(freqs.reduce((a, b) => a + b) / freqs.length), max_mhz: 3200, cores: freqs }));
    val('system.performance.memory', 'object', '{total, available, used, fraction}', () => { const t = 12e9, u = 5.1e9 + s.cpu * 1e9 + (s.running ? 1.4e9 : 0); return { total: t, available: t - u, used: u, fraction: r3(u / t) }; });
    val('system.performance.thermal', 'string', 'Thermal status', () => s.cpu > 0.85 ? 'moderate' : s.cpu > 0.6 ? 'light' : 'none');
    // Behaves like a GammaOS handheld, which has a fan and its own CPU profiles.
    val('system.performance.profiles', 'list', 'Profiles', () => ['powersave', 'stock', 'max']);
    val('system.performance.profile', 'string', 'One of system.performance.profiles', () => s.profile, v => { if (!['powersave', 'stock', 'max'].includes(v)) throw new Error('unknown profile ' + v); s.profile = v; });
    val('system.fan.available', 'bool', 'Has a controllable fan', () => true);
    val('system.fan.modes', 'list', 'Fan modes', () => ['auto', 'cool', 'max', 'off']);
    val('system.fan.mode', 'string', 'auto | cool | max | off', () => s.fan, v => { if (!['auto', 'cool', 'max', 'off'].includes(v)) throw new Error('unknown fan mode ' + v); s.fan = v; });
    val('system.fan.rpm', 'int', 'Fan RPM or null', () => s.fan === 'off' ? 0 : Math.round({ auto: 2200 + s.cpu * 2500, cool: 4200, max: 6000 }[s.fan] + Math.random() * 80));

    /* ---- sensors. The mouse position stands in for the gyroscope. */
    let tilt = { x: 0, y: 0 }, prevTilt = { x: 0, y: 0 }, t0 = performance.now();
    addEventListener('pointermove', e => { tilt.x = (e.clientX / innerWidth - 0.5) * 2; tilt.y = (e.clientY / innerHeight - 0.5) * 2; });
    val('sensors.available', 'object', 'Which sensors exist', () => ({ gyroscope: true, accelerometer: true, orientation: true, light: true }));
    evt('sensors.motion', '{gyro, accel, orientation}');
    evt('sensors.shake', '{strength}');
    val('sensors.rate', 'int', 'Hz', () => s.rate, v => { s.rate = Math.max(5, Math.min(60, v | 0)); });
    val('sensors.light', 'float', 'Lux', () => s.lux);
    act('sensors.recenter', 'Yaw 0 here', () => { s.yawZero = tilt.x * 45; return null; });
    addEventListener('keydown', e => { if (e.key === 'k' && watched('sensors')) emit('sensors.shake', { strength: 0.8 }); });
    (function stream() {
      if (watched('sensors.motion')) {
        const t = (performance.now() - t0) / 1000, dt = 1 / s.rate;
        const wob = Math.sin(t * 1.3) * 0.04;
        const pitch = tilt.y * 35 + wob * 20, roll = tilt.x * 35, yaw = tilt.x * 45 - s.yawZero;
        const gx = (tilt.y - prevTilt.y) * 0.6 / dt, gy = (tilt.x - prevTilt.x) * 0.6 / dt; prevTilt = { ...tilt };
        const rad = d => d * Math.PI / 180;
        emit('sensors.motion', {
          gyro: [r3(gx + wob), r3(gy), r3(wob / 2)],
          accel: [r3(9.81 * Math.sin(rad(roll))), r3(-9.81 * Math.sin(rad(pitch))), r3(9.81 * Math.cos(rad(pitch)) * Math.cos(rad(roll)))],
          orientation: { pitch: Math.round(pitch * 10) / 10, roll: Math.round(roll * 10) / 10, yaw: Math.round(yaw * 10) / 10 },
        });
      }
      setTimeout(stream, 1000 / s.rate);
    })();

    /* ---- toggles, device, power, home */
    val('system.notifications.dnd', 'bool', 'Do not disturb', () => s.dnd, v => { s.dnd = !!v; });
    val('system.flashlight.enabled', 'bool', 'Torch', () => s.torch, v => { s.torch = !!v; });
    val('system.time.format24', 'bool', '24-hour clock', () => false);
    val('system.time.zone', 'string', 'Time zone', () => Intl.DateTimeFormat().resolvedOptions().timeZone);
    act('system.display.screenshot', 'Save a screenshot', () => '/sdcard/Pictures/Screenshots/Warpdrive_' + Date.now() + '.png');
    val('system.device.info', 'object', 'Device info', () => ({ name: 'Warp Handheld', model: 'RP-Square', manufacturer: 'Mock', soc: 'SM8550', android: '14', sdk: 34, build: 'UQ1A.240205.004', security_patch: '2026-10-05', kernel: '5.15.123-android14', ram: 12e9, rooted: true }));
    val('system.device.storage', 'object', 'Internal storage', () => ({ total: 128e9, free: 71e9, used: 57e9, fraction: 0.445 }));
    val('system.device.volumes', 'list', 'Mounted storage', () => [
      { name: 'Internal shared storage', path: '/storage/emulated/0', removable: false, total: 128e9, free: 71e9, used: 57e9, fraction: 0.445 },
      { name: 'SD card', path: '/storage/1A2B-3C4D', removable: true, total: 256e9, free: 190e9, used: 66e9, fraction: 0.258 },
    ]);
    val('system.device.uptime', 'int', 'Seconds since boot', () => Math.round((Date.now() - now) / 1000) + 3600);
    for (const [p, d] of [['sleep', 'Screen off'], ['reboot', 'Restart'], ['recovery', 'Recovery'], ['bootloader', 'Bootloader'], ['shutdown', 'Power off']])
      act('system.power.' + p, d, () => { console.info('[warp-mock] power', p); return null; });
    val('system.home.default', 'bool', 'Is the home screen', () => s.home);
    act('system.home.request', 'Ask to be home', () => { s.home = true; later(600, () => pub('system.home.default')); return null; });

    /* ---- library */
    val('library.games', 'list', 'Installed games', () => [...s.games].sort((a, b) => Math.max(b.last_played || 0, b.installed) - Math.max(a.last_played || 0, a.installed)));
    val('library.running', 'string', 'Running game id', () => s.running);
    val('library.in_front', 'bool', 'Game on screen', () => s.inFront);
    act('library.install', 'Pick and install a game', () => {
      const g = { id: 'game_' + (s.games.length + 1), name: 'New Game ' + (s.games.length + 1), icon: null, url: '#', installed: Date.now(), last_played: null, play_time: 0 };
      s.games.push(g); pub('library.games'); return g;
    });
    act('library.remove', '{id}', a => { if (s.running === a.id) closeGame(); s.games = s.games.filter(g => g.id !== a.id); pub('library.games'); return null; });
    act('library.rename', '{id, name}', a => { const g = s.games.find(g => g.id === a.id); if (g) g.name = a.name; pub('library.games'); return null; });
    act('library.launch', '{id}', a => {
      const g = s.games.find(g => g.id === a.id); if (!g) throw new Error('no such game');
      closeGame(); s.running = g.id; g.last_played = Date.now(); showGame(g); pub('library.games'); return null;
    });
    act('library.suspend', 'Frontend over the game', () => { if (s.running && s.inFront) hideGame(); return null; });
    act('library.resume', 'Game back in front', () => { if (s.running) { const g = s.games.find(g => g.id === s.running); g && showGame(g); } return null; });
    act('library.close', 'Quit the game', () => { closeGame(); return null; });

    let layer = null;
    function count() { const g = s.games.find(g => g.id === s.running); if (g && s.since) g.play_time += Math.round((Date.now() - s.since) / 1000); s.since = 0; }
    function showGame(g) {
      if (!layer) {
        layer = document.createElement('div');
        layer.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:600 22px system-ui;gap:14px';
        layer.innerHTML = '<canvas width="360" height="360" style="width:min(70vmin,720px);border-radius:12px"></canvas><div></div><div style="opacity:.6;font-size:15px">Mock game. Esc or G for the guide.</div>';
        document.body.appendChild(layer);
        const c = layer.querySelector('canvas').getContext('2d'); let t = 0;
        (function loop() { if (!layer) return; t += 0.03; c.fillStyle = `hsl(${(t * 40) % 360} 70% 12%)`; c.fillRect(0, 0, 360, 360);
          for (let i = 0; i < 40; i++) { c.fillStyle = `hsla(${(i * 9 + t * 60) % 360} 90% 65% / .8)`; c.beginPath(); c.arc(180 + Math.cos(t + i) * (50 + i * 3), 180 + Math.sin(t * 1.3 + i) * (40 + i * 3), 6, 0, 7); c.fill(); }
          requestAnimationFrame(loop); })();
      }
      layer.children[1].textContent = g.name;
      layer.style.display = 'flex'; s.inFront = true; s.since = Date.now(); pub('library.running', 'library.in_front');
    }
    function hideGame() { count(); if (layer) layer.style.display = 'none'; s.inFront = false; pub('library.running', 'library.in_front'); }
    function closeGame() { if (s.inFront) count(); if (layer) { layer.remove(); layer = null; } s.running = null; s.inFront = false; pub('library.running', 'library.in_front', 'library.games'); }
    addEventListener('keydown', e => {
      if (s.inFront && (e.key === 'Escape' || e.key === 'g')) { e.stopImmediatePropagation(); e.preventDefault(); hideGame(); emit('input.button', { button: 'guide', pressed: true, repeat: false }); emit('input.button', { button: 'guide', pressed: false, repeat: false }); }
      else if (s.inFront) e.stopImmediatePropagation();
    }, true);

    /* ---- apps, input, shell */
    val('apps.list', 'list', 'Launchable apps', () => s.apps);
    act('apps.launch', '{package}', a => { console.info('[warp-mock] launch', a.package); return null; });
    act('apps.uninstall', '{package}', a => { s.apps = s.apps.filter(x => x.package !== a.package); pub('apps.list'); return null; });
    act('apps.force_stop', '{package}', () => null);
    act('apps.details', '{package}', () => null);
    evt('input.button', '{button, pressed, repeat}');
    evt('input.stick', '{lx, ly, rx, ry, lt, rt}');
    val('input.gamepads', 'list', 'Controllers', () => s.pads);
    act('input.rumble', '{ms?, strength?, id?}', a => { navigator.vibrate?.(a.ms || 200); return null; });
    // Moving the mouse with a button held sends stick values.
    addEventListener('pointermove', e => { if (watched('input.stick') && e.buttons) emit('input.stick', { lx: r3(tilt.x), ly: r3(tilt.y), rx: 0, ry: 0, lt: 0, rt: e.buttons & 2 ? 1 : 0 }); });

    const fe = () => s.frontends.find(f => f.id === s.frontend) || null;
    val('shell.frontend.installed', 'bool', 'A frontend is active', () => !!fe());
    val('shell.frontend.info', 'object', 'Active frontend', () => fe());
    val('shell.frontend.list', 'list', 'Installed frontends', () => s.frontends.map(f => ({ ...f, active: f.id === s.frontend })));
    act('shell.frontend.pick', 'Pick a .zip', () => { console.info('[warp-mock] the zip picker only exists on the console'); return false; });
    act('shell.frontend.activate', '{id}', a => { s.frontend = a.id; pub('shell.frontend.list', 'shell.frontend.info'); return null; });
    act('shell.frontend.remove', '{id?}', a => { const id = a.id || s.frontend; s.frontends = s.frontends.filter(f => f.id !== id); if (id === s.frontend) s.frontend = null; pub('shell.frontend.list', 'shell.frontend.info', 'shell.frontend.installed'); return null; });
    act('shell.frontend.reload', 'Reload', () => { later(100, () => location.reload()); return null; });
    act('shell.frontend.picker', 'Show the picker', () => { console.info('[warp-mock] picker'); return null; });
    val('shell.version', 'string', 'Backend version', () => 'mock');
    val('shell.api', 'int', 'API version', () => 2);
    val('shell.points', 'list', 'Every point', () => list());
    let log = '';
    val('shell.log', 'string', 'The log', () => log);
    act('shell.report', '{source?, message}', a => { log += `${new Date().toISOString().slice(5, 19)} [${a.source || 'frontend'}] ${a.message}\n`; return null; });
    act('shell.log_clear', 'Empty the log', () => { log = ''; pub('shell.log'); return null; });

    // Change values over time so the UI has something to show.
    setInterval(() => {
      if (conn()) { s.rssi = Math.round(Math.max(-80, Math.min(-45, s.rssi + (Math.random() - 0.5) * 4))); pub('system.wifi.strength', 'system.wifi.rssi'); if (watched('system.wifi.details')) pub('system.wifi.details'); }
      s.battery = clamp(s.battery + (s.charging ? 0.003 : -0.0012));
      if (s.battery < 0.15) s.charging = true; if (s.battery > 0.98) s.charging = false;
      s.cpu = clamp(s.cpu * 0.7 + (0.08 + Math.random() * 0.25 + (s.running ? 0.35 : 0) + (s.profile === 'max' ? 0.05 : 0)) * 0.3);
      freqs = freqs.map((f, i) => Math.round((i < 4 ? 1200 : 1800) + s.cpu * (i < 4 ? 800 : 1400) + Math.random() * 200));
      s.amps = r3(s.charging ? 1.8 : -(0.35 + s.cpu * 1.4 + s.brightness * 0.3));
      s.lux = Math.round(200 + Math.sin(Date.now() / 7000) * 120);
      pub('system.battery.level', 'system.battery.charging', 'system.battery.status', 'system.battery.plugged');
      if (watched('system.battery')) pub('system.battery.current', 'system.battery.power', 'system.battery.time_remaining', 'system.battery.temperature', 'system.battery.voltage');
      if (watched('system.performance')) pub('system.performance.cpu_usage', 'system.performance.cpu_temp', 'system.performance.gpu_usage', 'system.performance.cpu_freq', 'system.performance.memory', 'system.performance.thermal');
      if (watched('sensors')) pub('sensors.light');
      if (watched('system.fan')) pub('system.fan.rpm');
    }, 1500);

    function list() { return Object.values(P).map(p => ({ path: p.path, kind: p.kind, doc: p.doc, readable: !!p.get, writable: !!p.set })); }

    return {
      request(path, op, arg) {
        return new Promise((resolve, reject) => setTimeout(() => {
          try {
            const p = P[path]; if (!p) throw fail('no_point', 'No such point: ' + path);
            let out;
            if (op === 'get') { if (!p.get) throw fail('not_readable', path + " can't be read"); out = p.get(); }
            else if (op === 'set' || op === 'toggle') {
              if (!p.set) throw fail('not_writable', path + " can't be set");
              if (op === 'toggle' && typeof p.get() !== 'boolean') throw fail('not_bool', path + " isn't a bool");
              p.set(op === 'toggle' ? !p.get() : arg); out = p.get(); emit(path, clone(out));
            } else if (op === 'call') { if (!p.call) throw fail('not_action', path + " isn't an action"); out = p.call(arg || {}); }
            else throw fail('bad_op', 'Unknown operation: ' + op);
            resolve(clone(out));
          } catch (e) { reject(e instanceof warp.WarpError ? e : fail('failed', e.message || String(e))); }
          function fail(code, msg) { return new warp.WarpError(code, msg, path); }
        }, 6 + Math.random() * 18));
      },
      points: () => Promise.resolve(list()),
      subscribe(pattern, delta) { const n = (subs.get(pattern) || 0) + delta; if (n > 0) subs.set(pattern, n); else subs.delete(pattern); },
    };
  }

  if (window.warp._attachMock(createMock)) console.info('[warp-mock] no console found, using fake data');
})();
