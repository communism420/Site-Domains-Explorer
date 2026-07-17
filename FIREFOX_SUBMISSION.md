# Подготовка Site Domains Explorer к Firefox Add-ons

Этот файл содержит готовые материалы для публикации на Mozilla Add-ons (AMO). Для отправки используйте пакет `dist/site-domains-explorer-firefox-1.0.1.zip`. Версия расширения зафиксирована на `1.0.1` и не должна меняться без явного разрешения владельца проекта.

## Совместимость

- Firefox для компьютеров: версия 140.0 или новее.
- Firefox для Android: версия 142.0 или новее.
- Manifest Version 3.
- Идентификатор дополнения: `site-domains-explorer@communism420.github.io`.
- Background-контекст: непостоянная event page, совместимая с Firefox MV3.

## Поля карточки AMO

- Название: `Site Domains Explorer`.
- URL дополнения: `site-domains-explorer`.
- Экспериментальное дополнение: нет.
- Платные функции, внешнее платное ПО или оборудование: нет.
- Категории: **Веб-разработка** и **Приватность и защита**.
- Сайт поддержки: `https://github.com/communism420/Site-Domains-Explorer/issues`.
- Email поддержки: укажите действующий публичный адрес поддержки.
- Лицензия: **MIT License**.
- Политика приватности: да; используйте `https://communism420.github.io/Site-Domains-Explorer/privacy.html` и английскую часть `PRIVACY_POLICY.md`.
- Требуется отдельная отправка исходного кода: нет. Отправляемые HTML, CSS и JavaScript читаемы, не минифицированы и не генерируются сборщиком.

## Краткое описание

Find first- and third-party hostnames used by websites, inspect local history, and copy categorized domain lists.

## Полное описание

Site Domains Explorer shows in near real time which hostnames a website uses while it loads. It combines browser network events, a packaged network API observer, resource timing, and page resource attributes to find first-party subdomains and third-party services such as APIs, CDNs, scripts, images, fonts, frames, WebSockets, and trackers.

Results are organized by visited site and stored only in the local browser profile. Open popup and history views update automatically as new hostnames are observed. The popup shows the current site's domains and can copy first-party, third-party, or all domains. The all-sites page provides searchable history, expandable categorized domain groups, per-site copy controls, and deletion with confirmation.

Automatic collection is disabled until the user accepts a clear first-run disclosure. It can be disabled later from Privacy and data collection. The extension has no analytics, advertising, account system, remote code, or external data server.

The extension is fully open source under the MIT License. Its complete production source and reproducible build script are published at https://github.com/communism420/Site-Domains-Explorer.

Supported interface languages: English, Spanish, German, Portuguese (Brazil), Russian, Ukrainian, and French.

## Обоснование разрешений

### storage

Stores discovered hostnames, their site grouping, last-visit timestamp, visit count, interface language, and the user's collection consent in the WebExtensions `storage.local` area. The extension does not use cloud storage or transmit these records.

### webRequest

Observes HTTP(S) requests as they start and extracts only each request's hostname. This is required to identify dynamic APIs, scripts, images, fonts, frames, CDNs, trackers, and other network resources with minimal delay. The extension does not block, redirect, or modify requests.

### webNavigation

Detects top-level and single-page-application navigation so discovered hostnames are associated with the correct visited site and visit metadata remains accurate.

### Host permissions: http://*/* and https://*/*

The extension's single purpose requires discovering hostnames on any HTTP(S) website the user chooses to visit and in resources loaded by that site. Access is used only after explicit in-product consent and only to extract hostnames locally.

## Данные и приватность

- В Firefox manifest указано `data_collection_permissions.required: ["none"]`: дополнение не собирает и не передаёт данные за пределы дополнения или локального браузера.
- Адреса посещённых страниц и ресурсов обрабатываются локально только для извлечения hostname.
- Сохраняются hostname, группировка по сайту, время последнего визита, счётчик посещений, язык интерфейса и настройка согласия.
- Не сохраняются полные URL, пути, параметры запросов, содержимое страниц, тела запросов и ответов, cookies, учётные данные или содержимое буфера обмена.
- Аналитики, рекламы, удалённого кода и внешнего сервера данных нет.
- Приватные окна отключены через `incognito: "not_allowed"`.
- Политика конфиденциальности: `https://communism420.github.io/Site-Domains-Explorer/privacy.html`.

## Примечание для рецензента

No account, login, payment, or external service is required.

Testing steps:

1. Install the extension in a fresh Firefox profile. The packaged onboarding page opens automatically.
2. Select the consent checkbox and press **Allow domain collection**.
3. Open any regular HTTP(S) website and then open the toolbar popup.
4. The popup shows first-party and third-party hostnames as they are discovered.
5. Use **All sites** to inspect searchable local history and categorized per-site domain lists.
6. Open **Privacy and data collection** to disable collection or delete all saved history.

All submitted JavaScript, HTML, and CSS files are readable and unminified. There are no third-party runtime libraries, generated bundles, remote scripts, analytics SDKs, or external configuration files. No compilation step is required for review. `build.ps1` only validates the source and packages browser-specific manifests with the same runtime files.

`background.js` observes request destinations without blocking or modifying traffic. `page-observer.js` runs in the page's main world only to report destination hostnames passed to network APIs; it cannot access WebExtension APIs and does not inspect payloads or responses.

Source code: https://github.com/communism420/Site-Domains-Explorer

Privacy policy: https://communism420.github.io/Site-Domains-Explorer/privacy.html

## Проверка перед отправкой

1. Выполните `./build.ps1` и убедитесь, что созданы оба ZIP-пакета без изменения версии `1.0.1`.
2. Запустите `npx --yes web-ext@latest lint --source-dir <распакованный Firefox ZIP> --warnings-as-errors`.
3. Загрузите на AMO именно `dist/site-domains-explorer-firefox-1.0.1.zip`; `manifest.json` должен находиться в корне архива.
4. Выберите поддержку Firefox для компьютеров и Firefox для Android.
5. Укажите опубликованную Privacy Policy URL и реальный контакт поддержки.
6. На вопрос об отдельном исходном архиве выберите **Нет**: отправляемый пакет уже содержит читаемые исходные runtime-файлы без минификации, транспиляции или bundling. Если AMO всё же запросит исходники отдельно, укажите публичный репозиторий и приложите исходный архив с `build.ps1`.
7. Проверьте чистую установку: до согласия сбор выключен; после согласия hostname появляются; отключение останавливает сбор; удаление полностью очищает историю.
8. Проверьте popup, страницу истории и настройки на всех семи языках, а также на узком экране Firefox для Android.
9. Не добавляйте новые разрешения, удалённый код, аналитику или передачу данных без пересмотра manifest, раскрытия и политики конфиденциальности.

## Примечание о рассмотрении

Проверки и прозрачные декларации уменьшают риск отклонения, но окончательное решение о подписи и публикации принимает Mozilla Add-ons. Одобрение нельзя гарантировать до завершения фактической проверки.
