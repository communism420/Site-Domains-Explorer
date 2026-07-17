# Open Source Policy

Site Domains Explorer is fully open-source software.

## Scope

The complete source needed to inspect, build, and run the extension is published at:

https://github.com/communism420/Site-Domains-Explorer

This includes the cross-browser development manifest, dedicated Chromium and Firefox Manifest V3 release configurations, background service worker and event page, content scripts, packaged page observer, popup and history interfaces, privacy controls, localizations, icons, automated platform smoke tests, store assets, documentation, and release build script. The distributed extension has no proprietary runtime components, remotely hosted code, private configuration, analytics SDK, or external data service.

## License

Unless a file explicitly states otherwise, the repository is licensed under the MIT License. Users may inspect, use, copy, modify, distribute, sublicense, and sell copies under the terms in `LICENSE`.

## Builds

Release archives are produced from the public repository with `build.ps1`. The script validates all three manifests, permissions, JavaScript syntax, cross-browser background startup, localization parity, icon dimensions, package contents, and the intentionally locked extension version before creating separate Chromium and Firefox ZIP files for version `1.0.1`.

## Transparency

Changes to data processing, permissions, network behavior, or external dependencies must be reflected in the source code, privacy policy, and relevant browser-store disclosures. No production behavior may depend on unpublished code.
