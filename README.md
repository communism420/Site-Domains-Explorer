# Site Domains Explorer

Site Domains Explorer is a fully open-source cross-browser WebExtension for Chromium and Firefox. It shows the first-party and third-party hostnames used by the current website, monitors network activity in near real time, stores only hostname-level history locally, and lets users search, inspect, categorize, copy, and delete the results.

Current release: **1.0.1**.

![Site history](store-assets/screenshot-history-en-1280x800.png)

## Website

- [Project website](https://communism420.github.io/Site-Domains-Explorer/)
- [Published Privacy Policy](https://communism420.github.io/Site-Domains-Explorer/privacy.html)

## Features

- Near-real-time hostname discovery with the WebExtensions `webRequest.onBeforeRequest` API.
- Resource Timing, DOM, stylesheet, mutation, SPA, and hash-navigation scanning.
- Packaged observers for fetch, XMLHttpRequest, Beacon, WebSocket, EventSource, Worker, Service Worker registration, and WebTransport destinations.
- First-party and third-party categorization for the current site and saved history.
- Copy controls for own, third-party, or all domains.
- Searchable, expandable history stored in the browser's local extension storage.
- Explicit opt-in collection, local-only data, and one-click history deletion.
- English, Spanish, German, Portuguese (Brazil), Russian, Ukrainian, and French interfaces.
- Cross-browser Manifest V3 with no analytics, telemetry, remote code, or external backend.

## Browser Support

- Chrome and Chromium-based browsers version 102 or later for release packages.
- Chrome 121 or later when loading the cross-browser repository root directly.
- Firefox for desktop version 140 or later.
- Firefox for Android version 142 or later.

## Privacy

Collection is disabled until the user accepts the in-product disclosure. The extension extracts and saves hostnames, visit timestamps, and visit counts. It does not persist full URLs, paths, query strings, page content, cookies, credentials, request bodies, response bodies, form values, or clipboard contents.

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) and [OPEN_SOURCE_POLICY.md](OPEN_SOURCE_POLICY.md) for the complete disclosures.

## Install From Source

### Chromium

1. Clone this repository.
2. Open `chrome://extensions` in Chrome or another Chromium browser.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository root.
5. Review the privacy disclosure and explicitly enable collection.

### Firefox

1. Clone this repository and run `./build.ps1` from PowerShell.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Select **Load Temporary Add-on**.
4. Choose `dist/site-domains-explorer-firefox-1.0.1.zip`. For direct source testing, the root `manifest.json` is also supported.
5. Review the privacy disclosure and explicitly enable collection.

Temporary Firefox installations are removed when Firefox closes. The same ZIP is ready for validation and signing through Firefox Add-ons.

The cross-browser root manifest contains both background declarations. Firefox uses `background.scripts`; Chromium 121 and later use `background.service_worker`. Store packages use dedicated manifests without the other browser's background declaration.

## Manifest Layout

- `manifest.json`: cross-browser development manifest for direct source testing.
- `manifest.chromium.json`: Chromium release manifest used only by `build.ps1`.
- `manifest.firefox.json`: Firefox release manifest with the Gecko ID and Mozilla data-collection declaration.

## Build

Run the production validation and packaging script from PowerShell:

```powershell
./build.ps1
```

Two validated release archives are created in `dist/`:

- `site-domains-explorer-1.0.1.zip` for Chromium and the Chrome Web Store;
- `site-domains-explorer-firefox-1.0.1.zip` for Firefox Add-ons.

Version `1.0.1` is intentionally locked in the build script and must not be changed without explicit repository-owner approval.

The build validates manifest parity, permissions, JavaScript syntax, cross-browser API startup, localization keys, icon dimensions, ZIP contents, and the version lock before writing either archive.

Store submission notes are available in [STORE_SUBMISSION.md](STORE_SUBMISSION.md) for Chrome Web Store and [FIREFOX_SUBMISSION.md](FIREFOX_SUBMISSION.md) for Firefox Add-ons.

## Permissions

- `storage`: keeps consent, language, and hostname history locally.
- `webRequest`: observes request destinations without blocking or modifying traffic.
- `webNavigation`: associates regular, SPA, and fragment navigation with the correct site.
- `http://*/*` and `https://*/*`: enables the extension's core hostname-discovery function on sites selected by the user.

## Русский

Site Domains Explorer полностью открыт под лицензией MIT и поддерживает Chromium и Firefox. Расширение определяет собственные и сторонние hostname посещаемых сайтов почти в реальном времени, сохраняет данные только локально и начинает сбор исключительно после явного согласия пользователя.

Для Chromium откройте `chrome://extensions`, включите режим разработчика, нажмите **Загрузить распакованное расширение** и выберите корень репозитория. Для Firefox выполните `./build.ps1`, откройте `about:debugging#/runtime/this-firefox`, нажмите **Загрузить временное дополнение** и выберите `dist/site-domains-explorer-firefox-1.0.1.zip`. Для прямого тестирования исходников также поддерживается корневой `manifest.json`.

Корневой manifest содержит оба варианта background-контекста. Публикуемые ZIP используют отдельные manifests без лишних платформенных полей.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security, privacy, permission, and data-processing changes must remain transparent and documented.

## License

Released under the [MIT License](LICENSE).
