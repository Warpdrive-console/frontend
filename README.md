# Warpdrive SDK

> **This checkout:** the Nova frontend has been ported to Preact + Vite in
> [`src/`](./src), with its build and API settings in [`BUILDING.md`](./BUILDING.md)
> and [`config.json`](./config.json). The SDK documentation below still applies.

Warpdrive turns an Android handheld into a console. The backend app runs your frontend, a website in a zip, full screen, and gives it control of the device through **warp.js**: Wi-Fi, Bluetooth, battery, audio, display, performance, fans, sensors, controllers, games, apps and power.

This guide covers everything a frontend can do. Nova, the open-source frontend in [`src/`](./src), uses every part of the SDK and is the best place to see it in a full interface.

**Library 2.0** · **API 2** · Call `await warp.points()` on a console for the full list.

---

- [Quick start](#quick-start)
- [The files](#the-files)
- [Points](#points)
- [API](#api)
- [Errors](#errors)
- [Controllers and input](#controllers-and-input)
- [Wi-Fi](#wi-fi)
- [Bluetooth](#bluetooth)
- [Network](#network)
- [Battery](#battery)
- [Audio and haptics](#audio-and-haptics)
- [Display](#display)
- [Performance and fan](#performance-and-fan)
- [Motion sensors](#motion-sensors)
- [Games](#games)
- [Android apps](#android-apps)
- [Device, storage and power](#device-storage-and-power)
- [Frontends and logging](#frontends-and-logging)
- [warp-ui.js](#warp-uijs)
- [TypeScript](#typescript)
- [Using a framework](#using-a-framework)
- [Packaging a frontend](#packaging-a-frontend)
- [Developing on a desktop](#developing-on-a-desktop)
- [Adding a point to the backend](#adding-a-point-to-the-backend)
- [Versions](#versions)

---

## Quick start

```html
<!doctype html>
<html>
<body>
  <p>Battery: <b id="battery"></b></p>
  <button id="wifi">Wi-Fi</button>

  <script src="/warp.js"></script>
  <script src="/warp-mock.js"></script>
  <script>
    warp.watch('system.battery.level', level => {
      document.getElementById('battery').textContent = Math.round(level * 100) + '%';
    });

    document.getElementById('wifi').onclick = () => warp.toggle('system.wifi.enabled');

    warp.on('input.button', e => {
      if (e.pressed && e.button === 'a') document.activeElement.click();
    });
  </script>
</body>
</html>
```

Save it as `index.html`, zip it, and install the zip from the frontend picker on the console.

## The files

| File | Needed | What it is |
|---|---|---|
| `warp.js` | Yes | The library. |
| `warp-ui.js` | No | Connects HTML elements to points with `data-warp-*` attributes, without writing code. |
| `warp-mock.js` | No | A fake console with made-up data, for building in a desktop browser. |
| `warp.d.ts` | No | TypeScript types for the library and every point. |

On the console, the backend serves `/warp.js` and `/warp-ui.js` itself, so your frontend always gets the version that matches the backend. It serves `/warp-mock.js` as an empty file, so you can leave that script tag in.

Load them in this order:

```html
<script src="/warp.js"></script>
<script src="/warp-ui.js"></script>
<script src="/warp-mock.js"></script>
```

## Points

Everything the console can do is a **point** with a name like `system.wifi.strength`. There are three kinds.

| Kind | What you do with it | Example |
|---|---|---|
| **Value** | Read it, watch it for changes, and set it if it's writable | `system.audio.volume` |
| **Action** | Call it with arguments. It may return a result. | `system.wifi.connect` |
| **Event** | Listen to it. The console pushes it to you. | `input.button` |

Values have a type: `bool`, `int`, `float`, `string`, `list` or `object`. A value can be `null` when the device doesn't have the hardware, for example `system.fan.mode` on a console without a fan.

**Units are the same everywhere:**

| Measure | Unit |
|---|---|
| Levels, strengths, loads, volume, brightness | 0.0 to 1.0 |
| Temperature | °C |
| Power | watts |
| Durations | seconds |
| Sizes | bytes |
| Timestamps | milliseconds since 1970, like `Date.now()` |

`await warp.points()` lists every point with its type, what you can do with it, and its arguments.

## API

### Reading and changing values

```js
const level = await warp.get('system.battery.level');      // 0.76
await warp.set('system.display.brightness', 0.5);
const on = await warp.toggle('system.wifi.enabled');       // resolves with the new value
```

`set` and `toggle` resolve with the new value once the console has applied it.

### Watching values

```js
const stop = warp.watch('system.wifi.strength', strength => {
  bars.style.width = strength * 100 + '%';
});

stop();   // when the screen closes
```

`watch` calls your function once straight away with the current value, then again on every change. It returns a function that stops it.

**Only watch what's on screen.** Some data costs battery to collect, like sensors, CPU stats, battery current, cellular signal and Wi-Fi details. The backend only collects it while something is watching it, so call the stop function when a screen closes.

### Listening for changes and events

```js
warp.on('input.button', e => { /* every button press */ });

warp.on('system.bluetooth.*', (value, path) => {
  console.log(path, 'changed to', value);
});
```

`on` is like `watch` without the first call. It's for events, and for reacting to changes only. A pattern ending in `*` matches every point under it.

### Running actions

```js
await warp.call('system.wifi.connect', { ssid: 'Home', password: 'hunter22' });
const path = await warp.call('system.display.screenshot');
```

### Everything else

| | |
|---|---|
| `warp.peek(path)` | The last value seen for a point, without asking the console. `undefined` if it hasn't been seen yet. |
| `warp.points()` | Every point the backend has: `[{path, kind, doc, readable, writable}]`. |
| `warp.has(path)` | Whether this backend has a point. Use it for hardware or features only some consoles have. |
| `warp.info()` | `{library, api, backend, backendApi, native}`: versions, and whether this is a real console. |
| `warp.ready` | A promise that resolves when a backend is available. It rejects if the page loads with neither the console nor the mock. |
| `warp.keyboard(on, map)` | Turns keyboard keys into `input.button` events. See [Keyboards](#keyboards). |
| `warp.native` | `true` on a console. |
| `warp.mock` | `true` when running on `warp-mock.js`. |
| `warp.version`, `warp.api` | The library version and the API version it speaks. |

## Errors

When something fails, the promise rejects with a `WarpError`. Its `code` says why, and its `message` gives details.

| Code | Meaning |
|---|---|
| `no_point` | The backend has no point with that name. |
| `not_readable` | You called `get` on an action or event. |
| `not_writable` | You called `set` on a read-only value. |
| `not_bool` | You called `toggle` on something that isn't a bool. |
| `not_action` | You called `call` on something that isn't an action. |
| `bad_args` | An argument is missing or has the wrong type. |
| `failed` | The console tried and couldn't, like a wrong Wi-Fi password or a device with no flash. |
| `no_backend` | There's no console and no mock. |

```js
try {
  await warp.call('system.wifi.connect', { ssid, password });
} catch (e) {
  if (e.code === 'failed') showMessage("Couldn't connect: " + e.message);
  else throw e;
}
```

## Controllers and input

### Buttons

Every press on the built-in controls, a Bluetooth or USB controller, or a TV remote arrives as one event.

```js
warp.on('input.button', e => {
  // e.button:  a b x y l1 r1 l2 r2 l3 r3 start select guide up down left right
  // e.pressed: true when pressed, false when released
  // e.repeat:  true for repeats while the button is held
  if (!e.pressed) return;
  if (e.button === 'b' && !e.repeat) goBack();
});
```

The left stick and the D-pad both send `up`, `down`, `left` and `right`. Holding a button repeats it after 0.42 seconds, about 11 times a second. Check `e.repeat` for buttons that shouldn't repeat, like A and B.

> [!NOTE]
> While a game is running, Guide brings your frontend back over the game. See [Games](#games).

### Sticks and triggers

```js
const stop = warp.on('input.stick', s => {
  // lx, ly, rx, ry: -1.0 to 1.0     lt, rt: 0.0 to 1.0
  page.scrollTop += s.ry * 20;
});
```

Stick updates are only sent while something listens. Small movements near the centre count as zero, and updates are capped at about 30 a second.

### Controllers, rumble and vibration

```js
const pads = await warp.get('input.gamepads');
// [{id, name, builtin, vendor, product, rumble}]

await warp.call('input.rumble', { ms: 200, strength: 0.8 });   // all controllers
await warp.call('input.rumble', { ms: 200, id: pads[1].id });  // one controller
```

If a controller can't rumble, the console's own vibration motor is used.

### Keyboards

Keyboards don't send `input.button` unless you turn it on. This is mostly for testing on a desktop.

```js
warp.keyboard(true);
```

| Key | Button |
|---|---|
| Arrow keys | up, down, left, right |
| Enter | a |
| Escape, Backspace | b |
| X, Y | x, y |
| Q, E | l1, r1 |
| Tab | select |
| M | start |
| G | guide |

Add or change keys with a second argument: `warp.keyboard(true, { ' ': 'a' })`. It's merged with the table above.

Keys typed into a text field are never turned into buttons. Neither are keys you've already handled and called `preventDefault()` on.

## Wi-Fi

```js
warp.watch('system.wifi.connection_status', s => { /* off, disconnected, connecting, connected */ });
warp.watch('system.wifi.ssid', name => { /* the current network, or null */ });
warp.watch('system.wifi.strength', s => { /* 0 to 1 */ });

await warp.set('system.wifi.enabled', true);
```

**A network list:**

```js
const stop = warp.watch('system.wifi.networks', networks => {
  // strongest first:
  // [{ssid, strength, secure, security, saved, connected, band, channel, frequency, rssi, bssid}]
  render(networks);
});
await warp.call('system.wifi.scan');   // the list updates when the scan finishes
```

**Connecting:**

```js
await warp.call('system.wifi.connect', { ssid: 'Home', password: 'hunter22' });
await warp.call('system.wifi.connect', { ssid: 'Home' });   // saved networks need no password
await warp.call('system.wifi.connect', { ssid: 'Hidden', password: '...', hidden: true, security: 'wpa2' });
await warp.call('system.wifi.disconnect');
await warp.call('system.wifi.forget', { ssid: 'Old network' });
```

**Details of the current connection**, like IP, gateway, DNS, link speed, band and channel:

```js
warp.watch('system.wifi.details', d => d && show(d.ip, d.link_mbps, d.band));
```

**Hotspot:**

```js
await warp.set('system.wifi.hotspot_config', { ssid: 'My Console', password: 'longpassword', band: '5' });
await warp.set('system.wifi.hotspot', true);
```

## Bluetooth

```js
warp.watch('system.bluetooth.devices', devices => {
  // paired first, then nearby:
  // [{address, name, type, paired, connected, busy, strength, battery, profiles}]
  // type: gamepad, audio, input, phone, computer, wearable or device
  render(devices);
});

await warp.set('system.bluetooth.enabled', true);
await warp.call('system.bluetooth.scan');                          // about 12 seconds
await warp.call('system.bluetooth.pair', { address });             // pairs, then connects
await warp.call('system.bluetooth.connect', { address });
await warp.call('system.bluetooth.disconnect', { address });
await warp.call('system.bluetooth.unpair', { address });
await warp.call('system.bluetooth.rename', { address, name: 'Player 2' });
```

`battery` is the device's charge from 0 to 1, for devices that report it, like most controllers and headphones. `busy` is true while it's pairing or connecting.

The console's own Bluetooth settings are `system.bluetooth.name` and `system.bluetooth.discoverable`.

## Network

```js
warp.watch('system.network.online', online => { /* has internet */ });
warp.watch('system.network.type', type => { /* wifi, cellular, ethernet, vpn or none */ });

await warp.toggle('system.network.airplane');
await warp.toggle('system.network.mobile_data');
await warp.toggle('system.network.location');
```

On consoles with a SIM, `system.network.cellular` gives the carrier, network type and signal strength.

## Battery

```js
warp.watch('system.battery.level', level => { /* 0 to 1 */ });
warp.watch('system.battery.charging', charging => { });
warp.watch('system.battery.time_remaining', s => { /* seconds to empty, or to full when charging */ });

await warp.toggle('system.battery.saver');
```

For a detailed battery screen there are also `temperature`, `voltage`, `current` (amps, negative while discharging), `power` (watts), `health`, `cycles`, `plugged` and `capacity` (`{full_mah, design_mah, health}`), all under `system.battery`.

## Audio and haptics

```js
await warp.set('system.audio.volume', 0.6);
await warp.call('system.audio.step', { dir: 1 });   // one notch up, like a volume key
await warp.toggle('system.audio.muted');
await warp.toggle('system.audio.mic_muted');

warp.watch('system.audio.output', out => { /* speaker, headphones, bluetooth, usb or hdmi */ });
```

**Vibration:**

```js
await warp.call('system.haptics.tick');                                   // a short tap for menu moves
await warp.call('system.haptics.vibrate', { ms: 300, strength: 0.6 });
await warp.call('system.haptics.vibrate', { pattern: [100, 80, 100] });   // on, off, on
await warp.set('system.haptics.strength', 0.5);                           // the user's tick strength
```

`tick` uses the strength the user chose, and does nothing when it's 0. Use it for interface feedback so that one setting controls all of it.

## Display

```js
await warp.set('system.display.brightness', 0.7);
await warp.toggle('system.display.auto_brightness');
await warp.toggle('system.display.night_light');
await warp.toggle('system.display.rotation_lock');
await warp.set('system.display.sleep_after', 120);   // seconds

const rates = await warp.get('system.display.refresh_rates');   // [60, 90, 120]
await warp.set('system.display.refresh_rate', 120);

const shot = await warp.call('system.display.screenshot');      // the saved file's path
```

`system.display.info` has the resolution, density and HDR support.

## Performance and fan

```js
const profiles = await warp.get('system.performance.profiles');   // like ['stock', 'powersave', 'max']
await warp.set('system.performance.profile', 'powersave');

if (await warp.get('system.fan.available')) {
  const modes = await warp.get('system.fan.modes');               // ['auto', 'cool', 'max', 'off']
  await warp.set('system.fan.mode', 'cool');
  warp.watch('system.fan.rpm', rpm => { });
}
```

Live stats, collected only while watched:

| Point | Value |
|---|---|
| `system.performance.cpu_usage` | 0 to 1 |
| `system.performance.cpu_temp` | °C |
| `system.performance.gpu_usage` | 0 to 1 |
| `system.performance.cpu_freq` | `{avg_mhz, max_mhz, cores: [mhz, ...]}` |
| `system.performance.memory` | `{total, available, used, fraction}` in bytes |
| `system.performance.thermal` | none, light, moderate, severe, critical, emergency or shutdown |

## Motion sensors

```js
const has = await warp.get('sensors.available');   // {gyroscope, accelerometer, orientation, light}

await warp.set('sensors.rate', 30);                // 5 to 60 updates a second
const stop = warp.on('sensors.motion', m => {
  // m.gyro:        [x, y, z] in radians per second
  // m.accel:       [x, y, z] in m/s²
  // m.orientation: {pitch, roll, yaw} in degrees
  ship.rotation = m.orientation.roll;
});

await warp.call('sensors.recenter');               // make the current heading yaw 0
warp.on('sensors.shake', e => shuffle(e.strength));
warp.watch('sensors.light', lux => { });
```

The sensors only run while something listens to or watches a `sensors` point. Stop listening when you're done to save battery.

## Games

A game is a website in a zip with an `index.html`. Games run full screen in their own window and don't get `warp.js`, so a game can't change the console's settings.

```js
warp.watch('library.games', games => {
  // most recently played first:
  // [{id, name, icon, url, installed, last_played, play_time}]
  // play_time is in seconds. icon is a URL you can use in <img>, or null.
  render(games);
});

await warp.call('library.launch', { id });
const game = await warp.call('library.install');   // asks the user for a zip; null if they cancel
await warp.call('library.rename', { id, name: 'New name' });
await warp.call('library.remove', { id });
```

**While a game runs:**

- Pressing Guide shows your frontend over the game, with the game paused in the background.
- `library.running` is the running game's id, and `library.in_front` says whether it's on screen.
- `library.resume` puts the game back in front, and `library.close` quits it.

```js
warp.watch('library.in_front', inGame => document.body.classList.toggle('over-game', !inGame && !!warp.peek('library.running')));

resumeButton.onclick = () => warp.call('library.resume');
quitButton.onclick = () => warp.call('library.close');
```

A game can name itself and set its cover with a `game.json` at the root of its zip:

```json
{ "name": "Starfall", "icon": "cover.png" }
```

## Android apps

```js
const apps = await warp.get('apps.list');
// [{package, name, icon, version, system}]   icon is a URL

await warp.call('apps.launch', { package: 'com.android.chrome' });
await warp.call('apps.details', { package });       // Android's app info screen
await warp.call('apps.force_stop', { package });
await warp.call('apps.uninstall', { package });     // no confirmation, so ask first
```

## Device, storage and power

```js
const info = await warp.get('system.device.info');        // {name, model, manufacturer, soc, android, ram, rooted, ...}
const disk = await warp.get('system.device.storage');     // {total, free, used, fraction} in bytes
const all = await warp.get('system.device.volumes');      // internal storage, SD cards and USB drives
const up = await warp.get('system.device.uptime');        // seconds

await warp.toggle('system.notifications.dnd');
await warp.toggle('system.flashlight.enabled');           // null when there's no flash

const is24h = await warp.get('system.time.format24');
const zone = await warp.get('system.time.zone');
```

**Power:**

```js
await warp.call('system.power.sleep');        // screen off
await warp.call('system.power.reboot');
await warp.call('system.power.shutdown');
await warp.call('system.power.recovery');
await warp.call('system.power.bootloader');
```

**Home screen.** To open when the console is turned on, Warpdrive has to be Android's home app:

```js
if (!(await warp.get('system.home.default'))) await warp.call('system.home.request');
```

## Frontends and logging

A console can have several frontends installed. Yours can manage them:

```js
const list = await warp.get('shell.frontend.list');    // [{id, name, version, author, installed, active}]
const me = await warp.get('shell.frontend.info');      // the active frontend

await warp.call('shell.frontend.activate', { id });
await warp.call('shell.frontend.pick');                 // asks for a zip, installs it and switches to it
await warp.call('shell.frontend.remove', { id });
await warp.call('shell.frontend.reload');
await warp.call('shell.frontend.picker');               // the backend's own picker
```

Holding Select or Back while Warpdrive starts always opens the picker, so a broken frontend can't lock anyone out.

**The log.** The backend keeps a log of crashes, its own errors, and anything frontends report. Send your errors there so they can be found later:

```js
addEventListener('error', e => warp.call('shell.report', { source: 'myfrontend', message: e.message }));

const text = await warp.get('shell.log');   // the last 64 KB
await warp.call('shell.log_clear');
```

## warp-ui.js

For simple screens you don't need to write code. Load `warp-ui.js`, add attributes, and call `warpUI.bind()`:

```html
<p>Battery <span data-warp-text="system.battery.level" data-warp-format="percent"></span></p>
<p>Network <span data-warp-text="system.wifi.ssid" data-warp-empty="Not connected"></span></p>

<button data-warp-toggle="system.wifi.enabled">Wi-Fi</button>
<input type="range" data-warp-value="system.audio.volume">
<select data-warp-value="system.performance.profile">
  <option>stock</option><option>powersave</option><option>max</option>
</select>
<button data-warp-call="system.wifi.scan">Scan</button>
<button data-warp-call="system.haptics.vibrate" data-warp-args='{"ms": 200}'>Buzz</button>

<div data-warp-show="system.network.online">Online</div>
<div class="bar" data-warp-meter="system.wifi.strength"></div>

<script src="/warp.js"></script>
<script src="/warp-ui.js"></script>
<script>warpUI.bind();</script>
```

| Attribute | Does |
|---|---|
| `data-warp-text` | Shows the value as text. |
| `data-warp-format` | `raw`, `percent`, `int`, `fixed1`, `onoff`, `yesno` or `list`. Add your own to `warpUI.formats`. |
| `data-warp-empty` | Text to show when the value is null. |
| `data-warp-toggle` | Sets `aria-checked` from a bool and toggles it on click. |
| `data-warp-value` | Two-way binding for `<input>` and `<select>`. Range inputs go from 0 to 1 unless you set `min` and `max`. |
| `data-warp-call` | Runs an action on click, with arguments from `data-warp-args` as JSON. Sets `aria-busy` while it runs. |
| `data-warp-show` | Hides the element when the value is false, 0, null or an empty string. |
| `data-warp-meter` | Sets the CSS variable `--warp-value` to the number, for bars and gauges. |

`path:field` reads one field of an object, like `system.wifi.details:ip`.

`warpUI.bind(element)` only binds inside that element, and returns a function that unbinds it. Use that for screens that open and close:

```js
const unbind = warpUI.bind(settingsScreen);
// later
unbind();
```

Style toggles with `[aria-checked="true"]` and meters with `var(--warp-value)`:

```css
.bar::after { content: ''; display: block; height: 100%; width: calc(var(--warp-value) * 100%); background: dodgerblue; }
```

## TypeScript

Add `warp.d.ts` to your project. It declares the global `warp` and `warpUI`, with every point and its type:

```ts
const networks = await warp.get('system.wifi.networks');   // WifiNetwork[]
networks[0].ssid;

await warp.set('system.battery.level', 1);    // error: read only
await warp.get('system.wifi.strenght');       // error: no such point
```

In plain JavaScript, editors like VS Code use the same file for autocomplete. Put `/// <reference path="./warp.d.ts" />` at the top of your script, or add `// @ts-check` to also get errors for wrong point names.

The types and POINTS.md are generated from the backend source, so they always match.

## Using a framework

Any framework that builds to static files works, like React, Vue, Svelte, Solid or Preact. Four rules:

1. Load `warp.js` with a `<script>` tag in `index.html`, not with `import`, so the console's own copy is used. Use the global `warp` in your code.
2. Use hash routing (`#/settings`) or a single page. The console doesn't send `index.html` for unknown paths.
3. Bundle your fonts and images. Files from a CDN won't load when the console is offline.
4. Put `warp.js` and `warp-mock.js` in your `public/` folder for development.

`watch` and `on` return a stop function, which fits how frameworks clean up:

**React**

```jsx
function usePoint(path) {
  const [value, setValue] = useState(() => warp.peek(path));
  useEffect(() => warp.watch(path, setValue), [path]);
  return value;
}

function Battery() {
  const level = usePoint('system.battery.level');
  return <span>{Math.round((level ?? 0) * 100)}%</span>;
}
```

**Vue**

```js
import { ref, onMounted, onUnmounted } from 'vue';

export function usePoint(path) {
  const value = ref(warp.peek(path));
  let stop;
  onMounted(() => { stop = warp.watch(path, v => (value.value = v)); });
  onUnmounted(() => stop?.());
  return value;
}
```

**Svelte**

```js
import { readable } from 'svelte/store';

export const point = path => readable(warp.peek(path), set => warp.watch(path, set));
```

```svelte
<script>
  import { point } from './warp';
  const volume = point('system.audio.volume');
</script>

<p>Volume {Math.round($volume * 100)}%</p>
```

## Packaging a frontend

A frontend is a zip of a website:

```
my-frontend.zip
├── index.html
├── warp.json
└── ...
```

`index.html` can be at the top of the zip or inside one folder. `warp.json` is optional and names your frontend in the picker:

```json
{ "name": "My Frontend", "version": "1.0", "author": "Your name" }
```

Install it from the picker, or from another frontend with `shell.frontend.pick`.

**Designing for the console:**

- The screen is square and small. Use large text and large targets.
- Most people use a controller. Make every control reachable with the D-pad, show which item is selected, and don't rely on hover.
- Sound and vibration on selection make a big difference. Use `system.haptics.tick` for the vibration.
- Only watch what's on screen, and stop watching when a screen closes.

## Developing on a desktop

With `warp-mock.js` loaded, your frontend runs in any browser with a fake console. It has Wi-Fi networks that connect, Bluetooth devices that pair, a draining battery, games, apps, moving sensor data and changing CPU stats. Wrong Wi-Fi passwords fail the way they do on a console, so you can test your error handling.

Serve the folder with any static server:

```
python3 -m http.server 8080
```

Or on Windows, use **warpserve** from `tools/warpserve`. It serves a zip straight away and opens it in a square window, and it has the SDK files built in, so your zip doesn't need its own copies.

```
warpserve my-frontend.zip
warpserve -size 1280x720 my-frontend.zip
```

Rebuild the zip and refresh the window to see changes.

On the console, `warp-mock.js` is an empty file and the real backend is used.

## Adding a point to the backend

Points are registered in Kotlin, in the feature classes under `backend/app/src/main/java/com/warpdrive/launcher/features/`. Each feature registers its points in `points()`.

**A value:**

```kotlin
w.value("system.display.dark_mode", "bool", "System dark theme",
    get = { (host.context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES },
    set = { v -> Root.sh("cmd uimode night ${if (v.bool()) "yes" else "no"}") })
```

Leave out `set` for a read-only value. `v.bool()`, `v.num()` and `v.str()` convert whatever the frontend sent.

**An action:**

```kotlin
w.action("system.audio.beep", "Play a short beep. {ms?}") { a ->
    val ms = a.optInt("ms", 150)
    ToneGenerator(AudioManager.STREAM_MUSIC, 80).startTone(ToneGenerator.TONE_PROP_BEEP, ms)
    null
}
```

Arguments arrive as a `JSONObject`. Whatever you return is sent back to `call`.

**An event:**

```kotlin
w.event("system.display.folded", "{folded} when the screen folds or unfolds")
// whenever it happens:
warp.fire("system.display.folded", JSONObject().put("folded", true))
```

**Sending changes.** When a value changes, call `warp.publish("path")`. The backend reads it again and sends it to the frontend if it's different.

**Live data.** For data that has to be polled, use `poll`. It only runs while the frontend is watching:

```kotlin
poll(1000, "system.performance") { warp.publish("system.performance.cpu_usage") }
```

**Errors.** Throw an exception to fail. `IllegalArgumentException` reaches the frontend as `bad_args`, and anything else as `failed` with your message:

```kotlin
if (torchId == null) throw IllegalStateException("no flash")
```

**Root.** `Root.sh("command")` runs a command as root in a shell that stays open, so it's fast enough to call often.

**After adding points:**

1. Add the point to `sdk/warp-mock.js` so desktop development keeps working.
2. Run `python3 tools/gen-docs.py` to update POINTS.md and `warp.d.ts`.

Keep paths lowercase and grouped, like `area.thing.detail`. Use the units above, and return `null` when the hardware isn't there rather than failing.

## Versions

`warp.api` is the API version the library speaks, and the backend reports its own as `shell.api`. They match within a major version of the library.

```js
const { library, backend, backendApi, native } = await warp.info();
```

For features only some consoles have, check with `has` instead of the version:

```js
if (await warp.has('system.fan.mode')) showFanSettings();
```

### Changes in 2.0

- The keyboard is off until you call `warp.keyboard()`. 1.x turned it on as soon as it loaded.
- The mock is a separate file and only runs when you load it. 1.x used fake data whenever there was no console.
- Errors have codes.
- `watch` calls back exactly once at the start.
- `ready` waits for a backend, not just for the page.
- New: `has`, `info`, `warp-ui.js` and types for every point.
- Renamed points:
  - `system.dnd` is now `system.notifications.dnd`
  - `system.flashlight` is now `system.flashlight.enabled`
  - `system.screenshot` is now `system.display.screenshot`
