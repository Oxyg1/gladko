# Chrome Web Store — что вставлять в форму

Файл для загрузки: `dist/gladko-chrome-0.7.0.zip` (после `npm run build`).
Регистрация разработчика: https://chrome.google.com/webstore/devconsole (разовый взнос $5).

## Store listing
**Название (из манифеста):** Гладко — проверка грамматики / Gladko — Grammar Checker
**Краткое описание (≤132):** Бесплатная проверка орфографии и грамматики в любых полях ввода на базе LanguageTool.
**Категория:** Productivity (или Tools) · **Язык:** Русский (добавьте English)

**Подробное описание (RU):**
Гладко подчёркивает ошибки в текстовых полях на любых сайтах и предлагает исправления в один клик.
• Орфография, грамматика, пунктуация и стиль — русский, английский, немецкий, украинский и другие языки
• Автоопределение языка, личный словарь с импортом и экспортом
• «Исправить всё» (Alt+Shift+F), переход к следующей ошибке (Alt+Shift+N), пауза на час (Alt+Shift+P)
• Проверка выделенного текста через контекстное меню
• Отключение на отдельных сайтах
• Работает с локальным сервером LanguageTool — тогда текст не покидает ваш компьютер
ВАЖНО: по умолчанию введённый текст отправляется на сервер LanguageTool (api.languagetool.org) для проверки. Расширение ничего не собирает и не хранит.

**Description (EN):**
Gladko underlines mistakes in text fields on any site and fixes them in one click. Spelling, grammar, punctuation and style in many languages; automatic language detection; personal dictionary with import/export; "Fix all" (Alt+Shift+F), next issue (Alt+Shift+N), pause for an hour (Alt+Shift+P); check selected text from the context menu; per-site disable. Works with a local LanguageTool server, so your text never leaves your computer. NOTE: by default the text is sent to LanguageTool (api.languagetool.org) for checking. The extension collects and stores nothing.

**Графика:** значок 128×128 — `src/icons/icon-128.png`; скриншоты 1280×800 — `store/screenshots/ru-1…5.png` и `en-1…5.png` (пересобрать: `npm run store-shots`), нужен минимум 1; малая промо-плитка 440×280 — `store/promo-440x280.png`.

## Privacy practices (вкладка «Конфиденциальность»)
**Single purpose:** Check spelling and grammar of text typed into text fields and offer corrections.

**Permission justifications:**
- `storage` — save settings, personal dictionary, list of disabled sites, local usage counters.
- `alarms` — clear the toolbar badge when a user-set pause ends.
- `contextMenus` — "Check selected text" menu item.
- Host `https://api.languagetool.org/*`, `https://api.languagetoolplus.com/*` — send the text to be checked to the LanguageTool servers chosen by the user.
- Host `http://localhost:8081/*`, `http://127.0.0.1:8081/*` — optional local LanguageTool server (keeps text on the user's computer).
- Optional hosts `http://*/*`, `https://*/*` — requested at runtime only for a custom LanguageTool server address the user types in settings.
- Content script on all sites — attaches underlines and correction popups to any text field (textarea, input, contenteditable) on any website; this is the extension's core function.

**Remote code:** No. **Data usage:** tick "Website content" (text typed by the user is sent to the check server). Certify: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness/lending.
**Privacy policy URL:** опубликуйте `store/PRIVACY_POLICY.md` (GitHub Pages / Gist / любая страница) и вставьте ссылку.

## Заметки
- Из-за доступа ко всем сайтам Google может проверять дольше обычного (несколько дней). Это нормально.
- При первой подаче Chrome присвоит расширению свой ID; ключ в manifest.json добавлять не нужно.
- Для обновления: поднимите `version` в `package.json`, `npm run build`, загрузите новый zip.
