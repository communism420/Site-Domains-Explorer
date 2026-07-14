# Contributing

Contributions that improve correctness, privacy, accessibility, localization, or domain discovery are welcome.

## Development

1. Fork and clone the repository.
2. Load the repository root as an unpacked extension at `chrome://extensions`.
3. Enable Developer mode and test changes on regular HTTP(S) pages.
4. Run `./build.ps1` in PowerShell before submitting a pull request.

Keep the extension's single purpose intact. Do not add analytics, remote code, telemetry, or permissions that are not strictly required. Any change to data processing or permissions must update `PRIVACY_POLICY.md` and `STORE_SUBMISSION.md`.

The extension version is intentionally locked at `1.0.0`. Do not change it without explicit repository-owner approval.
