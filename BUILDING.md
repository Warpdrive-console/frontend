# Building Nova

Nova is a Preact + TypeScript frontend built with Vite. The SDK documentation in
[`README.md`](./README.md) covers `warp.js` and the points the console exposes;
this file covers the checkout itself.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 7)
- npm
- `zip`, for packaging `nova.zip` (the build still writes `dist/` without it)

## Commands

```sh
npm install       # install dependencies
npm run dev       # dev server at http://localhost:5173, uses config.dev.json
npm run check     # typecheck and oxlint
npm run build     # check, build dist/, then write nova.zip
npm run preview   # serve the built dist/
```

`npm run build` runs `npm run check` first, so type or lint errors fail the build.

## Configuration

The API endpoints are compiled into the bundle from one of two files:

| File | Used by | Purpose |
| --- | --- | --- |
| `config.json` | `npm run build` | Production API |
| `config.dev.json` | `npm run dev` | Local backend on `localhost:6969` |

Both have the same shape:

```json
{
  "api": "https://api.warpdrive.team",
  "roturApi": "https://api.rotur.dev",
  "roturAppId": "app_3592befa894c33da"
}
```

- `api` is the Warpdrive backend.
- `roturApi` is the Rotur API used for accounts, chats and cosmetics.
- `roturAppId` is the public app ID. The matching app secret stays on the
  Warpdrive backend and must never be added here.

Values are injected at build time, so changing a config file means rebuilding.

## Output

The build writes static files to `dist/` and zips them to `nova.zip`:

```
dist/
  index.html
  assets/        bundled JS and CSS, plus the button and sound assets
  warp.js        SDK, used in the desktop browser via warp-mock.js
  warp-mock.js   fake console for development
  warp.json      frontend name and version
```

On a console the backend serves its own `warp.js`, so the copy in the zip is only
for local development. Upload `nova.zip` to the console to install the frontend.

## Layout

```
src/
  api/           backend, Rotur, chats, media and E2EE clients
  platform/      warp.js wrapper, sound, formatting, icons, sockets
  screens/       Home, Apps, Friends, Messages, Login and Settings pages
  state/         signals for navigation, input, preferences, dialogs and toasts
  styles/        global CSS
  ui/            shared controls and chrome
  app.tsx        app shell
  config.ts      reads the injected config
  main.tsx       entry point
public/          files copied as-is into the build
scripts/zip.mjs  packaging step
```

Routing is internal (no path router), and every control is reachable with the
D-pad, so screens must keep focus order in mind when adding new UI.

## Testing in a browser

`npm run dev` loads `public/warp.js` and `public/warp-mock.js`, which provide a
fake console with Wi-Fi networks, Bluetooth devices, battery, sensors and CPU
stats. The real backend serves an empty `warp-mock.js`, so the script tag can
stay in `index.html`.

Sign-in against the local backend needs it running on the `api` URL in
`config.dev.json`. Rotur features need network access to `roturApi`.
