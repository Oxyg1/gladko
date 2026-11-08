# Гладко / Gladko

[![CI](https://github.com/Oxyg1/gladko/actions/workflows/ci.yml/badge.svg)](https://github.com/Oxyg1/gladko/actions)

Проверка орфографии и грамматики в полях ввода (LanguageTool). Firefox (MV2) и Chrome (MV3) собираются из одного кода.

```bash
npm install          # web-ext для линтера
npm test             # юнит-тесты
npm run build        # dist/firefox, dist/chrome и zip-архивы
npm run lint:firefox
npm run e2e          # сквозной тест в настоящем Chromium (нужен: npm i --no-save playwright)
node scripts/screenshots.mjs ru   # скриншоты для магазинов → store/screenshots
```

Структура: `src/` — общий код, `manifests/` — манифесты Firefox и Chrome, `scripts/build.mjs` — сборка, `test/` — тесты, `store/` — тексты и материалы для AMO и Chrome Web Store.

Возможности: проверка по абзацам с кэшем, очередь запросов под лимиты публичного API, «Исправить всё», горячие клавиши (Alt+Shift+F/N/P), пауза и отключение по сайтам, проверка выделенного из контекстного меню, личный словарь с импортом/экспортом, LanguageTool Premium, строгий режим, интерфейс ru/en.

## Лицензия

MIT — см. [LICENSE](LICENSE).

Политика конфиденциальности: [store/PRIVACY_POLICY.md](store/PRIVACY_POLICY.md)
