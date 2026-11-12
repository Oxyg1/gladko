# Сборка из исходников / Build instructions (for AMO reviewers)

The extension has **no minification, transpiling or bundling**. Every file under `src/` is shipped as-is.
The build script only (1) copies `src/` to `dist/firefox`, (2) writes `manifest.json` from `manifests/firefox.json`
adding the `version` from `package.json`, and (3) zips the result.

## Requirements
- OS: Linux or macOS (any system with a `zip` command-line tool). Tested on Ubuntu 24.04.
- Node.js **22.x** and npm 10.x (https://nodejs.org). No other tools are required to build.
- `zip` (on Ubuntu: `sudo apt-get install zip`).

## Steps
```bash
unzip gladko-source-0.7.0.zip -d gladko && cd gladko
node scripts/build.mjs
```
The Firefox package is created at `dist/gladko-firefox-0.7.0.zip` (the unpacked files are in `dist/firefox/`).
It is identical in content to the uploaded add-on. (A Chrome package, `dist/gladko-chrome-0.7.0.zip`, is built too; it is not part of this submission.)

`npm install` is **not** needed to build; it only installs `web-ext`, used for the optional lint step (`npm run lint:firefox`) and `playwright` for end-to-end tests.

## Layout
- `src/` — all extension code (`background.js`, `content.js`, `content.css`, `options.*`, `lib.js`, `polyfill.js`, `_locales/`, `icons/`).
- `manifests/firefox.json` — Firefox manifest template.
- `scripts/build.mjs` — the build script (about 30 lines).
- `test/` — unit and end-to-end tests (not shipped).
- No third-party JavaScript libraries are bundled. `src/icons.js` contains SVG path data for 36 icons copied unmodified from
  Lucide v0.460.0 (`lucide-static` npm package, `icons/*.svg`, ISC license, see THIRD_PARTY_LICENSES.md); the icon name is noted next to each entry.
