# Подготовка Site Domains Explorer к Chrome Web Store

Этот файл содержит готовые формулировки для Developer Dashboard. Используйте опубликованную политику по адресу `https://communism420.github.io/Site-Domains-Explorer/privacy.html` и укажите реальный контакт поддержки.

## Единственная цель

**English:** Site Domains Explorer identifies and locally organizes the first-party and third-party hostnames used by websites the user visits.

**Русский:** Site Domains Explorer определяет и локально систематизирует собственные и сторонние hostname, используемые посещаемыми пользователем сайтами.

## Обоснование разрешений

Вставьте эти формулировки в раздел Privacy practices:

### storage

Stores discovered hostnames, their site grouping, last-visit timestamp, visit count, interface language, and the user's collection consent in `chrome.storage.local`. The extension does not use cloud storage or transmit these records.

### webRequest

Observes HTTP(S) requests as they start and extracts only each request's hostname. This is required to identify dynamic APIs, scripts, images, fonts, frames, CDNs, trackers, and other network resources with minimal delay. The extension does not block, redirect, or modify requests.

### webNavigation

Detects top-level and single-page-application navigation so discovered hostnames are associated with the correct visited site and visit metadata remains accurate.

### Host permissions: http://*/* and https://*/*

The extension's single purpose requires discovering hostnames on any HTTP(S) website the user chooses to visit and in resources loaded by that site. Access is used only after explicit in-product consent and only to extract hostnames locally.

## Privacy practices

- Data category: select **Web history**. The extension processes visited site addresses and network resource addresses to extract hostnames.
- Data category: also select **Website content** if the dashboard definition shown during submission includes links or URL-bearing DOM attributes; the extension scans those attributes but stores only extracted hostnames.
- Do not select personally identifiable information, health, financial, authentication, communications, location, or clipboard data: the extension does not collect them.
- Data usage: extension functionality only.
- Data sale or transfer: no.
- Advertising, profiling, lending, or unrelated purposes: no.
- Remote code: no. All JavaScript, including the packaged page-world network API observer, is included in the submitted package and the CSP permits scripts only from the extension itself.
- Open source: the complete extension source and reproducible build script are published under the MIT License at https://github.com/communism420/Site-Domains-Explorer.
- Limited Use certification: certify only if the published policy and submitted build remain consistent with these statements.

## Краткое описание

Find first-party and third-party domains used by websites, review local history, search results, and copy domain lists.

## Полное описание

Site Domains Explorer shows in near real time which hostnames a website uses while it loads. It combines browser network events, a packaged network API observer, resource timing, and page resource attributes to find first-party subdomains and third-party services such as APIs, CDNs, scripts, images, fonts, frames, WebSockets, and trackers.

Results are organized by visited site and stored only in the local Chrome profile. Open popup and history views update automatically as new hostnames are observed. The popup shows the current site's domains and can copy own, third-party, or all domains. The all-sites page provides searchable history, expandable domain groups, per-site copy controls, and deletion with confirmation.

Automatic collection is disabled until the user accepts a clear first-run disclosure. It can be disabled later from Privacy and data collection. The extension has no analytics, advertising, account system, remote code, or external data server.

The extension is fully open source under the MIT License. Its complete production source and build script are published at https://github.com/communism420/Site-Domains-Explorer.

Supported interface languages: English, Spanish, German, Portuguese (Brazil), Russian, Ukrainian, and French.

## Проверка перед отправкой

1. Загрузите `dist/site-domains-explorer-1.0.0.zip`; `manifest.json` должен лежать в корне архива.
2. Укажите `https://communism420.github.io/Site-Domains-Explorer/privacy.html` как Privacy Policy URL в Developer Dashboard.
3. Укажите рабочий email и URL поддержки; текст политики должен ссылаться на тот же канал связи.
4. Загрузите иконку `icons/icon-128.png` и подготовленный английский скриншот `store-assets/screenshot-history-en-1280x800.png`. Русский вариант находится в `store-assets/screenshot-history-1280x800.png`.
5. Включите двухэтапную аутентификацию аккаунта разработчика.
6. Пройдите сценарий чистой установки: до согласия история не появляется; после согласия обычная HTTP(S)-страница начинает собираться; отключение останавливает новый сбор; удаление очищает историю.
7. Проверьте popup и страницу истории на всех семи языках, особенно длинные немецкие и французские подписи.
8. Не добавляйте CDN-скрипты, удалённую конфигурацию, аналитику или новые разрешения без обновления раскрытия и политики.

## Примечание о рассмотрении

Техническая подготовка и прозрачные декларации снижают риск отклонения, но решение о публикации всегда принимает команда Chrome Web Store. Нельзя обещать или гарантировать одобрение до фактической проверки.
