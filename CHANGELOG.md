# Changelog

## 0.2.0 — 2026-11-12

First public release of the standalone native gateway middleware.

- Normalize Chat video attachments before routing and preserve their MIME type.
- Infer audio encoding from the actual candidate model name, including renamed providers.
- Preserve the original input for independent provider attempts.
- Provide optional model scope and provider-profile overrides.
- Reject known unsupported audio-document and non-streaming routes explicitly.
- Preserve reasoning settings, explicit modalities, images, PDFs and compatible sampling hints.
- Include 33 regression tests and document the live-validation and runtime limits.

The repository contains no user configuration, credentials, call history or media fixtures from the live checks.
