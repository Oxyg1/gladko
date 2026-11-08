# Как помочь проекту

Спасибо, что хотите улучшить Гладко! Подойдут баг-репорты, идеи, переводы и код.

## Баги и идеи
Откройте [issue](https://github.com/Oxyg1/gladko/issues/new/choose). Для бага укажите браузер и версию, адрес страницы (если можно), что ожидали и что получили.

## Код
```bash
npm install
npm test            # юнит-тесты
npm run build       # dist/firefox и dist/chrome
npm run lint:firefox
npm run e2e         # нужен: npm i --no-save playwright
```
1. Форкните репозиторий и создайте ветку от `main`.
2. Общий код живёт в `src/`; различия между браузерами — только в `manifests/`.
3. Любая новая строка интерфейса добавляется в оба файла `src/_locales/*/messages.json`.
4. Чистую логику выносите в `src/lib.js` и покрывайте тестами в `test/`.
5. Перед PR запустите `npm test`, `npm run build` и `npm run lint:firefox`.

## Переводы
Скопируйте `src/_locales/en/messages.json` в `src/_locales/<код языка>/messages.json` и переведите поле `message`. Ключи и `placeholders` не меняйте.

## Приватность
Расширение не должно собирать данные, добавлять аналитику или удалённый код. Изменения, которые отправляют текст куда-то ещё, должны быть явно описаны в [политике конфиденциальности](store/PRIVACY_POLICY.md).
