# Firefox (AMO) — обновление до 0.6.0

Файл: `dist/gladko-firefox-0.6.0.zip`. На addons.mozilla.org откройте своё расширение → «Загрузить новую версию».
Исходники прикладывать не нужно: минификации и сборщиков нет (скрипт сборки только копирует файлы и подставляет manifest).
Но если AMO спросит про «генераторы кода» — ответьте «Да» и приложите архив проекта (`git archive` или zip папки gladko без node_modules и dist): в `scripts/build.mjs` манифест генерируется из шаблона. Это самый безопасный вариант.

**Что нового (Release notes):**
RU: Проверка по абзацам с кэшем и очередью запросов, «Исправить всё» и горячие клавиши, пауза и отключение на сайте, проверка выделенного текста, импорт/экспорт словаря, поддержка LanguageTool Premium, строгий режим, интерфейс на русском и английском.
EN: Per-paragraph checking with cache and request queue, "Fix all" and hotkeys, pause and per-site disable, check selected text, dictionary import/export, LanguageTool Premium support, picky mode, Russian and English UI.

**Notes to reviewer:**
- Content script on <all_urls> (all_frames) attaches the checker to any text field; it needs to work on any site.
- Text from the focused field is sent by background.js to LanguageTool (api.languagetool.org, api.languagetoolplus.com, localhost:8081 or a user-specified endpoint, for which access is requested at runtime via permissions.request on a click). Declared via data_collection_permissions: websiteContent. No analytics, no remote code.
- No minification or bundling. Chrome and Firefox builds are produced by scripts/build.mjs from the same src/ directory; only manifest.json differs.
- New permission: contextMenus (the "Check selected text" item).
