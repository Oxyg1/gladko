<div align="center">

<img src="docs/img/banner-en.png" alt="Gladko — spelling and grammar check" width="100%">

[🇷🇺 Русский](README.md) · **🇬🇧 English**

[![CI](https://github.com/Oxyg1/gladko/actions/workflows/ci.yml/badge.svg)](https://github.com/Oxyg1/gladko/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.7.0-126067)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-126067)](LICENSE)
![Firefox MV2](https://img.shields.io/badge/Firefox-MV2-FF7139?logo=firefoxbrowser&logoColor=white)
![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)
[![Powered by LanguageTool](https://img.shields.io/badge/powered_by-LanguageTool-F2A45A)](https://languagetool.org)

</div>

**Gladko** underlines mistakes in any text field — email, chats, forms, editors — and fixes them in one click. It works with the public LanguageTool server or your own, in which case your text never leaves your computer.

<div align="center">
<img src="docs/img/en-2-suggestion.png" alt="Suggestion card" width="88%">
</div>

## ✨ Features

| | |
|---|---|
| 🔤 **Spelling, grammar, punctuation, style** | Russian, English, German, Ukrainian, French, Spanish and more; automatic language detection |
| ⚡ **Fast and rate-limit friendly** | per-paragraph checking with a cache — only the edited paragraph is re-sent; a request queue keeps you under public API limits |
| 🖱️ **One-click fixes** | suggestion card, "Ignore", "Add to dictionary", "Fix all" |
| ⌨️ **Hotkeys** | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fix all · <kbd>N</kbd> next issue · <kbd>P</kbd> pause for an hour |
| 🎯 **In your control** | pause, per-site disable, picky mode, check selected text from the context menu |
| 📚 **Personal dictionary** | import and export as a text file |
| 🔒 **Privacy** | no analytics, no servers of our own; local mode keeps text on your machine |
| 🌍 **UI languages** | Russian and English |

## 🎛️ Menu and settings

Click the toolbar icon for a quick menu: main switch, "check on this site", pause, server, language and today's stats. Full settings are organised into sections, in light and dark themes. A welcome page with a live demo opens after install.

<div align="center">
<img src="docs/img/ui-popup.png" alt="Toolbar menu" width="30%">&nbsp;
<img src="docs/img/ui-popup-dark.png" alt="Toolbar menu, dark theme" width="30%">
</div>

<details>
<summary><b>More screenshots</b></summary>
<img src="docs/img/ui-options.png" alt="Settings page" width="100%">
<br>
<img src="docs/img/en-1-underlines.png" alt="Underlined mistakes" width="100%">
<img src="docs/img/en-3-panel.png" alt="Issues panel" width="100%">
</details>

## 📦 Install

| Browser | How |
|---|---|
| **Firefox** | addons.mozilla.org listing — *in review*. For now, download `gladko-firefox-*.zip` from [Releases](https://github.com/Oxyg1/gladko/releases) |
| **Chrome / Edge / Brave** | Chrome Web Store — *coming soon*. For now, download `gladko-chrome-*.zip`, unzip, open `chrome://extensions`, enable Developer mode → Load unpacked |

## 🔧 Check servers

| Mode | What it is | Privacy |
|---|---|---|
| **Automatic** | your local server if running, otherwise the public one | depends |
| **Local** | `localhost:8081`, no limits | text stays on your computer |
| **Public** | `api.languagetool.org` | text is sent to LanguageTool; rate-limited |
| **Premium** | `api.languagetoolplus.com`, needs e-mail and API key | same as public, higher limits |
| **Custom** | any LanguageTool server; access is requested separately | up to you |

```bash
docker run -d --name languagetool -p 8081:8010 erikvl87/languagetool
```

## 🛠️ Development

```bash
git clone https://github.com/Oxyg1/gladko.git && cd gladko
npm install
npm test && npm run build && npm run lint:firefox
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Privacy policy: [store/PRIVACY_POLICY.md](store/PRIVACY_POLICY.md).

## 📄 License

[MIT](LICENSE). Spell and grammar checking by [LanguageTool](https://languagetool.org) (LGPL). Gladko is an independent project and is not affiliated with LanguageTool.
