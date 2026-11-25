# Nova

The default frontend for Warpdrive. Nova is the home screen, game library, settings, friends list and messages on a Warpdrive console. It's built for a square screen and a controller, in plain HTML, CSS and JavaScript with no build step.

**Version 3.3** · Needs a Warpdrive backend with API 2 or later.

- [Features](#features)
- [Controls](#controls)
- [Installing](#installing)
- [Developing](#developing)
- [Project layout](#project-layout)
- [How Nova works](#how-nova-works)
- [Common changes](#common-changes)
- [Accounts and messages](#accounts-and-messages)
- [Stored data](#stored-data)
- [Troubleshooting](#troubleshooting)
- [Licenses](#licenses)

## Features

- **Home:** recently played games in a scrolling row, with play time and last played, and a dock for Apps, Friends, Messages and Settings.
- **Apps:** every Android app installed on the console, in a grid.
- **Quick menu:** toggles for Wi-Fi, Bluetooth, airplane mode, mobile data, Do Not Disturb, flashlight, rotation lock and night light, plus brightness, volume, performance and fan mode. It opens over games too.
- **Settings:** Account, Wi-Fi (with saved networks and hotspot), Bluetooth, Network, Battery, Display, Sound, Performance, Motion sensors, Controllers, Storage, Theme and System.
- **Friends:** a Rotur account linked with a QR code, friends with online status, and friend requests.
- **Messages:** direct messages over OriginChats with full history, offline caching, signed messages, and optional end-to-end encryption.
- **On-screen keyboard:** made for a controller, with shortcuts on the face and shoulder buttons. It never opens Android's own keyboard.
- **Themes:** dark and light, eight accent colours, sounds on or off, and reduced motion.

## Controls

| Button | Action |
|---|---|
| D-pad / left stick | Move the cursor |
| A | Select |
| B | Back |
| X | Game options (on a game) |
| L1 / R1 | Switch tabs, or switch chats in Messages |
| L2 / R2 | Scroll a page at a time |
| Right stick | Scroll freely |
| Start | Open or close Settings |
| Select / Guide | Open or close the quick menu |

While a slider is selected, left and right change its value in steps of 5%.

### On-screen keyboard

| Button | Action |
|---|---|
| A | Type the selected key |
| Y | Delete |
| X | Space |
| L1 / R1 | Move the text cursor |
| Select | Shift (press twice for caps lock) |
| Start | Done |
| B | Cancel |

The cursor wraps from one end of a row to the other. Holding A on delete or the arrow keys repeats. A physical keyboard types straight into the box, and pasting works.

On a desktop, the keyboard works as a controller: arrow keys move, Enter is A, Escape or Backspace is B, X and Y are X and Y, Q and E are L1 and R1, Tab is Select and M is Start.

## Installing

1. Zip the contents of this folder so that `index.html` is at the top level of the zip.
2. On the console, open the frontend picker and install the zip.

Nova is installed by default, so you only need this after changing it.

## Developing

Nova runs in any desktop browser, using fake console data from `warp-mock.js`.

**With warpserve** (Windows), from `tools/warpserve` in this repository:

```
warpserve nova.zip
```

It opens Nova in a 720×720 window. Rebuild the zip and refresh to see changes.

**With any static server**, from this folder:

```
python3 -m http.server 8080
```

Then open <http://localhost:8080> and make the window square.

The folder holds copies of `warp.js` and `warp-mock.js` so this works on its own. On the console, the backend serves its own `warp.js` and an empty `warp-mock.js`, so those copies are never used there. Copy them again from `sdk/` after updating the library.

Accounts and messages connect to the real Rotur and OriginChats services, even on a desktop.

## Project layout

```
nova/
├── index.html          Markup for every screen and overlay
├── warp.json           Name, version and author shown in the frontend picker
├── warp.js             Copy of the Warpdrive library, for desktop use
├── warp-mock.js        Fake console data, for desktop use
├── css/
│   └── nova.css        All styles
├── js/
│   ├── core.js         Helpers, focus navigation, dialogs, keyboard, notifications
│   ├── settings.js     The Settings screen and its pages
│   ├── social.js       Rotur account, friends, presence and messages
│   ├── app.js          Status bar, Home, Apps, quick menu and button handling
│   └── vendor/         QR code and Rotur SDK libraries
└── assets/
    ├── icons/          Interface icons (SVG)
    ├── status/         Status bar icons (SVG)
    ├── buttons/        Controller button glyphs (SVG)
    └── sounds/         Interface sounds (WAV)
```

Scripts load in the order `core.js`, `settings.js`, `social.js`, `app.js`. They share one global scope, so later files use the helpers defined in `core.js` directly.

## How Nova works

### Screens

Each screen is a `<section class="screen">` in `index.html` with an entry in the `Screens` object. Only one is shown at a time. Switch with `go(id)`.

```js
Screens.example = {
  enter() {},           // the screen was opened
  leave() {},           // another screen was opened
  back() {},            // B was pressed. Return true if handled, or Nova goes Home
  shoulder(dir) {},     // L1 (-1) or R1 (1)
  prompts(el) {},       // button hints for the focused element, as [['a', 'Select'], ...]
  scroller() {},        // the element the right stick scrolls
};
```

All of these are optional.

Overlays such as dialogs, the keyboard and the quick menu are layers. `openLayer(el)` shows one on top and moves focus into it. `closeLayer(el)` hides it and puts focus back where it was.

### Focus navigation

Anything with a `data-nav` attribute can be selected with the controller. Nova picks the next element in the direction pressed, preferring elements in line with the current one.

| Attribute | Effect |
|---|---|
| `data-nav` | Can be selected. |
| `data-zone` | Groups elements into a panel. Up and down stay inside a panel when they can, and each panel remembers its last selected element. |
| `data-enter="first"` | Entering this panel from the side selects its first visible element. |
| `data-autofocus` | Selected first when the screen opens. |
| `data-nav-up`, `-down`, `-left`, `-right` | Overrides a direction with a CSS selector. A comma-separated list uses the first match on screen. |
| `data-repeat` | Holding A repeats the click. |

Selecting an element fires a `navfocus` event on it, and leaving it fires `navleave` with the direction in `event.detail`.

To select an element from code, use `focus(el)`. Use `focus(el, true)` to skip the sound and vibration.

### Binding elements to the console

`bind(root)` connects elements inside `root` to Warpdrive points and returns a function that disconnects them. Screens and settings pages call it when they open and the returned function when they close, so nothing is watched while it's off screen.

| Attribute | Effect |
|---|---|
| `data-bind="path"` | Shows the value as text. Format it with `data-fmt`. |
| `data-toggle="path"` | An on/off switch for a bool point. |
| `data-slider="path"` | A 0 to 1 slider. Needs a `.track` with a `<b>` inside, and an `<em>` for the label. |
| `data-call="path"` | Runs an action on click. |
| `data-meter="path"` | Sets the width of the inner `<b>` to the value. |
| `data-graph="path"` | Draws a live line graph of the value. |
| `data-choice="path"` | A row of options. List them in `data-options` (`a,b,c`) or name a point that lists them. `data-suffix` is added after numbers. |
| `data-pref="key"` or `data-pref="key=value"` | Toggles or sets a Nova preference. |

A path can read one field of an object point with a colon, for example `system.wifi.details:band`.

Formats for `data-fmt`: `text`, `pct`, `cap`, `dur`, `gb`, `temp`, `volt`, `amp`, `watt`, `dbm`, `mbps`, `mhz`, `hz`, `rpm`, `lux`, `mah`, `ghz`, `list`, `yes`, `onoff`, `ssid`, `sec`, `left`, `ram` and `res`. Add more to the `FMT` object in `core.js`.

### Helpers

| Helper | Use |
|---|---|
| `$(selector, root)`, `$$(selector, root)` | Find one element, or an array of them. |
| `h(tag, props, ...children)` | Create an element. Props starting with `on` add event listeners. |
| `icon(name)`, `setIcon(el, name)` | An icon from `assets/icons`, or `assets/status/...` with that prefix. |
| `dialog({ title, text, actions })` | A dialog. Resolves with the value of the chosen action, or null. |
| `askText({ title, text, value, secret, done, max })` | The on-screen keyboard. Resolves with the text, or null if cancelled. |
| `note({ title, text, bad })` | A notification in the corner. |
| `renderList(box, items, key, row, empty)` | Updates a list in place and keeps the selected row selected. |
| `Sound.play(name)` | Plays one of the interface sounds. |

```js
const name = await askText({ title: 'Rename', value: device.name, max: 40 });
if (name) await warp.call('system.bluetooth.rename', { address, name });
```

```js
const ok = await dialog({
  title: 'Forget this network?',
  actions: [['Cancel'], ['Forget', true]],
});
```

## Common changes

### Add a settings page

Add an entry to `PAGES` in `js/settings.js`, and its id to `CATEGORIES` if it should appear in the list on the left.

```js
example: {
  title: 'Example',
  icon: 'system',
  html: () => `
    ${T('Do Not Disturb', 'system.notifications.dnd')}
    ${SL('Volume', 'system.audio.volume')}
    ${H3('Performance')}
    ${SEG('system.performance.profile', 'system.performance.profiles')}
    ${ROW('Screen off after', 'ex-sleep', '<span data-bind="system.display.sleep_after" data-fmt="dur"></span>')}
    <div class="grid">${KV('Battery', 'system.battery.level', 'pct')}${KV('Temperature', 'system.battery.temperature', 'temp')}</div>`,
  init(el) {
    $('#ex-sleep', el).onclick = () => warp.set('system.display.sleep_after', 300).catch(fail);
  },
},
```

`html` returns the page's markup. `init` runs after the page is built and bound, for anything the attributes can't do. The builders at the top of `settings.js` make the standard rows:

| Builder | Makes |
|---|---|
| `T(label, path, sub)` | A switch for a bool point |
| `P(label, pref, sub)` | A switch for a Nova preference |
| `SL(label, path)` | A slider |
| `SEG(path, options, suffix)` | A row of options |
| `ROW(label, id, value, sub)` | A row that opens something. Handle its click in `init`. |
| `KV(label, path, format)` | A label and value, used inside `<div class="grid">` |
| `GRAPH(label, path, format)` | A live graph card |
| `H3(text)` | A section heading |

### Change the colours

Colours are CSS variables at the top of `css/nova.css`. The dark theme is the default, and `[data-theme="light"]` overrides it. The accent colour comes from the user's Theme setting. Its choices are in `ACCENTS` in `core.js`.

| Variable | Used for |
|---|---|
| `--bg` | Page background |
| `--surface`, `--surface-2`, `--surface-3` | Cards, rows and buttons, from lowest to highest |
| `--line` | Borders and dividers |
| `--text`, `--dim`, `--faint` | Text, from strongest to weakest |
| `--accent`, `--on-accent` | Selection and highlights, and text drawn on them |
| `--good`, `--bad` | Success and error colours |

### Icons and sounds

- **Icons:** add an SVG to `assets/icons` and use it by file name, without `.svg`. Icons are drawn as masks, so they take the text colour. Draw them in a single colour on a transparent background.
- **Sounds:** the names are `move`, `select`, `back`, `toggle`, `notify`, `error` and `startup`. Replace a file in `assets/sounds` with your own WAV of the same name.

## Accounts and messages

Nova links a [Rotur](https://rotur.dev) account by showing a QR code. Scanning it on a phone approves the console and gives Nova a token limited to these permissions:

```
account:view  account:profile  friends:view  friends:request  friends:accept
friends:remove  friends:cancel  validators:generate  signing:private
```

`signing:private` lets Nova sign messages, so other people can tell they really came from you. It's requested by default. Older tokens without the current permissions are dropped, and the user is asked to link again.

Messages use [OriginChats](https://originchats.com) at `wss://dms.originchats.com`:

- History loads 100 messages at a time, as you scroll up or press "Load older messages".
- Messages are cached on the console in IndexedDB, so chats open instantly and work offline.
- Messages typed while disconnected are sent once the connection is back.
- Encryption can be turned on per chat. Encrypted messages carry a copy for each person, sealed with their Rotur key, and show as "Encrypted message" in other clients.

## Stored data

Everything Nova keeps is in the console's WebView storage.

| Key | Holds |
|---|---|
| `nova.prefs` | Theme, accent, sounds, reduced motion and message signing |
| `nova.rotur.token`, `nova.rotur.user`, `nova.rotur.grants` | The linked account and the permissions it was granted |
| `nova.rotur.secure` | `0` if the user chose not to give Nova signing access |
| `nova.rotur.queryauth` | Set if the network blocks the Authorization header, so the token goes in the URL instead |
| `nova.chats.read` | Which messages have been read |
| `nova.e2e`, `nova.e2e.off` | Which chats are encrypted |
| IndexedDB `nova-chats` | Cached message history |

Signing out of Rotur removes the token and account details. Clearing the console's app data removes everything.

## Troubleshooting

**A red box says "Nova could not start".** A script failed while starting. The box shows the error with its file and line.

**Something stopped working after starting.** Open Settings, then System, then Error log. Nova sends every script error to the backend's log.

**Friends or messages don't load.** Sign out under Settings, then Account, and link again. Rotur changes its permissions from time to time, and an old token can stop working.

**Nothing happens in a desktop browser.** Make sure `warp.js` and `warp-mock.js` are next to `index.html`, and that you're opening it through a server rather than straight from the file.

## Licenses

`js/vendor/qrcode.js` and `js/vendor/rotur-sdk.js` are third-party libraries under the MIT license. Their notices are in `js/vendor/LICENSES.txt`.
