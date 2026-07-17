# Site Domains Explorer Privacy Policy

Effective date: July 17, 2026

Applies to extension version: 1.0.1

Site Domains Explorer is a browser extension for Chromium-based browsers and Firefox that identifies first-party and third-party hostnames used by websites. This policy describes exactly what the extension processes, why it is needed, and how users control it.

## Data processed and stored

After the user gives explicit consent, the extension processes website and network addresses locally to extract hostname values such as `example.com` or `cdn.example.com`. It stores only:

- the main hostname used to group a visited site;
- unique hostnames found in page resource URLs, network requests, and URL-bearing page attributes;
- the timestamp of the last visit;
- the number of visits;
- the selected interface language; and
- the user's data-collection consent setting.

The extension does not save page text, images, full URLs, paths, query strings, request or response bodies, cookies, credentials, form values, personal communications, or clipboard contents. Full request and page URLs may be handled briefly in the browser only to extract their hostname and are not persisted.

## Purpose

The stored hostnames are used only to show, with near-real-time local updates, which first-party and third-party domains a visited website uses, provide local search and history, and let the user copy selected hostname lists.

## Local storage and retention

All saved data is kept in the WebExtensions `storage.local` area in the user's local browser profile. Site Domains Explorer has no analytics, advertising, telemetry, account system, or external server. It does not transmit stored or processed browsing data off the user's device.

History remains until the user deletes it from the popup or history page, clears extension storage, or uninstalls the extension. Disabling future collection does not automatically delete existing history, so the user can review or remove it separately.

## Sharing and sale

Site Domains Explorer does not sell, rent, share, disclose, or transfer user data to third parties. User data is not used for advertising, profiling, credit decisions, or any purpose unrelated to the extension's single purpose.

## Permissions

- `storage` stores domain history, language, and consent locally.
- `webRequest` observes HTTP(S) requests at the start of the request and extracts hostnames without changing or blocking traffic.
- `webNavigation` detects normal and single-page-application navigation so records stay associated with the correct site.
- Access to `http://*/*` and `https://*/*` is required because domain discovery is the extension's core function and must work on the sites the user visits and their resources.

Copying is initiated only when the user presses a copy button. The extension does not request clipboard permission and never reads the clipboard.

## User choices

Collection is disabled by default. The first-run disclosure requires an affirmative checkbox and button before collection starts. The user can later disable collection from **Privacy and data collection**, delete all history, or uninstall the extension.

The extension is not allowed to run in Incognito mode, so private browsing activity is not added to its saved history.

## Security

The extension uses Manifest V3 and contains no remotely hosted executable code. On Chromium, local storage access is explicitly restricted to trusted extension contexts when that browser API is available. A small packaged observer runs in the page's main JavaScript world so destinations passed to `fetch`, XMLHttpRequest, Beacon, WebSocket, EventSource, Worker, Service Worker registration, and WebTransport can be reported immediately. It has no access to WebExtension APIs, reports only destination hostnames while collection is enabled, does not read payloads or responses, and preserves the result of every observed call. The Firefox manifest declares that no data is collected or transmitted outside the extension or local browser.

## Open source

Site Domains Explorer is fully open source under the MIT License. The complete source code, build script, localizations, privacy controls, and documentation are publicly available at [github.com/communism420/Site-Domains-Explorer](https://github.com/communism420/Site-Domains-Explorer). The published repository is the source of truth for production builds; the extension has no proprietary runtime components or behavior that depends on unpublished code.

## Changes and contact

Material policy changes will be reflected in an updated policy and, when required, a new in-product disclosure. Privacy questions and support requests can be submitted through the relevant browser-store contact or the [public project issue tracker](https://github.com/communism420/Site-Domains-Explorer/issues). Do not include sensitive personal information in a public issue.

---

# Политика конфиденциальности Site Domains Explorer

Дата вступления в силу: 17 июля 2026 г.

Применяется к версии расширения: 1.0.1

Site Domains Explorer — расширение для Chromium-браузеров и Firefox, которое определяет собственные и сторонние имена хостов, используемые сайтами. Ниже описано, какие данные оно обрабатывает, зачем они нужны и как пользователь ими управляет.

## Обрабатываемые и сохраняемые данные

После явного согласия пользователя расширение локально обрабатывает адреса сайтов и сетевых запросов, чтобы извлечь имена хостов, например `example.com` или `cdn.example.com`. Сохраняются только:

- основной hostname для группировки посещённого сайта;
- уникальные hostname из URL ресурсов страницы, сетевых запросов и URL-атрибутов страницы;
- время последнего посещения;
- количество посещений;
- выбранный язык интерфейса; и
- настройка согласия на сбор данных.

Расширение не сохраняет текст и изображения страниц, полные URL, пути, параметры запросов, тела запросов и ответов, cookie, учётные данные, значения форм, личные сообщения или содержимое буфера обмена. Полные адреса страниц и запросов могут кратковременно обрабатываться в браузере только для извлечения hostname и не записываются в хранилище.

## Цель обработки

Сохранённые hostname используются только для показа почти в реальном времени собственных и сторонних доменов посещённого сайта, локального поиска и истории, а также копирования выбранных списков доменов по команде пользователя.

## Локальное хранение и срок хранения

Все данные хранятся в локальной области WebExtensions `storage.local` в профиле браузера пользователя. В Site Domains Explorer нет аналитики, рекламы, телеметрии, учётных записей или внешнего сервера. Расширение не отправляет обработанные или сохранённые данные о посещениях с устройства пользователя.

История хранится, пока пользователь не удалит её в popup или на странице истории, не очистит хранилище расширения либо не удалит расширение. Отключение дальнейшего сбора не удаляет существующую историю автоматически.

## Передача и продажа

Site Domains Explorer не продаёт, не сдаёт в аренду, не раскрывает и не передаёт пользовательские данные третьим лицам. Данные не используются для рекламы, профилирования, кредитных решений или целей, не связанных с единственной функцией расширения.

## Разрешения

- `storage` сохраняет историю доменов, язык интерфейса и настройку согласия локально.
- `webRequest` наблюдает начало HTTP(S)-запросов и извлекает hostname, не изменяя и не блокируя трафик.
- `webNavigation` определяет обычную и SPA-навигацию, чтобы данные относились к правильному сайту.
- Доступ к `http://*/*` и `https://*/*` необходим, поскольку поиск доменов является основной функцией расширения и должен работать на посещаемых пользователем сайтах и их ресурсах.

Копирование запускается только после нажатия пользователем соответствующей кнопки. Расширение не запрашивает разрешение на буфер обмена и никогда не читает его содержимое.

## Выбор пользователя

По умолчанию сбор отключён. Перед началом сбора пользователь должен ознакомиться с раскрытием, установить флажок и нажать кнопку согласия. В дальнейшем сбор можно отключить в разделе **Конфиденциальность и сбор данных**, всю историю можно удалить, а расширение — деинсталлировать.

Расширение не разрешено запускать в режиме инкогнито, поэтому приватные посещения не добавляются в сохранённую историю.

## Безопасность

Расширение использует Manifest V3 и не содержит удалённо размещённого исполняемого кода. В Chromium доступ к локальному хранилищу явно ограничивается доверенными контекстами расширения, когда соответствующий API доступен. Небольшой упакованный наблюдатель работает в основном JavaScript-контексте страницы, чтобы сразу фиксировать hostname адресов, переданных в `fetch`, XMLHttpRequest, Beacon, WebSocket, EventSource, Worker, регистрацию Service Worker и WebTransport. Он не имеет доступа к WebExtension API, передаёт только hostname и только при включённом сборе, не читает содержимое запросов или ответов и сохраняет исходное поведение наблюдаемых вызовов. В Firefox manifest явно указывает, что данные не собираются и не передаются за пределы расширения или локального браузера.

## Открытый исходный код

Site Domains Explorer полностью открыт под лицензией MIT. Полный исходный код, сценарий сборки, локализации, средства управления конфиденциальностью и документация опубликованы по адресу [github.com/communism420/Site-Domains-Explorer](https://github.com/communism420/Site-Domains-Explorer). Публичный репозиторий является единственным источником производственных сборок; в расширении нет закрытых компонентов или поведения, зависящего от неопубликованного кода.

## Изменения и связь

Существенные изменения будут отражены в обновлённой политике и, когда это необходимо, в новом раскрытии внутри расширения. Вопросы о конфиденциальности и запросы поддержки можно направить через контакт в карточке соответствующего магазина или через [публичный трекер проекта](https://github.com/communism420/Site-Domains-Explorer/issues). Не публикуйте конфиденциальные персональные данные в открытом issue.
