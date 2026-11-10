# Firefox (AMO) — обновление до 0.7.0

Файл: `dist/gladko-firefox-0.7.0.zip`. Исходники: архив проекта (см. BUILD.md), на вопрос о генераторах кода — «Да».

**Что нового (Release notes):**
RU: Новое меню по клику на значок, полностью переделанная страница настроек, страница приветствия с живым демо, тёмная тема, индикатор паузы на значке, статистика исправлений.
EN: New toolbar menu, redesigned settings page, welcome page with a live demo, dark theme, pause indicator on the toolbar icon, fix statistics.

**Notes to reviewer:**
- New permission: `alarms` — only to clear the toolbar badge when a pause ends.
- New pages: popup.html (toolbar menu), welcome.html (opened once on install via runtime.onInstalled; it includes content.js to show a live demo in its own textarea).
- Statistics (number of checks and fixes per day) are stored only in storage.local and never sent anywhere.
- Everything else as in 0.6.0: content script on <all_urls> attaches the checker to text fields; text is sent only to the LanguageTool server the user chose; no analytics, no remote code, no minification. Build steps: BUILD.md.
