# Contributing

Contributions that improve correctness, privacy, accessibility, localization, or domain discovery are welcome.

## Development

1. Fork and clone the repository.
2. Load the repository root in Chrome 121 or later at `chrome://extensions`.
3. Run `./build.ps1` in PowerShell to validate the source and create both browser packages.
4. In Firefox, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist/site-domains-explorer-firefox-1.0.1.zip`. The root `manifest.json` is also available for direct source testing.
5. Test consent, collection, popup, history, copying, deletion, and localization on regular HTTP(S) pages in both browser engines.
6. Run `git diff --check` and `./build.ps1` again after the final edit.

Keep the extension's single purpose intact. Do not add analytics, remote code, telemetry, or permissions that are not strictly required. Any change to behavior, browser support, data processing, or permissions must update the public `docs/` site and the relevant repository documentation, including `PRIVACY_POLICY.md`, `STORE_SUBMISSION.md`, and `FIREFOX_SUBMISSION.md`.

The cross-browser `manifest.json` and the dedicated `manifest.chromium.json` and `manifest.firefox.json` release manifests share the same product metadata and runtime entry points. `build.ps1` enforces their parity.

The extension version is intentionally locked at `1.0.1`. Do not change it without explicit repository-owner approval.
